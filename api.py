from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
import os
import json
import time
import hashlib
import asyncio

from dotenv import load_dotenv

load_dotenv()

from analytics import (
    load_and_process_experiment_results,
    load_multiple_experiment_files,
    SearchAnalytics,
)
from domain_utils import normalize_domain
from fanout import run_fanout_experiments
from chatgpt_search import run_chatgpt_fanout
from visibility_score import build_visibility_report
from quota_errors import QuotaExhaustedError

# Directory where live analysis experiment results are cached (per domain + prompts).
ANALYSIS_CACHE_DIR = os.path.join(".cache", "analysis")
ANALYSIS_CACHE_TTL_SECONDS = int(os.getenv("ANALYSIS_CACHE_TTL_SECONDS", str(24 * 3600)))
# ChatGPT + web_search (primary); Gemini grounding as fallback
FANOUT_VERSION = "v19-gpt4o-mini-flashlite"


def _experiments_have_signal(experiments: List[Dict[str, Any]]) -> bool:
    """True if any subquery returned at least one domain (citation or mention)."""
    for exp in experiments or []:
        results = exp.get("results") or {}
        for runs in results.values():
            for run in runs or []:
                web = run.get("web_searches") or {}
                for domains in web.values():
                    if isinstance(domains, dict) and domains:
                        return True
    return False


def _analysis_cache_path(target_domain: str, prompts: List[str]) -> str:
    key_source = (
        FANOUT_VERSION
        + "|"
        + normalize_domain(target_domain)
        + "|"
        + "\n".join(sorted(prompts))
    )
    digest = hashlib.md5(key_source.encode("utf-8")).hexdigest()
    return os.path.join(ANALYSIS_CACHE_DIR, f"{digest}.json")


def _read_analysis_cache(cache_path: str) -> Optional[List[Dict[str, Any]]]:
    try:
        if not os.path.exists(cache_path):
            return None
        if (time.time() - os.path.getmtime(cache_path)) > ANALYSIS_CACHE_TTL_SECONDS:
            return None
        with open(cache_path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _write_analysis_cache(cache_path: str, experiments: List[Dict[str, Any]]) -> None:
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w") as f:
            json.dump(experiments, f, indent=2)
    except Exception as e:
        print(f"Failed to write analysis cache {cache_path}: {e}")


app = FastAPI(
    title="Search Analytics API",
    description="AI visibility analysis via ChatGPT (with Gemini fallback)",
    version="3.2.0",
)


class AnalysisRequest(BaseModel):
    prompts: List[str] = []
    target_domain: str
    experiment_files: Optional[List[str]] = None
    # optional map of prompt -> category from the frontend
    prompt_categories: Optional[Dict[str, str]] = None


class AnalysisResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@app.get("/")
async def root():
    return {
        "message": "Search Analytics API",
        "version": "3.2.0",
        "endpoints": {
            "analyze": "POST /analyze - ChatGPT AI visibility analysis",
            "health": "GET /health - Health check",
        },
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "search-analytics-api",
        "version": "3.2.0",
        "provider": "chatgpt",
        "fallback": "gemini",
        "has_openai_api": bool(os.getenv("OPENAI_API_KEY")),
        "has_gemini_api": bool(os.getenv("GEMINI_API_KEY")),
    }


def _run_live_fanout(
    prompts: List[str],
    target_domain: str,
    *,
    has_openai: bool,
    has_gemini: bool,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]], str, str]:
    """Blocking ChatGPT/Gemini fan-out — must run off the asyncio event loop."""
    experiments = None
    topic_to_subs: Dict[str, List[str]] = {}
    provider_used = "chatgpt"
    data_source = "live_chatgpt_fanout"
    last_err: Optional[Exception] = None
    openai_quota = False
    gemini_quota = False

    if has_openai:
        try:
            experiments, topic_to_subs = run_chatgpt_fanout(
                prompts,
                target_domain=target_domain,
            )
            if not _experiments_have_signal(experiments):
                print("ChatGPT returned no domains; trying Gemini")
                experiments = None
        except QuotaExhaustedError as e:
            openai_quota = True
            last_err = e
            print(f"OpenAI quota exhausted, trying Gemini: {e}")
            experiments = None
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"ChatGPT fan-out failed, trying Gemini: {e}")
            experiments = None

    if experiments is None and has_gemini:
        provider_used = "gemini"
        data_source = "live_gemini_fanout"
        try:
            experiments, topic_to_subs = run_fanout_experiments(
                prompts,
                target_domain=target_domain,
            )
        except QuotaExhaustedError as e:
            gemini_quota = True
            if openai_quota:
                raise RuntimeError(
                    "OpenAI and Gemini API credits are both depleted. "
                    "Add billing credits for at least one provider, then try again."
                ) from e
            raise RuntimeError(str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(
                f"ChatGPT failed ({last_err}); Gemini also failed: {e}"
                if last_err
                else f"Live Gemini analysis failed: {e}"
            ) from e

    if experiments is None:
        if openai_quota and not has_gemini:
            raise RuntimeError(str(last_err) if last_err else "OpenAI API credits are depleted.")
        if openai_quota and gemini_quota:
            raise RuntimeError(
                "OpenAI and Gemini API credits are both depleted. "
                "Add billing credits for at least one provider, then try again."
            )
        raise RuntimeError(
            f"Live ChatGPT analysis failed: {last_err}"
            if last_err
            else "Analysis returned no AI search sources or mentions."
        )

    if not _experiments_have_signal(experiments):
        raise RuntimeError(
            "Analysis returned no AI search sources or mentions. "
            "Try again in a moment, or use fewer prompts."
        )

    return experiments, topic_to_subs, provider_used, data_source


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_domain_performance(request: AnalysisRequest):
    """
    Analyze domain AI visibility with ChatGPT (+ web search).

    Falls back to Gemini + Google Search grounding if ChatGPT fails or
    returns no usable mentions/sources.
    """
    try:
        target_domain = normalize_domain(request.target_domain)
        if not target_domain:
            raise HTTPException(status_code=400, detail="target_domain is required")

        experiment_files: List[str] = []
        data_source = "default_file"
        cache_hit = False
        topic_to_subs: Dict[str, List[str]] = {}
        provider_used = "chatgpt"
        experiments: Optional[List[Dict[str, Any]]] = None

        # Priority 1: explicitly provided experiment files.
        if request.experiment_files:
            experiment_files = request.experiment_files
            for file_path in experiment_files:
                if not os.path.exists(file_path):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Experiment file not found: {file_path}",
                    )
            data_source = "experiment_files"
            if len(experiment_files) == 1:
                search_data, response_chunks = await asyncio.to_thread(
                    load_and_process_experiment_results, experiment_files[0]
                )
            else:
                search_data, response_chunks = await asyncio.to_thread(
                    load_multiple_experiment_files, experiment_files
                )

        # Priority 2: live ChatGPT fan-out (Gemini fallback).
        elif request.prompts:
            has_openai = bool(os.getenv("OPENAI_API_KEY"))
            has_gemini = bool(os.getenv("GEMINI_API_KEY"))
            if not has_openai and not has_gemini:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Set OPENAI_API_KEY (preferred) or GEMINI_API_KEY "
                        "in the backend .env and restart."
                    ),
                )

            data_source = "live_chatgpt_fanout"
            provider_used = "chatgpt"
            cache_path = _analysis_cache_path(target_domain, request.prompts)
            experiments = _read_analysis_cache(cache_path)

            if experiments is not None and not _experiments_have_signal(experiments):
                experiments = None

            if experiments is not None:
                cache_hit = True
                for exp in experiments:
                    topic = exp.get("prompt")
                    results = exp.get("results") or {}
                    runs = results.get("chatgpt") or results.get("gemini") or []
                    if topic and runs:
                        topic_to_subs[topic] = runs[0].get("fanout_subqueries") or list(
                            (runs[0].get("web_searches") or {}).keys()
                        )
                    if results.get("gemini") and not results.get("chatgpt"):
                        provider_used = "gemini"
                        data_source = "live_gemini_fanout"
            else:
                try:
                    (
                        experiments,
                        topic_to_subs,
                        provider_used,
                        data_source,
                    ) = await asyncio.to_thread(
                        _run_live_fanout,
                        request.prompts,
                        target_domain,
                        has_openai=has_openai,
                        has_gemini=has_gemini,
                    )
                except RuntimeError as e:
                    raise HTTPException(status_code=502, detail=str(e)) from e

                _write_analysis_cache(cache_path, experiments)

            experiment_files = [cache_path]
            if not os.path.exists(cache_path):
                _write_analysis_cache(cache_path, experiments)
            search_data, response_chunks = await asyncio.to_thread(
                load_and_process_experiment_results, cache_path
            )

        # Priority 3: fall back to the bundled default experiment file.
        else:
            default_file = "gemini_experiment_results.json"
            if not os.path.exists(default_file):
                raise HTTPException(
                    status_code=404,
                    detail=(
                        f"Default experiment file not found: {default_file}. "
                        "Provide prompts or experiment_files."
                    ),
                )
            experiment_files = [default_file]
            search_data, response_chunks = await asyncio.to_thread(
                load_and_process_experiment_results, default_file
            )

        if not search_data:
            raise HTTPException(
                status_code=400,
                detail="No valid search data found for this analysis",
            )

        analytics = SearchAnalytics(search_data, response_chunks)

        # Legacy report (still used for Gemini poor-performance insights)
        report = analytics.generate_comprehensive_report(target_domain)
        gemini_analysis_from_report = report.get("gemini_analysis", {})
        gemini_analysis = {
            "poor_performance_analysis": gemini_analysis_from_report,
            "has_poor_performance": len(gemini_analysis_from_report) > 0,
            "total_poor_performance_cases": len(gemini_analysis_from_report),
        }

        visibility = build_visibility_report(
            search_data,
            target_domain,
            topic_categories=request.prompt_categories or {},
            gemini_insights=gemini_analysis,
        )

        # Keep legacy fields for any old UI bits, but front the new visibility block.
        domain_stats = analytics.calculate_domain_stats(target_domain)
        enhanced_report = {
            **report,
            "visibility": visibility,
            "domain_detailed_stats": domain_stats,
            "fanout": {
                "enabled": data_source.startswith("live_"),
                "subqueries_by_topic": topic_to_subs,
                "provider": provider_used,
            },
            "gemini_analysis": gemini_analysis,
            "recommendations": [
                r.get("insight") for r in visibility.get("recommendations", []) if r.get("insight")
            ],
            "competitive_insights": {
                "market_position": visibility.get("verdict"),
                "key_competitors": [
                    {"domain": c["domain"], "frequency": c["citations"]}
                    for c in visibility.get("competitors", [])[:5]
                ],
                "competitive_advantages": [],
                "improvement_areas": [],
            },
        }

        metadata = {
            "target_domain": target_domain,
            "input_domain": request.target_domain,
            "domain_suggestion": visibility.get("domain_suggestion"),
            "experiment_files": experiment_files,
            "total_prompts_analyzed": len(search_data),
            "sample_size": visibility.get("kpis", {}).get("sample_size"),
            "data_source": data_source,
            "cache_hit": cache_hit,
            "has_openai_api": bool(os.getenv("OPENAI_API_KEY")),
            "has_gemini_api": bool(os.getenv("GEMINI_API_KEY")),
            "has_response_chunks": bool(response_chunks),
            "fanout_version": FANOUT_VERSION,
            "provider": provider_used,
        }

        return AnalysisResponse(success=True, data=enhanced_report, metadata=metadata)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during analysis: {str(e)}",
        )


@app.get("/experiment-files")
async def list_experiment_files():
    """List available experiment files in the current directory"""
    try:
        files = []
        for file in os.listdir("."):
            if file.endswith(".json") and "experiment" in file.lower():
                files.append(
                    {
                        "filename": file,
                        "path": file,
                        "size": os.path.getsize(file),
                    }
                )

        return {
            "available_files": files,
            "default_file": "gemini_experiment_results.json",
            "default_exists": os.path.exists("gemini_experiment_results.json"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=os.getenv("UVICORN_RELOAD", "0") == "1")

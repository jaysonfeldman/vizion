"""
Gemini-based AI search visibility experiment runner (fast path).

For each prompt, Gemini answers using the Google Search grounding tool. We read
the grounding metadata directly:
  - grounding_chunks[].web.title  -> the source domain (already a domain!)
  - grounding_supports[]          -> which chunks support each answer segment,
                                     giving us citation order (rank).

This deliberately skips the old extract.py behaviour of scraping Google and
resolving redirect URLs one-by-one, which was the slow/flaky part.

Output matches the structure consumed by analytics.py:

    [
        {
            "prompt": "<prompt>",
            "results": {
                "gemini": [
                    {
                        "model": "<model>",
                        "response": "<answer text>",
                        "web_searches": {
                            "<prompt>": {
                                "<domain>": {"citations": [1, 3], "contents": ["..."]},
                                ...
                            }
                        },
                        "success": true,
                        "run_number": 1
                    }
                ]
            },
            "summary": { ... }
        },
        ...
    ]
"""

import os
import time
import warnings
import traceback as tb
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

from urllib.parse import urlparse

from google import genai
from google.genai import types

from domain_utils import normalize_domain, is_noise_domain
from quota_errors import QuotaExhaustedError, is_fatal_model_error, is_quota_error, quota_message

# Prefer stable aliases — pinned 2.5/2.0 IDs often 404 for new API keys.
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
_MODEL_FALLBACKS = (
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
)


def _chunk_source(chunk: Any) -> Tuple[str, str]:
    """Return (domain, url) preferring real publisher domains over Google redirects."""
    web = getattr(chunk, "web", None)
    if not web:
        return "", ""

    title = (getattr(web, "title", "") or "").strip().lower()
    title_dom = ""
    if title and " " not in title and "." in title:
        title_dom = normalize_domain(title)
        if title_dom and is_noise_domain(title_dom):
            title_dom = ""

    uri = getattr(web, "uri", None) or getattr(web, "url", None) or ""
    uri_dom = ""
    if uri:
        try:
            host = urlparse(uri).netloc or urlparse(f"https://{uri}").netloc
            uri_dom = normalize_domain(host)
            if uri_dom and is_noise_domain(uri_dom):
                uri_dom = ""
        except Exception:
            uri_dom = ""

    dom = title_dom or uri_dom
    url = ""
    if uri and uri_dom and not is_noise_domain(uri_dom):
        url = uri
    elif dom:
        url = f"https://{dom}"
    return dom, url


def _domain_from_chunk(chunk: Any) -> str:
    dom, _ = _chunk_source(chunk)
    return dom


def _seg_start(support: Any) -> int:
    seg = getattr(support, "segment", None)
    start = getattr(seg, "start_index", None) if seg else None
    return start if isinstance(start, int) else 1_000_000


def _extract_web_searches(response: Any, prompt_key: str) -> Dict[str, Dict[str, Dict[str, List]]]:
    """Build { prompt_key: { domain: {citations, contents} } } from grounding metadata."""
    try:
        gm = response.candidates[0].grounding_metadata
    except Exception:
        return {prompt_key: {}}

    if gm is None:
        return {prompt_key: {}}

    chunks = getattr(gm, "grounding_chunks", None) or []
    supports = getattr(gm, "grounding_supports", None) or []

    chunk_sources = [_chunk_source(ch) for ch in chunks]
    chunk_domains = [d for d, _ in chunk_sources]

    domain_map: Dict[str, Dict[str, Any]] = {}
    for dom, url in chunk_sources:
        if dom and not is_noise_domain(dom):
            domain_map.setdefault(
                dom, {"citations": [], "contents": [], "urls": [], "url": url or f"https://{dom}"}
            )
            if url and url not in domain_map[dom]["urls"]:
                domain_map[dom]["urls"].append(url)

    seen_order: List[str] = []
    for support in sorted(supports, key=_seg_start):
        idxs = getattr(support, "grounding_chunk_indices", None) or []
        seg = getattr(support, "segment", None)
        seg_text = getattr(seg, "text", "") if seg else ""
        for ci in idxs:
            if 0 <= ci < len(chunk_domains):
                dom = chunk_domains[ci]
                if not dom or is_noise_domain(dom):
                    continue
                if dom not in seen_order:
                    seen_order.append(dom)
                rank = seen_order.index(dom) + 1
                domain_map.setdefault(
                    dom, {"citations": [], "contents": [], "urls": [], "url": f"https://{dom}"}
                )
                domain_map[dom]["citations"].append(rank)
                domain_map[dom]["contents"].append(seg_text or "")

    for dom, data in domain_map.items():
        data["citations"] = sorted(set(data["citations"]))

    return {prompt_key: domain_map}


def _summarize(web_searches: Dict[str, Any]) -> Dict[str, Any]:
    queries = list(web_searches.keys())
    return {
        "gemini": {
            "total_runs": 1,
            "successful_runs": 1,
            "success_rate": 1.0,
            "total_web_searches": len(queries),
            "unique_web_searches": len(set(queries)),
            "web_search_queries": queries,
        }
    }


def run_single_prompt(prompt: str, api_key: str, model: str = DEFAULT_MODEL) -> Dict[str, Any]:
    """Run one prompt through Gemini with Google Search grounding."""
    client = genai.Client(api_key=api_key)
    grounding_tool = types.Tool(google_search=types.GoogleSearch())

    instruction = (
        "Answer as if helping a user research options online. Use Google Search to "
        "find current, specific, real sources and recommend concrete companies, "
        "products, or websites. Question: " + prompt
    )

    models_to_try: List[str] = []
    for m in (model, *_MODEL_FALLBACKS):
        if m and m not in models_to_try:
            models_to_try.append(m)

    last_error = None
    for active_model in models_to_try:
        for attempt in range(2):
            try:
                config = types.GenerateContentConfig(
                    tools=[grounding_tool],
                    temperature=0.3,
                    max_output_tokens=2048,
                )
                response = client.models.generate_content(
                    model=active_model, contents=instruction, config=config
                )

                web_searches = _extract_web_searches(response, prompt)
                try:
                    text = response.text or ""
                except Exception:
                    text = ""

                return {
                    "prompt": prompt,
                    "results": {
                        "gemini": [
                            {
                                "model": active_model,
                                "response": text,
                                "web_searches": web_searches,
                                "success": True,
                                "run_number": 1,
                            }
                        ]
                    },
                    "summary": _summarize(web_searches),
                }
            except Exception as e:  # noqa: BLE001
                last_error = e
                warnings.warn(
                    f"Gemini run failed (attempt {attempt + 1}) for '{prompt}' "
                    f"[{active_model}]: {e}"
                )
                if is_quota_error(e):
                    raise QuotaExhaustedError(quota_message("Gemini")) from e
                if is_fatal_model_error(e):
                    # Try next model alias instead of retrying a dead id.
                    break
                time.sleep(2 * (attempt + 1))

    return {
        "prompt": prompt,
        "results": {
            "gemini": [
                {
                    "model": model,
                    "response": "",
                    "web_searches": {},
                    "success": False,
                    "run_number": 1,
                    "error": str(last_error),
                }
            ]
        },
        "summary": {
            "gemini": {
                "total_runs": 1,
                "successful_runs": 0,
                "success_rate": 0.0,
                "total_web_searches": 0,
                "unique_web_searches": 0,
                "web_search_queries": [],
            }
        },
    }


def run_gemini_experiments(
    prompts: List[str],
    api_key: Optional[str] = None,
    model: str = DEFAULT_MODEL,
    max_workers: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Run all prompts concurrently and return the list of experiment dicts."""
    if api_key is None:
        api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY must be provided or set in the environment")

    prompts = [p for p in prompts if p and p.strip()]
    if not prompts:
        return []

    if max_workers is None:
        max_workers = int(os.getenv("GEMINI_MAX_WORKERS", "8"))

    results: List[Dict[str, Any]] = []
    workers = max(1, min(max_workers, len(prompts)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_prompt = {
            executor.submit(run_single_prompt, prompt, api_key, model): prompt
            for prompt in prompts
        }
        for future in as_completed(future_to_prompt):
            try:
                results.append(future.result())
            except Exception:  # noqa: BLE001
                warnings.warn(
                    f"Unexpected failure for prompt '{future_to_prompt[future]}': "
                    f"{tb.format_exc()}"
                )
                results.append(
                    {
                        "prompt": future_to_prompt[future],
                        "results": {"gemini": []},
                        "summary": {},
                    }
                )

    return results

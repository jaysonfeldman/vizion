"""
Query fan-out + live Gemini grounding for AI visibility measurement.

Flow:
  1. For each topic prompt, ask Gemini to generate N realistic sub-queries
     (what an AI assistant would actually search).
  2. Run each sub-query through Gemini with Google Search grounding.
  3. Return experiment records in the shape analytics.py expects, where:
       prompt = original topic
       web_searches keys = the fanned-out sub-queries
"""

from __future__ import annotations

import json
import os
import re
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

from google import genai
from google.genai import types

from domain_utils import normalize_domain
from gemini_search import run_single_prompt, DEFAULT_MODEL
from quota_errors import QuotaExhaustedError, is_quota_error, quota_message

# Narrow fan-out: original prompt + close paraphrases (startup-friendly).
FANOUT_COUNT = int(os.getenv("FANOUT_SUBQUERIES", "5"))
FANOUT_WORKERS = int(os.getenv("GEMINI_MAX_WORKERS", "4"))
USE_LLM_PARAPHRASES = os.getenv("USE_LLM_PARAPHRASES", "0").strip().lower() in {
    "1",
    "true",
    "yes",
}


def _brand_tokens(domain: Optional[str]) -> List[str]:
    if not domain:
        return []
    host = normalize_domain(domain)
    label = host.split(".")[0] if host else ""
    tokens = {host, label, label.replace("-", " ")}
    return [t.lower() for t in tokens if t and len(t) >= 3]


def _credit_text_mentions(
    domain_map: Dict[str, Any],
    response_text: str,
    target_domain: Optional[str],
) -> Dict[str, Any]:
    """If the answer names the brand but grounding missed the site, count as cited."""
    if not target_domain or not response_text:
        return domain_map
    target = normalize_domain(target_domain)
    text = response_text.lower()
    tokens = _brand_tokens(target)
    if not any(tok in text for tok in tokens):
        return domain_map

    # Soft rank from where the brand first appears in the answer.
    pos = len(response_text)
    for tok in tokens:
        idx = text.find(tok)
        if idx >= 0:
            pos = min(pos, idx)
    rank = 1 if pos < 150 else (2 if pos < 500 else 3)

    out = dict(domain_map)
    for d in list(out.keys()):
        nd = normalize_domain(d)
        if nd == target or nd.endswith("." + target) or target.endswith("." + nd):
            data = dict(out[d] or {})
            cites = list(data.get("citations") or [])
            if not cites:
                cites = [rank]
            data["citations"] = sorted(set(cites))
            data.setdefault("contents", []).append("Named in the model answer")
            data["text_mention"] = True
            data.setdefault("url", f"https://{nd}")
            data.setdefault("urls", [f"https://{nd}"])
            out[d] = data
            return out

    out[target] = {
        "citations": [rank],
        "contents": ["Named in the model answer"],
        "text_mention": True,
        "url": f"https://{target}",
        "urls": [f"https://{target}"],
    }
    return out


def _extract_json(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    candidate = fenced.group(1) if fenced else text
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", candidate)
    return json.loads(match.group(0) if match else candidate)


def generate_subqueries(
    topic: str,
    api_key: str,
    *,
    count: int = FANOUT_COUNT,
    model: str = DEFAULT_MODEL,
    target_domain: Optional[str] = None,
) -> List[str]:
    """Generate unbranded fan-out sub-queries for a topic.

    Important: we deliberately do NOT inject the brand/domain into searches.
    Branded queries ("is peec.ai good…") inflate scores and aren't a fair
    measure of organic AI visibility for Twitter-style sharing.
    """
    base = topic.strip()
    templates = [
        f"how can I {base}",
        f"what is the best way to {base}",
        f"{base} for small teams",
        f"tools that help with {base}",
        f"simple ways to {base}",
    ][:count]
    if not USE_LLM_PARAPHRASES:
        return templates

    client = genai.Client(api_key=api_key)
    brand_tokens: List[str] = []
    if target_domain:
        host = normalize_domain(target_domain)
        label = host.split(".")[0] if host else ""
        if label:
            brand_tokens = [label.lower(), host.lower(), label.replace("-", " ").lower()]

    # Skip branded parent questions — fan into unbranded paraphrases only.
    # Never include the original topic as a search (it's the row label, not a check).

    instruction = f"""You simulate related questions a buyer would ask ChatGPT after this one.

User question:
{topic}

Generate exactly {count} related buyer questions / search queries.
CRITICAL RULES:
- Stay in the SAME category and job-to-be-done
- Sound like real people typing into ChatGPT
- Vary angle: how-to, best-of, comparison, outcome, audience
- Do NOT repeat the original word-for-word
- Do NOT broaden into "best software/tools for startups"
- Under 12 words, everyday English
- Do NOT include company brands, product names, or domains

Respond with ONLY JSON:
{{"queries": ["query 1", "query 2", ...]}}"""

    def _is_branded(q: str) -> bool:
        ql = q.lower()
        return any(tok and tok in ql for tok in brand_tokens)

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model,
                contents=instruction,
                config=types.GenerateContentConfig(
                    temperature=0.6,
                    max_output_tokens=1024,
                    response_mime_type="application/json",
                ),
            )
            text = (response.text or "").strip()
            parsed = _extract_json(text)
            queries = parsed.get("queries") if isinstance(parsed, dict) else parsed
            if not isinstance(queries, list):
                raise ValueError("queries is not a list")
            cleaned = [
                str(q).strip()
                for q in queries
                if str(q).strip() and not _is_branded(str(q))
            ]
            # Related searches only — never include the parent topic itself
            ordered: List[str] = []
            for q in cleaned:
                if q.lower() == topic.strip().lower():
                    continue
                if q not in ordered:
                    ordered.append(q)
            if ordered:
                return ordered[:count]
        except Exception as e:  # noqa: BLE001
            warnings.warn(f"Fan-out generation failed for '{topic}' (attempt {attempt+1}): {e}")
            if is_quota_error(e):
                # Templates below; don't sleep/retry on depleted credits.
                break
            time.sleep(1.5 * (attempt + 1))

    # Unbranded fallback only — never reuse the parent question verbatim
    base = topic.strip()
    return [
        f"how can I {base}",
        f"what is the best way to {base}",
        f"{base} for small teams",
        f"tools that help with {base}",
        f"simple ways to {base}",
    ][:count]


def _normalize_experiment_domains(experiment: Dict[str, Any]) -> Dict[str, Any]:
    """Rewrite domain keys in web_searches to normalized hostnames."""
    results = experiment.get("results") or {}
    for _model, runs in results.items():
        for run in runs:
            web = run.get("web_searches") or {}
            normalized_web: Dict[str, Dict[str, Any]] = {}
            for query, domains in web.items():
                if not isinstance(domains, dict):
                    continue
                nd: Dict[str, Any] = {}
                for domain, data in domains.items():
                    key = normalize_domain(domain) or domain
                    if key in nd and isinstance(data, dict):
                        existing = nd[key]
                        existing.setdefault("citations", []).extend(data.get("citations") or [])
                        existing.setdefault("contents", []).extend(data.get("contents") or [])
                        existing["citations"] = sorted(set(existing["citations"]))
                    else:
                        nd[key] = data
                normalized_web[query] = nd
            run["web_searches"] = normalized_web
    return experiment


def run_fanout_experiments(
    topics: List[str],
    api_key: Optional[str] = None,
    *,
    subqueries_per_topic: int = FANOUT_COUNT,
    model: str = DEFAULT_MODEL,
    max_workers: int = FANOUT_WORKERS,
    target_domain: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """
    Fan out each topic into sub-queries, run grounded Gemini on each,
    and merge into one experiment record per topic.

    Returns (experiments, topic_to_subqueries).
    """
    if api_key is None:
        api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY must be set")

    topics = [t.strip() for t in topics if t and t.strip()]
    if not topics:
        return [], {}

    target_domain = normalize_domain(target_domain) if target_domain else None

    # Phase A: generate sub-queries (parallel per topic)
    topic_to_subs: Dict[str, List[str]] = {}
    with ThreadPoolExecutor(max_workers=min(max_workers, len(topics))) as pool:
        futures = {
            pool.submit(
                generate_subqueries,
                topic,
                api_key,
                count=subqueries_per_topic,
                model=model,
                target_domain=target_domain,
            ): topic
            for topic in topics
        }
        for fut in as_completed(futures):
            topic = futures[fut]
            try:
                topic_to_subs[topic] = fut.result()
            except Exception as e:  # noqa: BLE001
                warnings.warn(f"Subquery gen failed for {topic}: {e}")
                topic_to_subs[topic] = [topic]

    # Always include the parent prompt itself (ChatGPT UI parity), then paraphrases.
    for topic, subs in list(topic_to_subs.items()):
        paraphrases = [
            s for s in (subs or [])
            if isinstance(s, str) and s.strip() and s.strip().lower() != topic.strip().lower()
        ]
        topic_to_subs[topic] = [topic] + paraphrases[: max(0, subqueries_per_topic - 1)]

    # Phase B: run every sub-query grounded (fully parallel)
    jobs: List[Tuple[str, str]] = []  # (topic, subquery)
    for topic, subs in topic_to_subs.items():
        for sub in subs:
            jobs.append((topic, sub))

    # topic -> merged web_searches dict + response texts
    merged: Dict[str, Dict[str, Any]] = {
        topic: {"web_searches": {}, "responses": [], "errors": []} for topic in topics
    }

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(run_single_prompt, subquery, api_key, model): (topic, subquery)
            for topic, subquery in jobs
        }
        for fut in as_completed(future_map):
            topic, subquery = future_map[fut]
            try:
                result = fut.result()
                runs = (result.get("results") or {}).get("gemini") or []
                if runs and runs[0].get("success"):
                    # run_single_prompt keys web_searches by the prompt text itself;
                    # re-key under the subquery for clarity.
                    web = runs[0].get("web_searches") or {}
                    # Prefer the subquery as the key; collapse any inner keys.
                    domain_map: Dict[str, Any] = {}
                    for _k, domains in web.items():
                        if isinstance(domains, dict):
                            for dom, data in domains.items():
                                nd = normalize_domain(dom) or dom
                                if nd in domain_map and isinstance(data, dict):
                                    domain_map[nd].setdefault("citations", []).extend(
                                        data.get("citations") or []
                                    )
                                    domain_map[nd].setdefault("contents", []).extend(
                                        data.get("contents") or []
                                    )
                                    domain_map[nd]["citations"] = sorted(
                                        set(domain_map[nd]["citations"])
                                    )
                                else:
                                    domain_map[nd] = data if isinstance(data, dict) else {
                                        "citations": [],
                                        "contents": [],
                                    }
                    merged[topic]["web_searches"][subquery] = _credit_text_mentions(
                        domain_map,
                        runs[0].get("response") or "",
                        target_domain,
                    )
                    merged[topic]["responses"].append(runs[0].get("response") or "")
                else:
                    merged[topic]["web_searches"][subquery] = {}
                    err = runs[0].get("error") if runs else "unknown"
                    merged[topic]["errors"].append(str(err))
            except Exception as e:  # noqa: BLE001
                if is_quota_error(e) or isinstance(e, QuotaExhaustedError):
                    for pending in future_map:
                        pending.cancel()
                    raise QuotaExhaustedError(quota_message("Gemini")) from e
                merged[topic]["web_searches"][subquery] = {}
                merged[topic]["errors"].append(str(e))

    experiments: List[Dict[str, Any]] = []
    for topic in topics:
        blob = merged[topic]
        response_text = "\n\n".join(blob["responses"])
        experiment = {
            "prompt": topic,
            "results": {
                "gemini": [
                    {
                        "model": model,
                        "response": response_text,
                        "web_searches": blob["web_searches"],
                        "success": bool(blob["web_searches"]),
                        "run_number": 1,
                        "fanout_subqueries": topic_to_subs.get(topic, []),
                        "errors": blob["errors"],
                    }
                ]
            },
            "summary": {
                "gemini": {
                    "total_runs": 1,
                    "successful_runs": 1 if blob["web_searches"] else 0,
                    "success_rate": 1.0 if blob["web_searches"] else 0.0,
                    "total_web_searches": len(blob["web_searches"]),
                    "unique_web_searches": len(blob["web_searches"]),
                    "web_search_queries": list(blob["web_searches"].keys()),
                }
            },
        }
        experiments.append(_normalize_experiment_domains(experiment))

    return experiments, topic_to_subs

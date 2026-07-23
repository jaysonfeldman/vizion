"""
Claude-based AI search visibility experiment runner.

For each prompt, Claude answers using its native web search tool. We capture:
  - the search queries Claude actually ran,
  - the URLs it retrieved for each query,
  - which of those URLs it cited in the answer and in what order (citation rank).

The output matches the structure consumed by analytics.py:

    [
        {
            "prompt": "<the input prompt>",
            "results": {
                "claude": [
                    {
                        "model": "<model>",
                        "response": "<answer text>",
                        "web_searches": {
                            "<search query>": {
                                "<url>": {"citations": [1, 3], "contents": ["..."]},
                                ...
                            },
                            ...
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
from typing import Any, Dict, List, Optional

import anthropic

# Haiku is used by default for the search runs because it is substantially faster
# than Sonnet while still producing solid grounded citations. Override with
# ANTHROPIC_SEARCH_MODEL (falls back to ANTHROPIC_MODEL) if you want higher quality.
DEFAULT_MODEL = os.getenv(
    "ANTHROPIC_SEARCH_MODEL",
    os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
)
WEB_SEARCH_TOOL_TYPE = os.getenv("ANTHROPIC_WEB_SEARCH_TOOL", "web_search_20250305")
MAX_WEB_SEARCHES = int(os.getenv("ANTHROPIC_MAX_WEB_SEARCHES", "3"))


def _get_attr(obj: Any, name: str, default: Any = None) -> Any:
    """Access a field on either a pydantic model or a dict."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _parse_response(response: Any) -> Dict[str, Dict[str, Dict[str, List]]]:
    """
    Convert a Claude web-search response into the web_searches structure:
        { query: { url: {"citations": [ranks], "contents": [snippets]} } }
    """
    web_searches: Dict[str, Dict[str, Dict[str, List]]] = {}
    url_to_query: Dict[str, str] = {}
    # Map a server_tool_use id -> the query text, so we can associate results.
    tool_id_to_query: Dict[str, str] = {}

    content = _get_attr(response, "content", []) or []

    # First pass: collect search queries and their retrieved URLs.
    for block in content:
        btype = _get_attr(block, "type")
        if btype == "server_tool_use":
            name = _get_attr(block, "name")
            if name == "web_search":
                tool_id = _get_attr(block, "id")
                inp = _get_attr(block, "input", {}) or {}
                query = _get_attr(inp, "query", "") or ""
                if tool_id:
                    tool_id_to_query[tool_id] = query
        elif btype == "web_search_tool_result":
            tool_id = _get_attr(block, "tool_use_id")
            query = tool_id_to_query.get(tool_id, "")
            results = _get_attr(block, "content", []) or []
            # results can be an error object instead of a list
            if not isinstance(results, list):
                continue
            if query:
                web_searches.setdefault(query, {})
            for item in results:
                if _get_attr(item, "type") != "web_search_result":
                    continue
                url = _get_attr(item, "url")
                if not url:
                    continue
                bucket = web_searches.setdefault(query or "_general", {})
                bucket.setdefault(url, {"citations": [], "contents": []})
                # First retrieval of a URL determines its owning query.
                url_to_query.setdefault(url, query or "_general")

    # Second pass: walk citations in document order to assign citation ranks.
    citation_counter = 0
    for block in content:
        if _get_attr(block, "type") != "text":
            continue
        citations = _get_attr(block, "citations", None) or []
        for citation in citations:
            url = _get_attr(citation, "url")
            if not url:
                continue
            citation_counter += 1
            query = url_to_query.get(url, "_general")
            bucket = web_searches.setdefault(query, {})
            bucket.setdefault(url, {"citations": [], "contents": []})
            bucket[url]["citations"].append(citation_counter)
            cited_text = _get_attr(citation, "cited_text", "") or ""
            bucket[url]["contents"].append(cited_text)

    return web_searches


def _extract_text(response: Any) -> str:
    parts = []
    for block in _get_attr(response, "content", []) or []:
        if _get_attr(block, "type") == "text":
            parts.append(_get_attr(block, "text", "") or "")
    return "\n".join(parts)


def _summarize(web_searches: Dict[str, Any]) -> Dict[str, Any]:
    queries = list(web_searches.keys())
    return {
        "claude": {
            "total_runs": 1,
            "successful_runs": 1,
            "success_rate": 1.0,
            "total_web_searches": len(queries),
            "unique_web_searches": len(set(queries)),
            "web_search_queries": queries,
        }
    }


def run_single_prompt(
    prompt: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
) -> Dict[str, Any]:
    """Run one prompt through Claude with web search and return an experiment dict."""
    client = anthropic.Anthropic(api_key=api_key)

    instruction = (
        "Answer the following question as if you were an AI assistant helping a user "
        "research options online. Use web search to find current, specific, real sources, "
        "and cite them. Be concrete and mention specific companies, products, or websites.\n\n"
        f"Question: {prompt}"
    )

    last_error = None
    for attempt in range(3):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=2048,
                messages=[{"role": "user", "content": instruction}],
                tools=[
                    {
                        "type": WEB_SEARCH_TOOL_TYPE,
                        "name": "web_search",
                        "max_uses": MAX_WEB_SEARCHES,
                    }
                ],
            )

            web_searches = _parse_response(response)
            text = _extract_text(response)

            return {
                "prompt": prompt,
                "results": {
                    "claude": [
                        {
                            "model": model,
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
            warnings.warn(f"Claude run failed (attempt {attempt + 1}) for '{prompt}': {e}")
            time.sleep(2 * (attempt + 1))

    # All attempts failed - return a well-formed failure record.
    return {
        "prompt": prompt,
        "results": {
            "claude": [
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
            "claude": {
                "total_runs": 1,
                "successful_runs": 0,
                "success_rate": 0.0,
                "total_web_searches": 0,
                "unique_web_searches": 0,
                "web_search_queries": [],
            }
        },
    }


def run_claude_experiments(
    prompts: List[str],
    api_key: Optional[str] = None,
    model: str = DEFAULT_MODEL,
    max_workers: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Run all prompts (in parallel) and return the list of experiment dicts."""
    if api_key is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError(
            "ANTHROPIC_API_KEY must be provided or set in the environment"
        )

    prompts = [p for p in prompts if p and p.strip()]
    if not prompts:
        return []

    # Run every prompt concurrently by default (capped to avoid hitting rate limits).
    if max_workers is None:
        max_workers = int(os.getenv("ANTHROPIC_MAX_WORKERS", "8"))

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
            except Exception as e:  # noqa: BLE001
                warnings.warn(
                    f"Unexpected failure for prompt '{future_to_prompt[future]}': "
                    f"{tb.format_exc()}"
                )
                results.append(
                    {
                        "prompt": future_to_prompt[future],
                        "results": {"claude": []},
                        "summary": {},
                    }
                )

    return results

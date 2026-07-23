"""
ChatGPT (OpenAI Responses API) visibility runner.

Uses ChatGPT with the hosted web_search tool — same family of “AI search”
experience users get in ChatGPT — then scores:
  1. Brand / domain mentions in the answer text (primary)
  2. URL citations / sources from web search (secondary competitors + evidence)
"""

from __future__ import annotations

import os
import re
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from openai import OpenAI

from domain_utils import normalize_domain, is_noise_domain
from quota_errors import QuotaExhaustedError, is_fatal_model_error, is_quota_error, quota_message

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
CHAT_WORKERS = int(os.getenv("OPENAI_MAX_WORKERS", "4"))
# Keep fan-out small: web_search is ~$10/1k calls and dominates cost.
FANOUT_COUNT = int(os.getenv("FANOUT_SUBQUERIES", "5"))
# Skip LLM paraphrase calls by default (free templates). Set USE_LLM_PARAPHRASES=1 to enable.
USE_LLM_PARAPHRASES = os.getenv("USE_LLM_PARAPHRASES", "0").strip().lower() in {
    "1",
    "true",
    "yes",
}


# Dictionary-ish brand labels: always require word boundaries (avoids junk,
# and still matches "Linear" / "**Linear**" / "1. Linear").
_BRAND_WORD_RE_CACHE: Dict[str, re.Pattern[str]] = {}


def brand_tokens(domain: Optional[str]) -> List[str]:
    if not domain:
        return []
    host = normalize_domain(domain)
    label = host.split(".")[0] if host else ""
    out = {host, label, label.replace("-", " ")}
    return [t.lower() for t in out if t and len(t) >= 2]


def _brand_word_pattern(tok: str) -> re.Pattern[str]:
    cached = _BRAND_WORD_RE_CACHE.get(tok)
    if cached:
        return cached
    # Match bare brand, markdown bold, or numbered list lead-ins
    pat = re.compile(
        rf"(?:(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])|"
        rf"(?:\*\*|__)\s*{re.escape(tok)}\s*(?:\*\*|__)|"
        rf"(?:^|\n)\s*\d+\.\s*{re.escape(tok)}\b)",
        re.I | re.M,
    )
    _BRAND_WORD_RE_CACHE[tok] = pat
    return pat


def answer_mentions_brand(text: str, domain: str) -> bool:
    if not text or not domain:
        return False
    lower = text.lower()
    for tok in brand_tokens(domain):
        if "." in tok:
            # Full domain / host — substring is fine (linear.app)
            if tok in lower:
                return True
            continue
        if _brand_word_pattern(tok).search(text):
            return True
    return False


def _host_from_url(url: str) -> str:
    try:
        host = urlparse(url).netloc or urlparse(f"https://{url}").netloc
        return normalize_domain(host)
    except Exception:
        return normalize_domain(url)


def _collect_citations(response: Any) -> List[Dict[str, str]]:
    """Return [{url, title, domain}] from url_citation annotations + sources."""
    found: List[Dict[str, str]] = []
    seen = set()

    def add(url: str, title: str = "") -> None:
        if not url:
            return
        dom = _host_from_url(url)
        if not dom or is_noise_domain(dom) or dom in seen:
            return
        seen.add(dom)
        found.append({"url": url, "title": title or "", "domain": dom})

    output = getattr(response, "output", None) or []
    for item in output:
        # Dict-shaped or object-shaped content blocks
        content = getattr(item, "content", None)
        if content is None and isinstance(item, dict):
            content = item.get("content")
        for block in content or []:
            anns = getattr(block, "annotations", None)
            if anns is None and isinstance(block, dict):
                anns = block.get("annotations")
            for ann in anns or []:
                if isinstance(ann, dict):
                    ann_type = str(ann.get("type") or "")
                    url = ann.get("url") or ""
                    title = ann.get("title") or ""
                else:
                    ann_type = str(getattr(ann, "type", None) or "")
                    url = getattr(ann, "url", "") or ""
                    title = getattr(ann, "title", "") or ""
                if "citation" in ann_type or "url" in ann_type:
                    add(url, title)

        action = getattr(item, "action", None)
        if action is None and isinstance(item, dict):
            action = item.get("action")
        if action is not None:
            sources = getattr(action, "sources", None)
            if sources is None and isinstance(action, dict):
                sources = action.get("sources")
            for src in sources or []:
                url = getattr(src, "url", None) or (
                    src.get("url") if isinstance(src, dict) else ""
                )
                add(url or "")

    return found


_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\((https?://[^)\s]+)\)")
_BARE_URL_RE = re.compile(r"https?://[^\s\)\]\>\"']+")
_DOMAIN_PAREN_RE = re.compile(
    r"\(([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:/[^\s)]*)?\)", re.I
)


def _domains_from_answer_text(text: str) -> List[Dict[str, str]]:
    """Pull publisher domains from markdown links, URLs, and (domain.com) hints."""
    found: List[Dict[str, str]] = []
    seen = set()

    def add(url_or_host: str, title: str = "") -> None:
        dom = _host_from_url(url_or_host) if "://" in url_or_host else normalize_domain(url_or_host)
        if not dom or is_noise_domain(dom) or dom in seen:
            return
        if dom in {"example.com", "openai.com", "chatgpt.com"}:
            return
        seen.add(dom)
        found.append(
            {
                "url": url_or_host if "://" in url_or_host else f"https://{dom}",
                "title": title or dom,
                "domain": dom,
            }
        )

    for title, url in _MD_LINK_RE.findall(text or ""):
        add(url, title)
    for url in _BARE_URL_RE.findall(text or ""):
        add(url)
    for host in _DOMAIN_PAREN_RE.findall(text or ""):
        add(host)

    return found


def _domain_map_from_answer(
    prompt_key: str,
    answer_text: str,
    citations: List[Dict[str, str]],
    target_domain: Optional[str],
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    Build analytics-compatible web_searches shape:
      { prompt: { domain: { citations: [rank], contents: [...] } } }

    Mention-first: if ChatGPT names the brand in prose, treat as cited even
    without a URL citation.
    """
    # Prefer explicit citations; fill gaps from answer text domains.
    merged: List[Dict[str, str]] = []
    seen = set()
    for cite in list(citations) + _domains_from_answer_text(answer_text):
        dom = cite.get("domain") or ""
        if not dom or dom in seen or is_noise_domain(dom):
            continue
        seen.add(dom)
        merged.append(cite)

    domain_map: Dict[str, Dict[str, Any]] = {}

    for i, cite in enumerate(merged, start=1):
        dom = cite["domain"]
        domain_map.setdefault(
            dom,
            {"citations": [], "contents": [], "urls": [], "titles": []},
        )
        domain_map[dom]["citations"].append(i)
        url = cite.get("url") or f"https://{dom}"
        title = cite.get("title") or ""
        if url and url not in domain_map[dom]["urls"]:
            domain_map[dom]["urls"].append(url)
        if title:
            domain_map[dom]["contents"].append(title[:240])
            if title not in domain_map[dom]["titles"]:
                domain_map[dom]["titles"].append(title[:120])
        # Prefer first concrete landing page
        if not domain_map[dom].get("url"):
            domain_map[dom]["url"] = url

    target = normalize_domain(target_domain) if target_domain else ""
    # Only credit a text mention when the brand string appears AND we also
    # saw a matching domain/url — avoids "Mentioned" with no row in the list.
    if target and answer_mentions_brand(answer_text, target):
        already = any(
            normalize_domain(d) == target or normalize_domain(d).endswith("." + target)
            for d in domain_map
        )
        if already:
            for d, data in list(domain_map.items()):
                if normalize_domain(d) == target or normalize_domain(d).endswith(
                    "." + target
                ):
                    if not data.get("citations"):
                        data["citations"] = [1]
                    data.setdefault("contents", []).append("Named in ChatGPT answer")
                    data["text_mention"] = True
                    data.setdefault("url", f"https://{normalize_domain(d)}")
        # If the model named the brand in prose but never linked a domain,
        # still record it with a homepage URL so it appears in Mentions.
        elif len(answer_text) > 0:
            pos = len(answer_text)
            for tok in brand_tokens(target):
                # Prefer word-boundary hits for labels
                if "." in tok:
                    idx = answer_text.lower().find(tok)
                else:
                    m = _brand_word_pattern(tok).search(answer_text)
                    idx = m.start() if m else -1
                if idx >= 0:
                    pos = min(pos, idx)
            if pos < len(answer_text):
                rank = 1 if pos < 120 else (2 if pos < 400 else 3)
                domain_map[target] = {
                    "citations": [rank],
                    "contents": ["Named in ChatGPT answer"],
                    "text_mention": True,
                    "url": f"https://{target}",
                    "urls": [f"https://{target}"],
                    "titles": [target],
                }

    for data in domain_map.values():
        data["citations"] = sorted(set(data.get("citations") or []))

    return {prompt_key: domain_map}


def run_chatgpt_prompt(
    prompt: str,
    api_key: Optional[str] = None,
    *,
    model: str = DEFAULT_MODEL,
    target_domain: Optional[str] = None,
    use_web_search: bool = True,
) -> Dict[str, Any]:
    """Run one prompt through ChatGPT, optionally with web_search."""
    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY must be set")

    # Hard timeout so a hung OpenAI call cannot stall the whole analyze forever.
    client = OpenAI(api_key=api_key, timeout=90.0, max_retries=1)
    instruction = (
        "Answer like ChatGPT helping a founder pick real products.\n"
        "Lead with your best recommendation, then 3–5 strong alternatives.\n"
        "Name specific well-known products startups actually use "
        "(not obscure affiliate-blog filler).\n"
        "After each product name, include its real website in parentheses "
        "like (linear.app) or (notion.so).\n"
        "You may use web search to verify, but do NOT just rewrite SEO roundup "
        "articles — prioritize products people recognize and use.\n\n"
        f"Question: {prompt}"
    )

    last_error: Optional[Exception] = None
    for attempt in range(3):
        try:
            kwargs: Dict[str, Any] = {
                "model": model,
                "input": instruction,
            }
            if use_web_search:
                kwargs["tools"] = [{"type": "web_search"}]
                # Prefer search when available; some tiny models reject the tool entirely.
                kwargs["tool_choice"] = "auto"

            response = client.responses.create(**kwargs)
            text = getattr(response, "output_text", None) or ""
            citations = _collect_citations(response) if use_web_search else []
            web_searches = _domain_map_from_answer(
                prompt, text, citations, target_domain
            )

            return {
                "prompt": prompt,
                "results": {
                    "chatgpt": [
                        {
                            "model": model,
                            "response": text,
                            "web_searches": web_searches,
                            "citations": citations,
                            "success": True,
                            "run_number": 1,
                        }
                    ],
                    # Keep gemini key empty-compatible for legacy loaders: mirror under chatgpt only
                },
                "summary": {
                    "chatgpt": {
                        "total_runs": 1,
                        "successful_runs": 1,
                        "success_rate": 1.0,
                        "total_web_searches": 1,
                        "unique_web_searches": 1,
                        "web_search_queries": [prompt],
                    }
                },
            }
        except Exception as e:  # noqa: BLE001
            last_error = e
            warnings.warn(f"ChatGPT prompt failed (attempt {attempt+1}): {e}")
            if is_quota_error(e):
                raise QuotaExhaustedError(quota_message("OpenAI")) from e
            if is_fatal_model_error(e):
                raise RuntimeError(
                    f"OpenAI model/tool config error ({model}): {e}"
                ) from e
            time.sleep(1.2 * (attempt + 1))

    return {
        "prompt": prompt,
        "results": {
            "chatgpt": [
                {
                    "model": model,
                    "response": "",
                    "web_searches": {prompt: {}},
                    "success": False,
                    "error": str(last_error),
                    "run_number": 1,
                }
            ]
        },
        "summary": {},
    }


def _template_paraphrases(topic: str, count: int) -> List[str]:
    base = topic.strip()
    return [
        f"how can I {base}",
        f"what is the best way to {base}",
        f"{base} for small teams",
        f"tools that help with {base}",
        f"simple ways to {base}",
    ][:count]


def generate_close_paraphrases(
    topic: str,
    api_key: Optional[str] = None,
    *,
    count: int = FANOUT_COUNT,
    model: str = DEFAULT_MODEL,
    target_domain: Optional[str] = None,
) -> List[str]:
    """Narrow fan-out paraphrases. Templates by default to avoid extra LLM spend."""
    if count <= 0:
        return []
    if not USE_LLM_PARAPHRASES:
        return _template_paraphrases(topic, count)

    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _template_paraphrases(topic, count)

    brand_toks: List[str] = []
    if target_domain:
        host = normalize_domain(target_domain)
        label = host.split(".")[0] if host else ""
        brand_toks = [t for t in (label.lower(), host.lower()) if t]

    brand = brand_toks[0] if brand_toks else ""

    client = OpenAI(api_key=api_key, timeout=60.0, max_retries=1)
    prompt = f"""Rewrite this buyer question into exactly {count} DIFFERENT related questions people would also ask ChatGPT.
Keep the SAME category and job-to-be-done. Make them sound like real users.
Vary the angle: how-to, best-of, comparison, outcome, audience.
Do NOT repeat the original word-for-word.
Do NOT include the brand "{brand}" or any domain.
Do NOT broaden into generic "best software/tools for startups".
Under 14 words, everyday English.

Original: {topic}

Return ONLY JSON: {{"queries":["..."]}}"""

    try:
        response = client.responses.create(
            model=model,
            input=prompt,
        )
        text = getattr(response, "output_text", None) or ""
        import json

        match = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(match.group(0) if match else text)
        queries = data.get("queries") if isinstance(data, dict) else data
        cleaned = [str(q).strip() for q in (queries or []) if str(q).strip()]
        ordered: List[str] = []
        for q in cleaned:
            if q.lower() == topic.lower():
                continue
            if q not in ordered:
                ordered.append(q)
        if len(ordered) >= count:
            return ordered[:count]
        # Pad with light variations if the model returned too few
        for extra in (
            f"how can I {topic}",
            f"what is the best way to {topic}",
            f"{topic} for small teams",
            f"tools that help with {topic}",
            f"simple ways to {topic}",
        ):
            if extra.lower() != topic.lower() and extra not in ordered:
                ordered.append(extra)
            if len(ordered) >= count:
                break
        return ordered[:count] or [f"tools for {topic}"]
    except Exception as e:  # noqa: BLE001
        if is_quota_error(e):
            # Templates are fine for paraphrases; don't burn retries on quota.
            warnings.warn(f"Paraphrase gen quota hit, using templates: {e}")
        else:
            warnings.warn(f"Paraphrase gen failed: {e}")
        return [
            f"how can I {topic}",
            f"what is the best way to {topic}",
            f"{topic} for small teams",
            f"tools that help with {topic}",
            f"simple ways to {topic}",
        ][:count]


def run_chatgpt_fanout(
    topics: List[str],
    api_key: Optional[str] = None,
    *,
    subqueries_per_topic: int = FANOUT_COUNT,
    model: str = DEFAULT_MODEL,
    max_workers: int = CHAT_WORKERS,
    target_domain: Optional[str] = None,
    use_web_search: bool = True,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """
    Fan out topics, run ChatGPT (+ optional web_search) on each subquery.
    Returns experiments in the analytics-compatible shape (results.chatgpt,
    and also mirrored to results.gemini for the existing loader).
    """
    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY must be set")

    topics = [t.strip() for t in topics if t and t.strip()]
    if not topics:
        return [], {}

    target_domain = normalize_domain(target_domain) if target_domain else None

    topic_to_subs: Dict[str, List[str]] = {}
    with ThreadPoolExecutor(max_workers=min(max_workers, len(topics))) as pool:
        futures = {
            pool.submit(
                generate_close_paraphrases,
                topic,
                api_key,
                count=max(1, subqueries_per_topic - 1),
                model=model,
                target_domain=target_domain,
            ): topic
            for topic in topics
        }
        for fut in as_completed(futures):
            topic = futures[fut]
            try:
                paraphrases = fut.result() or []
            except Exception:
                paraphrases = []
            # Always run the exact parent prompt (matches what users try in ChatGPT UI)
            ordered: List[str] = [topic]
            for q in paraphrases:
                qn = (q or "").strip()
                if not qn:
                    continue
                if qn.lower() == topic.lower():
                    continue
                if qn not in ordered:
                    ordered.append(qn)
            topic_to_subs[topic] = ordered[:subqueries_per_topic] or [topic]

    jobs: List[Tuple[str, str]] = []
    for topic, subs in topic_to_subs.items():
        for sub in subs:
            jobs.append((topic, sub))

    merged: Dict[str, Dict[str, Any]] = {
        topic: {"web_searches": {}, "responses": [], "errors": []} for topic in topics
    }

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(
                run_chatgpt_prompt,
                subquery,
                api_key,
                model=model,
                target_domain=target_domain,
                use_web_search=use_web_search,
            ): (topic, subquery)
            for topic, subquery in jobs
        }
        for fut in as_completed(future_map):
            topic, subquery = future_map[fut]
            try:
                result = fut.result()
                runs = (result.get("results") or {}).get("chatgpt") or []
                if runs and runs[0].get("success"):
                    web = runs[0].get("web_searches") or {}
                    domain_map: Dict[str, Any] = {}
                    for _k, domains in web.items():
                        if isinstance(domains, dict):
                            for dom, data in domains.items():
                                nd = normalize_domain(dom) or dom
                                domain_map[nd] = data if isinstance(data, dict) else {
                                    "citations": [],
                                    "contents": [],
                                }
                    merged[topic]["web_searches"][subquery] = domain_map
                    merged[topic]["responses"].append(runs[0].get("response") or "")
                else:
                    merged[topic]["web_searches"][subquery] = {}
                    err = runs[0].get("error") if runs else "unknown"
                    merged[topic]["errors"].append(str(err))
            except Exception as e:  # noqa: BLE001
                if is_quota_error(e) or isinstance(e, QuotaExhaustedError):
                    # Cancel remaining work — billing won't recover mid-run.
                    for pending in future_map:
                        pending.cancel()
                    raise QuotaExhaustedError(quota_message("OpenAI")) from e
                merged[topic]["web_searches"][subquery] = {}
                merged[topic]["errors"].append(str(e))

    experiments: List[Dict[str, Any]] = []
    for topic in topics:
        blob = merged[topic]
        response_text = "\n\n".join(blob["responses"])
        run_payload = {
            "model": model,
            "response": response_text,
            "web_searches": blob["web_searches"],
            "success": bool(blob["web_searches"]),
            "run_number": 1,
            "fanout_subqueries": topic_to_subs.get(topic, []),
            "errors": blob["errors"],
            "provider": "chatgpt",
        }
        # Store under chatgpt; analytics loader iterates all model keys.
        experiment = {
            "prompt": topic,
            "results": {
                "chatgpt": [run_payload],
            },
            "summary": {
                "chatgpt": {
                    "total_runs": 1,
                    "successful_runs": 1 if blob["web_searches"] else 0,
                    "success_rate": 1.0 if blob["web_searches"] else 0.0,
                    "total_web_searches": len(blob["web_searches"]),
                    "unique_web_searches": len(blob["web_searches"]),
                    "web_search_queries": list(blob["web_searches"].keys()),
                }
            },
        }
        experiments.append(experiment)

    return experiments, topic_to_subs

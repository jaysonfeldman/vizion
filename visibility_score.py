"""Build the AI Visibility dashboard payload (score, KPIs, topics, competitors, recs)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from domain_utils import (
    collect_domain_occurrences,
    domains_match,
    find_matching_domain,
    is_noise_domain,
    normalize_domain,
    suggest_domain,
)


def _verdict(score: int) -> Tuple[str, str]:
    if score >= 65:
        return "strong", "Strong. AI search often names you on these prompts."
    if score >= 40:
        return "moderate", "Moderate. You show up sometimes; others still win many answers."
    if score >= 18:
        return "low", "Early. AI search rarely names you on these prompts yet."
    return "very_low", "Not showing up yet. AI search isn't naming you on these prompts."


def _score_from_rates(
    citation_rate: float,
    presence_rate: float,
    share_of_voice: float,
    avg_rank: Optional[float],
    top_competitor_cites: int,
    our_citation_events: int,
) -> int:
    """
    Citation-first score that doesn't crush mid-pack brands.

    Previous formula gave Semrush (~47% cite rate) a 32 because absolute
    citation indexes were huge and raw share-of-voice is tiny in crowded answers.
    """
    # Relative share vs the leader on this sample (1.0 = tied with #1)
    if our_citation_events <= 0:
        relative_sov = 0.0
    elif top_competitor_cites <= 0:
        relative_sov = 1.0
    else:
        relative_sov = min(1.0, our_citation_events / top_competitor_cites)

    # Relative ranks are typically 1–8 now; rank 1 => 1.0, rank 5 => 0.2
    if avg_rank is None:
        rank_quality = 0.0
    else:
        rank_quality = max(0.0, min(1.0, (6.0 - avg_rank) / 5.0))

    # Presence matters: being retrieved is half the battle for smaller brands
    raw = (
        0.40 * citation_rate
        + 0.25 * presence_rate
        + 0.20 * relative_sov
        + 0.15 * rank_quality
    )

    # Mild lift so "sometimes cited" doesn't look like failure
    # sqrt maps 0.25 → 0.50, 0.49 → 0.70
    lifted = raw ** 0.55
    return int(max(0, min(100, round(100 * lifted))))


def _winner_for_query(domains: Dict[str, Any], target: str) -> Optional[str]:
    """Domain with the best (lowest) citation rank among non-target domains."""
    best: Optional[Tuple[int, str]] = None
    for domain, data in domains.items():
        nd = normalize_domain(domain)
        if not nd or is_noise_domain(nd) or domains_match(nd, target):
            continue
        citations = (data or {}).get("citations") or []
        if not citations:
            continue
        rank = min(citations)
        if best is None or rank < best[0]:
            best = (rank, nd)
    return best[1] if best else None


def build_visibility_report(
    search_data: Dict[str, Dict[str, Dict[str, Any]]],
    target_domain: str,
    *,
    topic_categories: Optional[Dict[str, str]] = None,
    gemini_insights: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build a citation-first visibility report from fan-out experiment data.

    search_data shape: { topic_prompt: { subquery: { domain: {citations, contents} } } }
    """
    target = normalize_domain(target_domain)
    topic_categories = topic_categories or {}
    gemini_insights = gemini_insights or {}

    all_domain_hits = collect_domain_occurrences(search_data)
    suggestion = None
    # If target never appears, suggest a close domain from results
    matched_any = any(
        find_matching_domain(target, domains.keys())
        for queries in search_data.values()
        for domains in queries.values()
    )
    if not matched_any:
        suggestion = suggest_domain(target, all_domain_hits, min_hits=1)

    topics_out: List[Dict[str, Any]] = []
    total_subs = 0
    cited_subs = 0
    retrieved_subs = 0
    rank_values: List[int] = []
    our_citation_events = 0
    all_citation_events = 0
    competitor_cite_counts: Dict[str, int] = defaultdict(int)
    competitor_presence: Dict[str, int] = defaultdict(int)
    losing_queries: List[Dict[str, Any]] = []

    for topic, queries in search_data.items():
        sub_rows: List[Dict[str, Any]] = []
        topic_cited = 0
        topic_retrieved = 0

        for query, domains in queries.items():
            total_subs += 1
            matched = find_matching_domain(target, domains.keys())
            retrieved = matched is not None
            citations = []
            contents: List[str] = []
            text_mention = False
            if matched and matched in domains:
                blob = domains[matched] or {}
                citations = list(blob.get("citations") or [])
                contents = list(blob.get("contents") or [])
                text_mention = bool(blob.get("text_mention"))
            elif matched:
                # key may differ by normalization
                for d, data in domains.items():
                    if domains_match(d, matched):
                        citations = list((data or {}).get("citations") or [])
                        contents = list((data or {}).get("contents") or [])
                        text_mention = bool((data or {}).get("text_mention"))
                        break

            if text_mention and not citations:
                citations = [2]
            cited = bool(citations) or text_mention
            best_rank = min(citations) if citations else None
            if retrieved:
                retrieved_subs += 1
                topic_retrieved += 1
            if cited:
                cited_subs += 1
                topic_cited += 1
                rank_values.extend(citations)
                our_citation_events += len(citations)

            for d, data in domains.items():
                nd = normalize_domain(d)
                if not nd or is_noise_domain(nd) or domains_match(nd, target):
                    continue
                competitor_presence[nd] += 1
                cites = (data or {}).get("citations") or []
                if cites:
                    competitor_cite_counts[nd] += len(cites)
                    all_citation_events += len(cites)

            all_citation_events += len(citations)

            winner = _winner_for_query(domains, target)
            status = "cited" if cited else ("retrieved" if retrieved else "missing")

            sources: List[Dict[str, Any]] = []
            for d, data in domains.items():
                nd = normalize_domain(d)
                if not nd or is_noise_domain(nd):
                    continue
                blob = data or {}
                url = blob.get("url") or ""
                urls = list(blob.get("urls") or [])
                if not url and urls:
                    url = urls[0]
                if not url:
                    url = f"https://{nd}"
                sources.append(
                    {
                        "domain": nd,
                        "url": url,
                        "title": (blob.get("titles") or [None])[0]
                        or (blob.get("contents") or [None])[0]
                        or nd,
                        "is_you": bool(domains_match(nd, target)),
                    }
                )
            # You first, then by whether cited-ish (has citations)
            sources.sort(
                key=lambda s: (
                    0 if s["is_you"] else 1,
                    0
                    if (domains.get(s["domain"]) or {}).get("citations")
                    else 1,
                    s["domain"],
                )
            )

            # Guarantee the matched target appears when we counted a hit
            if matched and cited:
                if not any(s["is_you"] for s in sources):
                    sources.insert(
                        0,
                        {
                            "domain": normalize_domain(matched),
                            "url": f"https://{normalize_domain(matched)}",
                            "title": "Named in answer",
                            "is_you": True,
                        },
                    )

            row = {
                "query": query,
                "status": status,
                "retrieved": retrieved,
                "cited": cited,
                "rank": best_rank,
                "avg_rank": (sum(citations) / len(citations)) if citations else None,
                "total_citations": len(citations),
                "total_sources": len(domains),
                "all_domains": [s["domain"] for s in sources],
                "sources": sources,
                "winner": winner,
                "matched_as": matched,
            }
            sub_rows.append(row)

            if not cited:
                evidence = ""
                if winner and winner in {normalize_domain(d) for d in domains}:
                    for d, data in domains.items():
                        if domains_match(d, winner):
                            contents_w = (data or {}).get("contents") or []
                            if contents_w:
                                evidence = contents_w[0][:240]
                            break
                losing_queries.append(
                    {
                        "topic": topic,
                        "query": query,
                        "status": status,
                        "winner": winner,
                        "evidence": evidence,
                    }
                )

        n = max(len(sub_rows), 1)
        topics_out.append(
            {
                "prompt": topic,
                "category": topic_categories.get(topic, "General"),
                "sub_query_count": len(sub_rows),
                "citation_rate": topic_cited / n,
                "presence_rate": topic_retrieved / n,
                "cited_count": topic_cited,
                "retrieved_count": topic_retrieved,
                "missing_count": len(sub_rows) - topic_retrieved,
                "sub_queries": sub_rows,
            }
        )

    sample_size = total_subs
    citation_rate = (cited_subs / sample_size) if sample_size else 0.0
    presence_rate = (retrieved_subs / sample_size) if sample_size else 0.0
    avg_rank = (sum(rank_values) / len(rank_values)) if rank_values else None
    share_of_voice = (
        our_citation_events / all_citation_events if all_citation_events else 0.0
    )

    top_competitor_cites = max(competitor_cite_counts.values()) if competitor_cite_counts else 0
    score = _score_from_rates(
        citation_rate,
        presence_rate,
        share_of_voice,
        avg_rank,
        top_competitor_cites,
        our_citation_events,
    )
    verdict, verdict_blurb = _verdict(score)

    top_competitor = None
    competitors = []
    for domain, cites in sorted(
        competitor_cite_counts.items(), key=lambda x: x[1], reverse=True
    )[:8]:
        competitors.append(
            {
                "domain": domain,
                "citations": cites,
                "presence": competitor_presence.get(domain, 0),
                "share_of_voice": (cites / all_citation_events) if all_citation_events else 0.0,
            }
        )
    if competitors:
        top_competitor = competitors[0]

    summary_parts = [
        f"You appear (cited) in {cited_subs} of {sample_size} AI search checks"
        f" ({citation_rate:.0%})."
    ]
    if top_competitor:
        summary_parts.append(
            f" Top competitor {top_competitor['domain']} leads with"
            f" {top_competitor['citations']} citations"
            f" ({top_competitor['share_of_voice']:.0%} share of voice)."
        )
    else:
        summary_parts.append(" No clear competitors dominated these answers.")
    if suggestion:
        summary_parts.append(
            f" Note: your domain was never found. Did you mean {suggestion}?"
        )

    # Recommendations: prefer Gemini insights when available, else heuristic on losses
    recommendations: List[Dict[str, Any]] = []
    poor = (gemini_insights.get("poor_performance_analysis") or {})
    for topic_key, analysis in poor.items():
        text = ""
        if isinstance(analysis, dict):
            text = analysis.get("gemini_analysis") or ""
        elif isinstance(analysis, str):
            text = analysis
        if text and not str(text).startswith("ERROR"):
            recommendations.append(
                {
                    "priority": "high",
                    "topic": topic_key,
                    "query": topic_key,
                    "insight": text,
                    "competitor": None,
                    "evidence": None,
                    "source": "gemini",
                }
            )

    # Fill with evidence-linked losses if we have fewer than 5 recs
    for loss in losing_queries:
        if len(recommendations) >= 6:
            break
        if loss["status"] == "missing" and loss.get("winner"):
            recommendations.append(
                {
                    "priority": "high" if loss["status"] == "missing" else "medium",
                    "topic": loss["topic"],
                    "query": loss["query"],
                    "insight": (
                        f"You're missing for “{loss['query']}”. "
                        f"{loss['winner']} is getting cited instead"
                        + (
                            f' with content like: “{loss["evidence"]}”'
                            if loss.get("evidence")
                            else "."
                        )
                    ),
                    "competitor": loss.get("winner"),
                    "evidence": loss.get("evidence"),
                    "source": "fanout",
                }
            )
        elif loss["status"] == "retrieved" and not loss.get("winner"):
            recommendations.append(
                {
                    "priority": "medium",
                    "topic": loss["topic"],
                    "query": loss["query"],
                    "insight": (
                        f"You were retrieved for “{loss['query']}” but not cited. "
                        "Strengthen a clear, quotable answer on that page."
                    ),
                    "competitor": None,
                    "evidence": None,
                    "source": "fanout",
                }
            )

    if not recommendations:
        recommendations.append(
            {
                "priority": "low",
                "topic": None,
                "query": None,
                "insight": "No major gaps detected in this sample. Expand topics to dig deeper.",
                "competitor": None,
                "evidence": None,
                "source": "system",
            }
        )

    return {
        "normalized_domain": target,
        "domain_suggestion": suggestion,
        "visibility_score": score,
        "verdict": verdict,
        "verdict_label": {
            "strong": "Strong",
            "moderate": "Moderate",
            "low": "Low",
            "very_low": "Very low",
        }.get(verdict, verdict),
        "verdict_summary": " ".join(summary_parts),
        "verdict_blurb": verdict_blurb,
        "kpis": {
            "citation_rate": round(citation_rate, 4),
            "presence_rate": round(presence_rate, 4),
            "avg_rank": round(avg_rank, 2) if avg_rank is not None else None,
            "share_of_voice": round(share_of_voice, 4),
            "sample_size": sample_size,
            "cited_count": cited_subs,
            "retrieved_count": retrieved_subs,
            "missing_count": sample_size - retrieved_subs,
            "topic_count": len(topics_out),
        },
        "topics": topics_out,
        "competitors": competitors,
        "recommendations": recommendations,
        "top_competitor": top_competitor,
    }

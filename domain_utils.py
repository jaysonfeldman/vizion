"""Domain normalization and fuzzy matching for AI visibility scoring."""

from __future__ import annotations

import re
from typing import Iterable, List, Optional, Set, Tuple
from urllib.parse import urlparse

# Common multi-part public suffixes (not exhaustive, good enough for matching).
_MULTI_PART_SUFFIXES = {
    "co.uk",
    "com.au",
    "co.nz",
    "co.jp",
    "com.br",
    "co.in",
    "com.mx",
    "org.uk",
    "net.au",
    "co.kr",
    "com.sg",
    "co.za",
}


# Hosts that are Gemini/Google Search grounding proxies — not real publishers.
_GROUNDING_NOISE_SUFFIXES = (
    "vertexaisearch.cloud.google.com",
    "grounding.google.com",
    "googleusercontent.com",
    "gstatic.com",
)
_GROUNDING_NOISE_EXACT = {
    "google.com",
    "www.google.com",
    "googleapis.com",
    "vertexaisearch.cloud.google.com",
}


def is_noise_domain(value: str) -> bool:
    """True for Google grounding redirect hosts and other non-publisher noise."""
    nd = normalize_domain(value)
    if not nd:
        return True
    if nd in _GROUNDING_NOISE_EXACT:
        return True
    for suffix in _GROUNDING_NOISE_SUFFIXES:
        if nd == suffix or nd.endswith("." + suffix):
            return True
    # Bare redirect-style hosts
    if "vertexaisearch" in nd or nd.startswith("grounding-"):
        return True
    return False


def normalize_domain(value: str) -> str:
    """Normalize a URL or hostname to a bare lowercase domain without www."""
    if not value:
        return ""

    text = value.strip().lower()
    # Strip scheme if present
    if "://" in text:
        try:
            parsed = urlparse(text if "://" in text else f"https://{text}")
            text = parsed.netloc or parsed.path
        except Exception:
            text = text.split("://", 1)[-1]

    text = text.split("/")[0].split("?")[0].split("#")[0]
    text = text.split(":")[0]  # drop port
    if text.startswith("www."):
        text = text[4:]

    # Sometimes Gemini titles include path noise or trailing dots
    text = text.strip(".")
    return text


def registrable_domain(domain: str) -> str:
    """Best-effort eTLD+1 (e.g. blog.anthropic.com -> anthropic.com)."""
    domain = normalize_domain(domain)
    if not domain or "." not in domain:
        return domain

    parts = domain.split(".")
    if len(parts) <= 2:
        return domain

    last_two = ".".join(parts[-2:])
    last_three = ".".join(parts[-3:])
    if last_two in _MULTI_PART_SUFFIXES or (
        len(parts) >= 3 and ".".join(parts[-2:]) in _MULTI_PART_SUFFIXES
    ):
        return last_three if len(parts) >= 3 else domain
    # Check multi-part: co.uk style
    if len(parts) >= 3 and ".".join(parts[-2:]) in _MULTI_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return last_two


def domains_match(a: str, b: str) -> bool:
    """True if two domains refer to the same site (www / subdomain tolerant)."""
    na, nb = normalize_domain(a), normalize_domain(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    ra, rb = registrable_domain(na), registrable_domain(nb)
    if ra and rb and ra == rb:
        return True
    # Subdomain containment on same registrable domain already covered;
    # also allow exact suffix match for shallow cases.
    if na.endswith("." + nb) or nb.endswith("." + na):
        return True
    return False


def find_matching_domain(target: str, candidates: Iterable[str]) -> Optional[str]:
    """Return the candidate that matches target, if any."""
    for candidate in candidates:
        if domains_match(target, candidate):
            return normalize_domain(candidate)
    return None


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def suggest_domain(
    target: str,
    candidates: Iterable[str],
    *,
    min_hits: int = 2,
) -> Optional[str]:
    """
    If target never matched but a close/popular domain appears often, suggest it.
    Handles typos like anthropic.ai vs anthropic.com.
    """
    target_n = normalize_domain(target)
    target_reg = registrable_domain(target_n)
    target_label = target_reg.split(".")[0] if target_reg else target_n.split(".")[0]

    counts: dict[str, int] = {}
    for c in candidates:
        nc = normalize_domain(c)
        if not nc or domains_match(target_n, nc):
            continue
        key = registrable_domain(nc)
        counts[key] = counts.get(key, 0) + 1

    if not counts:
        return None

    scored: List[Tuple[int, int, str]] = []
    for domain, hits in counts.items():
        if hits < min_hits:
            continue
        label = domain.split(".")[0]
        # Same brand label, different TLD (anthropic.ai vs anthropic.com)
        if label == target_label and domain != target_reg:
            scored.append((0, -hits, domain))
            continue
        dist = _levenshtein(target_reg or target_n, domain)
        # Only suggest close typos
        if dist <= 2 or (
            label
            and target_label
            and _levenshtein(label, target_label) <= 1
            and hits >= min_hits
        ):
            scored.append((dist, -hits, domain))

    if not scored:
        # Fallback: if the most frequent competitor shares the brand label loosely
        top = max(counts.items(), key=lambda x: x[1])
        top_label = top[0].split(".")[0]
        if (
            top[1] >= max(3, min_hits)
            and target_label
            and top_label
            and (
                top_label.startswith(target_label[:4])
                or target_label.startswith(top_label[:4])
            )
            and len(target_label) >= 4
        ):
            return top[0]
        return None

    scored.sort()
    return scored[0][2]


def collect_all_domains(search_data: dict) -> Set[str]:
    """Flatten every domain seen in analytics search_data (unique)."""
    out: Set[str] = set()
    for queries in search_data.values():
        for domains in queries.values():
            for domain in domains.keys():
                nd = normalize_domain(domain)
                if nd and not is_noise_domain(nd):
                    out.add(nd)
    return out


def collect_domain_occurrences(search_data: dict) -> List[str]:
    """Flatten every domain occurrence (with duplicates for frequency)."""
    out: List[str] = []
    for queries in search_data.values():
        for domains in queries.values():
            for domain in domains.keys():
                nd = normalize_domain(domain)
                if nd and not is_noise_domain(nd):
                    out.append(nd)
    return out

"""Detect fatal billing / quota errors so we fail fast instead of retrying."""

from __future__ import annotations


class QuotaExhaustedError(RuntimeError):
    """Raised when an LLM provider rejects the call for billing/quota reasons."""


_QUOTA_MARKERS = (
    "insufficient_quota",
    "resource_exhausted",
    "credits are depleted",
    "exceeded your current quota",
    "prepayment credits",
    "check your plan and billing",
)


def is_quota_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return any(marker in text for marker in _QUOTA_MARKERS)


def is_fatal_model_error(exc: BaseException) -> bool:
    """True for config errors that won't recover with retries (bad model id, unsupported tool)."""
    text = str(exc).lower()
    markers = (
        "is no longer available",
        "not_found",
        "is not supported with",
        "does not exist",
        "model_not_found",
    )
    return any(marker in text for marker in markers)


def quota_message(provider: str) -> str:
    return (
        f"{provider} API credits are depleted. "
        "Add billing credits for that provider, then try again."
    )

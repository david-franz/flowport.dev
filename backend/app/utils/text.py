"""Text processing helpers used across the Flowport backend."""

from __future__ import annotations

import re
from typing import Iterable


WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """Normalize whitespace in the provided text."""

    return WHITESPACE_RE.sub(" ", text).strip()


def chunk_text(text: str, chunk_size: int = 750, chunk_overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks by word count."""

    normalized = normalize_text(text)
    if not normalized:
        return []

    words = normalized.split()
    if not words:
        return []

    step = max(1, chunk_size - chunk_overlap)
    chunks: list[str] = []
    for start in range(0, len(words), step):
        chunk_words = words[start : start + chunk_size]
        if not chunk_words:
            continue
        chunks.append(" ".join(chunk_words))
    return chunks


def truncate(text: str, max_chars: int) -> str:
    """Return an abbreviated version of *text* with ellipsis when needed."""

    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def ensure_list(value: str | Iterable[str]) -> list[str]:
    """Ensure the returned value is a list of strings."""

    if isinstance(value, str):
        return [value]
    return [str(item) for item in value]

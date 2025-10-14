"""Pydantic schemas for knowledge base operations."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class KnowledgeBaseSource(str, Enum):
    """Enumeration of knowledge base origins."""

    USER = "user"
    PREBUILT = "prebuilt"


class KnowledgeBaseCreateRequest(BaseModel):
    """Request payload to create a knowledge base."""

    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class KnowledgeItem(BaseModel):
    """Structured knowledge item used for automatic ingestion."""

    title: str = Field(..., min_length=1, max_length=160)
    content: str = Field(..., min_length=1)


class KnowledgeBaseAutoBuildRequest(BaseModel):
    """Request payload for automatic knowledge base creation."""

    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    knowledge_items: list[KnowledgeItem] = Field(default_factory=list)
    chunk_size: int = Field(default=750, ge=100, le=4000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)


class TextIngestRequest(BaseModel):
    """Request payload for direct text ingestion."""

    title: str = Field(..., min_length=1, max_length=160)
    content: str = Field(..., min_length=1)
    chunk_size: int = Field(default=750, ge=100, le=4000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)


class KnowledgeBaseSummary(BaseModel):
    """Summary representation of a knowledge base."""

    id: str
    name: str
    description: str | None = None
    source: KnowledgeBaseSource = KnowledgeBaseSource.USER
    document_count: int = 0
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime
    ready: bool = False


class KnowledgeDocument(BaseModel):
    """Metadata about an ingested document."""

    id: str
    title: str
    original_filename: str | None = None
    media_type: str
    size_bytes: int
    chunk_count: int
    created_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class KnowledgeBaseDetail(KnowledgeBaseSummary):
    """Detailed knowledge base information."""

    documents: list[KnowledgeDocument] = Field(default_factory=list)


class KnowledgeChunkMatch(BaseModel):
    """A relevant knowledge chunk returned from retrieval."""

    chunk_id: str
    score: float
    content: str
    document_id: str
    document_title: str | None = None


class KnowledgeBaseQueryResponse(BaseModel):
    """Response from knowledge base retrieval."""

    knowledge_base_id: str
    query: str
    matches: list[KnowledgeChunkMatch]


class KnowledgeBaseQueryRequest(BaseModel):
    """Request payload when querying a knowledge base."""

    query: str = Field(..., min_length=1)
    top_k: int = Field(default=4, ge=1, le=20)

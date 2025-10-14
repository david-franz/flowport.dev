"""Pydantic schemas for inference operations."""

from typing import Any

from pydantic import BaseModel, Field

from .knowledge_base import KnowledgeChunkMatch


class InferenceRequest(BaseModel):
    """Request payload for Hugging Face inference."""

    hf_api_key: str = Field(..., min_length=10)
    model: str = Field(..., min_length=2)
    prompt: str = Field(..., min_length=1)
    system_prompt: str | None = None
    knowledge_base_id: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    parameters: dict[str, Any] | None = None
    context_template: str | None = Field(
        default="You are assisting a user. Use the provided context to answer the question. Context:\n{context}\n\nUser: {prompt}\nAssistant:",
        description="Template used when injecting retrieved context into the prompt.",
    )


class InferenceResponse(BaseModel):
    """Response payload for inference result."""

    model: str
    prompt: str
    payload: Any
    context: str | None = None
    knowledge_hits: list[KnowledgeChunkMatch] = Field(default_factory=list)

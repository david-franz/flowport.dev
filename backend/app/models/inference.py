"""Pydantic schemas for inference operations."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .knowledge_base import KnowledgeChunkMatch


class ChatRole(str, Enum):
    """Supported chat roles."""

    system = "system"
    user = "user"
    assistant = "assistant"


class ProviderName(str, Enum):
    """Supported inference providers."""

    huggingface = "huggingface"
    openai = "openai"
    gemini = "gemini"
    llama = "llama"


class ChatMessage(BaseModel):
    """Chat message exchanged with a model."""

    model_config = ConfigDict(use_enum_values=True)

    role: ChatRole
    content: str = Field(..., min_length=1)


class InferenceRequest(BaseModel):
    """Request payload for model inference across providers."""

    model_config = ConfigDict(use_enum_values=True)

    provider: ProviderName = Field(default=ProviderName.huggingface)
    model: str = Field(..., min_length=2)
    prompt: str | None = None
    messages: list[ChatMessage] | None = None
    system_prompt: str | None = None
    knowledge_base_id: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)
    parameters: dict[str, Any] | None = None
    context_template: str | None = Field(
        default="You are assisting a user. Use the provided context to answer the question. Context:\n{context}\n\nUser: {prompt}\nAssistant:",
        description="Template used when injecting retrieved context into the prompt.",
    )
    api_key: str | None = None
    api_keys: dict[ProviderName, str] | None = None
    hf_api_key: str | None = Field(default=None, description="Backward-compatible Hugging Face API key field.")

    @model_validator(mode="after")
    def validate_prompt_or_messages(self) -> "InferenceRequest":
        """Ensure at least a prompt or one user message is provided."""

        has_prompt = bool(self.prompt and self.prompt.strip())
        has_user_message = bool(
            self.messages and any(message.role == ChatRole.user and message.content.strip() for message in self.messages)
        )
        if not (has_prompt or has_user_message):
            raise ValueError("Provide a prompt or at least one user message")
        return self

    def resolve_api_key(self) -> str | None:
        """Return the API key for the selected provider, if available."""

        if self.api_key:
            return self.api_key.strip()

        provider_key = None
        if self.api_keys:
            provider_key = self.api_keys.get(self.provider)
        if provider_key:
            return provider_key.strip()

        if self.provider == ProviderName.huggingface and self.hf_api_key:
            return self.hf_api_key.strip()

        # Accept provider-specific direct fields such as `openai_api_key`.
        field_name = f"{self.provider.value}_api_key"
        if hasattr(self, field_name):
            value = getattr(self, field_name)
            if isinstance(value, str) and value.strip():
                return value.strip()

        return None


class InferenceResponse(BaseModel):
    """Response payload for inference result."""

    model_config = ConfigDict(use_enum_values=True)

    provider: ProviderName
    model: str
    prompt: str
    payload: Any
    output_text: str | None = None
    context: str | None = None
    knowledge_hits: list[KnowledgeChunkMatch] = Field(default_factory=list)
    messages: list[ChatMessage] = Field(default_factory=list)

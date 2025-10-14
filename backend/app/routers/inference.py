"""Inference endpoints for Flowport."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from starlette import status

from ..config import get_settings
from ..deps import get_knowledge_base_manager
from ..models.inference import (
    ChatMessage,
    ChatRole,
    InferenceRequest,
    InferenceResponse,
    ProviderName,
)
from ..models.knowledge_base import KnowledgeChunkMatch
from ..services.gemini import GeminiClient
from ..services.huggingface import HuggingFaceClient
from ..services.knowledge_base import KnowledgeBaseManager
from ..services.llama import LlamaClient
from ..services.openai import OpenAIClient


router = APIRouter(prefix="/inference", tags=["inference"])


def _render_context(matches: list[KnowledgeChunkMatch]) -> str:
    lines = []
    for match in matches:
        title = match.document_title or match.document_id
        lines.append(f"[{title}] (score={match.score:.3f})\n{match.content}")
    return "\n\n".join(lines)


@router.post("", response_model=InferenceResponse)
async def run_inference(
    payload: InferenceRequest,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> InferenceResponse:
    """Execute an inference call with optional RAG context across providers."""

    api_key = payload.resolve_api_key()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing API key for selected provider")

    settings = get_settings()
    matches: list[KnowledgeChunkMatch] = []
    context_text: str | None = None

    messages = _prepare_messages(payload)

    last_user_index = _find_last_user_index(messages)
    if last_user_index is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one user message is required")

    user_message = messages[last_user_index]
    question = user_message.content

    if payload.knowledge_base_id:
        top_k = payload.top_k or settings.default_top_k
        try:
            retrieval = manager.query(payload.knowledge_base_id, question, top_k)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        matches = retrieval.matches
        if matches:
            context_text = _render_context(matches)
            template = payload.context_template or "{prompt}"
            try:
                enriched = template.format(context=context_text, prompt=question)
            except KeyError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid context template missing key: {exc.args[0]}",
                ) from exc
            messages[last_user_index] = ChatMessage(role=ChatRole.user, content=enriched)

    try:
        provider_payload, output_text = await _dispatch_inference(payload.provider, api_key, payload, messages)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return InferenceResponse(
        provider=payload.provider,
        model=payload.model,
        prompt=messages[last_user_index].content,
        payload=provider_payload,
        output_text=output_text,
        context=context_text,
        knowledge_hits=matches,
        messages=messages,
    )


def _prepare_messages(payload: InferenceRequest) -> list[ChatMessage]:
    """Build the message history incorporating prompt and system instructions."""

    messages = [ChatMessage(role=message.role, content=message.content.strip()) for message in payload.messages or []]

    if payload.system_prompt and payload.system_prompt.strip():
        system_entry = ChatMessage(role=ChatRole.system, content=payload.system_prompt.strip())
        # Ensure a leading system message without duplicating identical entries.
        if not messages or messages[0].role != ChatRole.system or messages[0].content != system_entry.content:
            messages.insert(0, system_entry)

    if payload.prompt and payload.prompt.strip():
        has_user_message = any(message.role == ChatRole.user for message in messages)
        if not has_user_message:
            messages.append(ChatMessage(role=ChatRole.user, content=payload.prompt.strip()))

    return messages


def _find_last_user_index(messages: Sequence[ChatMessage]) -> int | None:
    """Return the index of the last user message, if present."""

    for index in range(len(messages) - 1, -1, -1):
        if messages[index].role == ChatRole.user:
            return index
    return None


async def _dispatch_inference(
    provider: ProviderName,
    api_key: str,
    payload: InferenceRequest,
    messages: list[ChatMessage],
) -> tuple[Any, str | None]:
    """Route the inference call to the correct provider and extract text output."""

    parameters = dict(payload.parameters or {})

    if provider == ProviderName.huggingface:
        client = HuggingFaceClient(api_key)
        prompt_text = _render_messages_for_text_model(messages)
        result = await client.text_inference(payload.model, prompt_text, parameters)
        return result, _extract_huggingface_text(result)

    if provider == ProviderName.openai:
        client = OpenAIClient(api_key)
        openai_messages = [message.model_dump() for message in messages]
        result = await client.chat_completion(payload.model, openai_messages, parameters)
        return result, _extract_openai_text(result)

    if provider == ProviderName.gemini:
        client = GeminiClient(api_key)
        contents, system_instruction = _render_messages_for_gemini(messages)
        result = await client.generate_content(
            payload.model,
            contents,
            system_instruction=system_instruction,
            parameters=parameters,
        )
        return result, _extract_gemini_text(result)

    if provider == ProviderName.llama:
        client = LlamaClient(api_key)
        llama_messages = [message.model_dump() for message in messages]
        result = await client.chat_completion(payload.model, llama_messages, parameters)
        return result, _extract_openai_text(result)

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")


def _render_messages_for_text_model(messages: Iterable[ChatMessage]) -> str:
    """Render chat messages into a single text prompt."""

    parts: list[str] = []
    role_labels = {
        ChatRole.system: "System",
        ChatRole.user: "User",
        ChatRole.assistant: "Assistant",
    }
    for message in messages:
        label = role_labels.get(message.role, "Message")
        content = message.content.strip()
        if content:
            parts.append(f"{label}: {content}")
    return "\n\n".join(parts).strip()


def _render_messages_for_gemini(
    messages: Iterable[ChatMessage],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Convert chat messages to Gemini's expected payload format."""

    contents: list[dict[str, Any]] = []
    system_messages: list[str] = []

    for message in messages:
        text = message.content.strip()
        if not text:
            continue
        if message.role == ChatRole.system:
            system_messages.append(text)
        elif message.role == ChatRole.assistant:
            contents.append({"role": "model", "parts": [{"text": text}]})
        else:
            contents.append({"role": "user", "parts": [{"text": text}]})

    system_instruction = None
    if system_messages:
        system_instruction = {"parts": [{"text": "\n\n".join(system_messages)}]}

    return contents, system_instruction


def _extract_huggingface_text(payload: Any) -> str | None:
    """Best-effort extraction of generated text from Hugging Face responses."""

    if isinstance(payload, str):
        return payload

    if isinstance(payload, dict):
        for key in ("generated_text", "summary_text", "text", "answer", "result"):
            value = payload.get(key)
            if isinstance(value, str):
                return value
        if "choices" in payload and isinstance(payload["choices"], list):
            return _extract_openai_text(payload)

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, str):
                return item
            if isinstance(item, dict):
                for key in ("generated_text", "summary_text", "text"):
                    value = item.get(key)
                    if isinstance(value, str):
                        return value
        return _extract_huggingface_text(payload[0]) if payload else None

    return None


def _extract_openai_text(payload: Any) -> str | None:
    """Extract text from OpenAI-style chat completion responses."""

    if not isinstance(payload, dict):
        return None

    choices = payload.get("choices")
    if not isinstance(choices, list):
        return None

    for choice in choices:
        if not isinstance(choice, dict):
            continue
        message = choice.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content
        content = choice.get("text")
        if isinstance(content, str):
            return content

    return None


def _extract_gemini_text(payload: Any) -> str | None:
    """Extract text from Gemini generateContent responses."""

    if not isinstance(payload, dict):
        return None

    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        return None

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if isinstance(content, dict):
            parts = content.get("parts")
            if isinstance(parts, list):
                for part in parts:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str):
                            return text
        # Top-level text in candidate
        text = candidate.get("text")
        if isinstance(text, str):
            return text

    return None

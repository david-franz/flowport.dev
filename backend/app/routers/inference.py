"""Inference endpoints for Flowport."""

from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from starlette import status

from ..config import get_settings
from ..deps import get_knowledge_base_manager
from ..models.inference import InferenceRequest, InferenceResponse
from ..models.knowledge_base import KnowledgeChunkMatch
from ..services.huggingface import HuggingFaceClient
from ..services.knowledge_base import KnowledgeBaseManager


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
    """Execute a Hugging Face inference call with optional RAG context."""

    settings = get_settings()
    matches: list[KnowledgeChunkMatch] = []
    context_text: str | None = None
    composed_prompt = payload.prompt

    if payload.knowledge_base_id:
        top_k = payload.top_k or settings.default_top_k
        try:
            retrieval = manager.query(payload.knowledge_base_id, payload.prompt, top_k)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        matches = retrieval.matches
        if matches:
            context_text = _render_context(matches)
            template = payload.context_template or "{prompt}"
            try:
                composed_prompt = template.format(context=context_text, prompt=payload.prompt)
            except KeyError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid context template missing key: {exc.args[0]}",
                ) from exc

    if payload.system_prompt:
        composed_prompt = f"{payload.system_prompt.strip()}\n\n{composed_prompt}".strip()

    client = HuggingFaceClient(payload.hf_api_key)
    try:
        result = await client.text_inference(payload.model, composed_prompt, payload.parameters)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return InferenceResponse(
        model=payload.model,
        prompt=composed_prompt,
        payload=result,
        context=context_text,
        knowledge_hits=matches,
    )

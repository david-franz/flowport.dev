"""API routes for managing Flowport knowledge bases."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette import status

from ..deps import get_knowledge_base_manager
from ..models.knowledge_base import (
    KnowledgeBaseAutoBuildRequest,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseDetail,
    KnowledgeBaseQueryRequest,
    KnowledgeBaseQueryResponse,
    KnowledgeBaseSummary,
    KnowledgeDocument,
    KnowledgeDocumentDetail,
    TextIngestRequest,
)
from ..services.knowledge_base import KnowledgeBaseManager


router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])


@router.get("", response_model=list[KnowledgeBaseSummary])
async def list_knowledge_bases(manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager)) -> list[KnowledgeBaseSummary]:
    """Return all knowledge bases including prebuilt ones."""

    return manager.list_knowledge_bases()


@router.post("", response_model=KnowledgeBaseDetail, status_code=status.HTTP_201_CREATED)
async def create_knowledge_base(
    payload: KnowledgeBaseCreateRequest,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeBaseDetail:
    """Create a new knowledge base."""

    try:
        return manager.create_knowledge_base(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{kb_id}", response_model=KnowledgeBaseDetail)
async def get_knowledge_base(kb_id: str, manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager)) -> KnowledgeBaseDetail:
    """Return details for a knowledge base."""

    try:
        return manager.get_knowledge_base(kb_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{kb_id}/documents/{doc_id}", response_model=KnowledgeDocumentDetail)
async def get_knowledge_document(
    kb_id: str,
    doc_id: str,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeDocumentDetail:
    """Return detailed information about a knowledge document including its chunks."""

    try:
        return manager.get_document(kb_id, doc_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{kb_id}/documents/{doc_id}/file")
async def download_knowledge_document(
    kb_id: str,
    doc_id: str,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> FileResponse:
    """Stream the original file associated with a knowledge document."""

    try:
        path, media_type, original_filename = manager.get_document_file(kb_id, doc_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    filename = original_filename or path.name
    return FileResponse(path, media_type=media_type, filename=filename)


@router.post("/{kb_id}/ingest/text", response_model=KnowledgeDocument, status_code=status.HTTP_201_CREATED)
async def ingest_text(
    kb_id: str,
    payload: TextIngestRequest,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeDocument:
    """Add free-form text to a knowledge base."""

    try:
        return await manager.ingest_text(kb_id, payload)
    except (FileNotFoundError, ValueError) as exc:
        status_code = status.HTTP_404_NOT_FOUND if isinstance(exc, FileNotFoundError) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.post("/{kb_id}/ingest/file", response_model=KnowledgeDocument, status_code=status.HTTP_201_CREATED)
async def ingest_file(
    kb_id: str,
    file: UploadFile = File(...),
    chunk_size: int = Form(default=750),
    chunk_overlap: int = Form(default=50),
    hf_api_key: str | None = Form(default=None),
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeDocument:
    """Upload a file and ingest its contents."""

    try:
        return await manager.ingest_file(
            kb_id,
            file,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            hf_api_key=hf_api_key,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/auto-build", response_model=KnowledgeBaseDetail, status_code=status.HTTP_201_CREATED)
async def auto_build(
    payload: KnowledgeBaseAutoBuildRequest,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeBaseDetail:
    """Create a knowledge base from structured knowledge items."""

    try:
        return await manager.auto_build(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{kb_id}/query", response_model=KnowledgeBaseQueryResponse)
async def query_knowledge_base(
    kb_id: str,
    payload: KnowledgeBaseQueryRequest,
    manager: KnowledgeBaseManager = Depends(get_knowledge_base_manager),
) -> KnowledgeBaseQueryResponse:
    """Retrieve the most relevant knowledge chunks for a query."""

    try:
        return manager.query(kb_id, payload.query, payload.top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

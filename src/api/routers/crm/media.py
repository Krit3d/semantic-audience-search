import uuid
import secrets
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from src.api.dependencies import get_current_user, get_db
from src.db.database import Database
from src.api.schemas import FileUploadResponse
from src.api.services.crm_helpers import FORBIDDEN_EXTENSIONS, detect_media_type
from src.config.config import MEDIA_DIR
from src.utils.url_security import is_allowed_destination

router = APIRouter(tags=["CRM Media"])
MAX_UPLOAD_SIZE = 20 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/quicktime", "video/webm", "video/x-msvideo",
    "application/pdf", "application/octet-stream",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm", ".avi", ".pdf"}


def validate_file_signature(content: bytes, extension: str) -> bool:
    if extension in {".jpg", ".jpeg"}:
        return content.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension == ".gif":
        return content.startswith((b"GIF87a", b"GIF89a"))
    if extension == ".webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    if extension == ".pdf":
        return content.startswith(b"%PDF-")
    if extension in {".mp4", ".mov", ".avi"}:
        return len(content) >= 12 and (content[4:8] == b"ftyp" or content[:4] == b"RIFF")
    if extension == ".webm":
        return content.startswith(b"\x1aE\xdf\xa3")
    return False


async def get_upload_user(request: Request, db: Database = Depends(get_db)):
    settings = request.app.state.settings
    internal_token = request.headers.get("x-internal-token", "")
    if settings.secret_key and internal_token and secrets.compare_digest(internal_token, settings.secret_key):
        return None
    return await get_current_user(request, db)


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_upload_user),
) -> FileUploadResponse:
    original_filename = file.filename or "file"
    extension = Path(original_filename).suffix.lower()
    if extension in FORBIDDEN_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Запрещённый тип файла")
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    settings = request.app.state.settings
    if file.content_type and file.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    if settings.media_bridge_url:
        if not is_allowed_destination(
            settings.media_bridge_url, getattr(settings, "media_bridge_allowed_hosts", [])
        ):
            raise HTTPException(status_code=503, detail="Media bridge destination is not allowlisted")
        headers = {}
        if settings.media_bridge_secret:
            headers["X-Bridge-Secret"] = settings.media_bridge_secret
        content = await file.read(MAX_UPLOAD_SIZE + 1)
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File too large")
        if not validate_file_signature(content[:16], extension):
            raise HTTPException(status_code=415, detail="File content does not match its extension")
        files = {"file": (original_filename, content, file.content_type)}
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{settings.media_bridge_url.rstrip('/')}/upload",
                headers=headers,
                files=files,
            )
        resp.raise_for_status()
        data = resp.json()
        return FileUploadResponse(
            media_url=data["url"],
            media_name=data["name"],
            media_type=data["type"],
            file_size=len(content),
        )
    media_type = detect_media_type(extension)
    prefix = await file.read(16)
    if not validate_file_signature(prefix, extension):
        raise HTTPException(status_code=415, detail="File content does not match its extension")
    await file.seek(0)
    saved_filename = f"{uuid.uuid4().hex}{extension}"
    destination = MEDIA_DIR / saved_filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    total_size = 0
    too_large = False
    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(min(1024 * 1024, MAX_UPLOAD_SIZE + 1 - total_size))
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_SIZE:
                too_large = True
                break
            buffer.write(chunk)
    if too_large:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="File too large")
    return FileUploadResponse(
        media_url=f"/media/{saved_filename}",
        media_name=original_filename,
        media_type=media_type,
        file_size=total_size,
    )

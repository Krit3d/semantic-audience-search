import uuid
from pathlib import Path
from urllib.parse import quote

import aiofiles
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from src.config.config import MEDIA_DIR, Settings

app = FastAPI(title="Media Bridge")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | {".pdf"}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024


def _detect_media_type(extension: str, content_type: str | None) -> str:
    if extension in IMAGE_EXTENSIONS or (content_type or "").startswith("image/"):
        return "image"
    if extension in VIDEO_EXTENSIONS or (content_type or "").startswith("video/"):
        return "video"
    return "document"


def _check_secret(request: Request, settings: Settings) -> None:
    if not settings.media_bridge_secret or request.headers.get("X-Bridge-Secret") != settings.media_bridge_secret:
        raise HTTPException(status_code=403, detail="Forbidden")


def _valid_signature(content: bytes, extension: str) -> bool:
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
    if extension == ".mkv":
        return content.startswith(b"\x1aE\xdf\xa3")
    return False


@app.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)) -> dict:
    settings = Settings() #type: ignore[call-arg]
    _check_secret(request, settings)
    original_filename = file.filename or "file"
    extension = Path(original_filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    safe_name = Path(original_filename.replace("\\", "/")).name
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    media_type = _detect_media_type(extension, file.content_type)
    destination = MEDIA_DIR / unique_name
    content = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    if not _valid_signature(content[:16], extension):
        raise HTTPException(status_code=415, detail="File content does not match its extension")
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(destination, "wb") as buffer:
        await buffer.write(content)
    return {"url": f"/media/{quote(unique_name)}", "name": safe_name, "type": media_type}


@app.get("/media/{filename}")
async def get_media(filename: str) -> FileResponse:
    root = MEDIA_DIR.resolve()
    path = (root / filename).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(status_code=404, detail="File not found")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8090)

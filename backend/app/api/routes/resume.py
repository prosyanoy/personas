import re
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Response

from app.schemas import ApiError, ResumeFetch

router = APIRouter(prefix="/resume", tags=["resume"])

MAX_BYTES = 15 * 1024 * 1024
PDF_MAGIC = b"%PDF-"

_DRIVE_FILE = re.compile(r"/file/d/([A-Za-z0-9_-]+)")

def direct_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname and "drive.google.com" in parsed.hostname:
        match = _DRIVE_FILE.search(parsed.path)
        file_id = match.group(1) if match else parse_qs(parsed.query).get("id", [None])[0]
        if file_id:
            return f"https://drive.google.com/uc?export=download&id={file_id}"
    return url

@router.post("/fetch")
async def fetch(body: ResumeFetch) -> Response:
    url = direct_url(body.url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
        raise ApiError(400, "INVALID_URL", "Provide a plain http(s) link to a PDF")
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise ApiError(502, "FETCH_FAILED", f"Could not download the file: {exc}") from exc
    if resp.status_code != 200:
        raise ApiError(502, "FETCH_FAILED", f"Remote server returned {resp.status_code}")
    data = resp.content
    if len(data) > MAX_BYTES:
        raise ApiError(413, "TOO_LARGE", "File exceeds 15 MB")
    if not data.startswith(PDF_MAGIC):
        raise ApiError(415, "NOT_A_PDF", "The link did not resolve to a PDF document")
    return Response(content=data, media_type="application/pdf")

from fastapi import APIRouter

from app import db

router = APIRouter(tags=["health"])

@router.get("/healthz")
async def healthz() -> dict:
    db.list_profiles()
    return {"status": "ok", "database": "ok"}

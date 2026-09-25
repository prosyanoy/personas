from fastapi import APIRouter

from app import db

router = APIRouter(tags=["health"])

@router.get("/healthz")
async def healthz() -> dict:
    db._connect().execute('SELECT 1').fetchone()
    return {"status": "ok", "database": "ok"}

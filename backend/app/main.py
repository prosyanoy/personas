import logging
import os

from fastapi import Depends, FastAPI
from dotenv import load_dotenv
from pathlib import Path

from app import auth
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import discussions, health, jobs, marketing, models, profiles, resume
from app.schemas import ApiError

logger = logging.getLogger("personas-backend")

def create_app() -> FastAPI:
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
    app = FastAPI(title="personas-app-backend", version="0.1.0")

    @app.exception_handler(ApiError)
    async def api_error_handler(_, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            os.environ.get('LANDING_ORIGIN', 'https://api.personas.global').rstrip('/'),
            'http://localhost:8081',
            'http://127.0.0.1:8081',
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.include_router(auth.router)
    app.include_router(health.router)
    app.include_router(marketing.router)
    app.include_router(profiles.router)
    app.include_router(resume.router, dependencies=[Depends(auth.require_user)])
    app.include_router(jobs.router, dependencies=[Depends(auth.require_user)])
    app.include_router(models.router)
    app.include_router(discussions.router)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"service": "personas-app-backend", "status": "ok"}

    return app

app = create_app()

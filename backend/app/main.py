import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import discussions, health, jobs, models, profiles, resume
from app.schemas import ApiError

logger = logging.getLogger("personas-backend")

def create_app() -> FastAPI:
    app = FastAPI(title="personas-app-backend", version="0.1.0")

    @app.exception_handler(ApiError)
    async def api_error_handler(_, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    app.include_router(health.router)
    app.include_router(profiles.router)
    app.include_router(resume.router)
    app.include_router(jobs.router)
    app.include_router(models.router)
    app.include_router(discussions.router)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"service": "personas-app-backend", "status": "ok"}

    return app

app = create_app()

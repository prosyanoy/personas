from uuid import UUID, uuid4

from fastapi import APIRouter

from pydantic import BaseModel, ConfigDict

from app import db
from app.schemas import ApiError, IngestProfile, ProfileOut

class FieldsPatch(BaseModel):

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    location: str | None = None
    expectedSalaryMin: float | None = None
    expectedSalaryMax: float | None = None
    salaryCurrency: str | None = None

router = APIRouter(prefix="/profiles", tags=["profiles"])

@router.post("/ingest")
async def ingest(body: IngestProfile) -> ProfileOut:
    return db.insert_profile(uuid4(), body)

@router.get("")
async def index() -> list[ProfileOut]:
    return db.list_profiles()

@router.get("/{profile_id}")
async def show(profile_id: UUID) -> ProfileOut:
    profile = db.get_profile(profile_id)
    if profile is None:
        raise ApiError(404, "NOT_FOUND", "Profile not found")
    return profile

@router.patch("/{profile_id}/fields")
async def patch_fields(profile_id: UUID, body: FieldsPatch) -> ProfileOut:
    profile = db.update_profile_fields(
        profile_id, body.model_dump(exclude_none=True)
    )
    if profile is None:
        raise ApiError(404, "NOT_FOUND", "Profile not found")
    return profile

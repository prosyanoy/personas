from uuid import UUID, uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict

from app import db
from app.auth import require_user
from app.schemas import ApiError, IngestProfile, ProfileOut

class FieldsPatch(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    location: str | None = None
    expectedSalaryMin: float | None = None
    expectedSalaryMax: float | None = None
    salaryCurrency: str | None = None

router = APIRouter(prefix='/profiles', tags=['profiles'])

@router.post('/ingest')
async def ingest(body: IngestProfile, user: dict = Depends(require_user)) -> ProfileOut:
    return db.insert_profile(uuid4(), body, user['id'])

@router.get('')
async def index(user: dict = Depends(require_user)) -> list[ProfileOut]:
    return db.list_profiles(user['id'])

@router.get('/{profile_id}')
async def show(profile_id: UUID, user: dict = Depends(require_user)) -> ProfileOut:
    profile = db.get_profile(profile_id, user['id'])
    if profile is None:
        raise ApiError(404, 'NOT_FOUND', 'Profile not found')
    return profile

@router.patch('/{profile_id}/fields')
async def patch_fields(profile_id: UUID, body: FieldsPatch, user: dict = Depends(require_user)) -> ProfileOut:
    profile = db.update_profile_fields(profile_id, body.model_dump(exclude_none=True), user['id'])
    if profile is None:
        raise ApiError(404, 'NOT_FOUND', 'Profile not found')
    return profile

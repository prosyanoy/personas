from uuid import UUID

from fastapi import APIRouter, Depends
from app.auth import require_user
from pydantic import BaseModel, Field

from app import db
from app.match import MatchPreferences, MatchResult, rank_jobs
from app.schemas import ApiError
from app.scout import ALL_SOURCES, run_scout
from app.scout.models import JobPosting, ScoutQuery, SourceName

router = APIRouter(tags=["jobs"])

class ScoutRequest(ScoutQuery):
    sources: list[SourceName] | None = None

class SourceSummary(BaseModel):
    source: str
    count: int

class ScoutResponse(BaseModel):
    total: int
    per_source: list[SourceSummary]
    jobs: list[JobPosting]

class MatchRequest(BaseModel):
    profile_id: UUID | None = None
    preferences: MatchPreferences = Field(default_factory=MatchPreferences)
    limit: int = Field(default=50, ge=1, le=200)
    source: SourceName | None = None

@router.post("/scout/run")
def scout(body: ScoutRequest) -> ScoutResponse:
    query = ScoutQuery(
        keywords=body.keywords,
        location=body.location,
        limit_per_source=body.limit_per_source,
        remote_ok=body.remote_ok,
    )
    results = run_scout(query, sources=body.sources)
    jobs = [j for jobs in results.values() for j in jobs]
    return ScoutResponse(
        total=len(jobs),
        per_source=[
            SourceSummary(source=s, count=len(jobs)) for s, jobs in results.items()
        ],
        jobs=jobs,
    )

@router.get("/jobs")
async def list_jobs(source: SourceName | None = None, limit: int = 200) -> list[JobPosting]:
    return db.list_jobs(source=source, limit=limit)

@router.post("/match")
async def match(body: MatchRequest, user: dict = Depends(require_user)) -> list[MatchResult]:
    prefs = body.preferences
    if body.profile_id or (not prefs.skills and prefs.years_experience is None):
        if body.profile_id:
            profile = db.get_profile(body.profile_id, user['id'])
        else:
            profiles = db.list_profiles(user['id'])
            profile = profiles[0] if profiles else None
        if body.profile_id and profile is None:
            raise ApiError(404, "NOT_FOUND", "Profile not found")
        if profile is not None:
            if not prefs.skills:
                prefs.skills = profile.fields.skills
            if prefs.years_experience is None:
                prefs.years_experience = profile.fields.yearsExperience
            if not prefs.locations and profile.fields.location:
                prefs.locations = [profile.fields.location]
            if prefs.expected_salary_min is None:
                prefs.expected_salary_min = profile.fields.expectedSalaryMin
            if prefs.expected_salary_max is None:
                prefs.expected_salary_max = profile.fields.expectedSalaryMax
            if profile.fields.salaryCurrency:
                prefs.salary_currency = profile.fields.salaryCurrency

    jobs = db.list_jobs(source=body.source, limit=1000)
    return rank_jobs(jobs, prefs, limit=body.limit)

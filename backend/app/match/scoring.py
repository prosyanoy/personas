import re
import unicodedata
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.scout.models import JobPosting

class MatchPreferences(BaseModel):

    skills: list[str] = Field(default_factory=list)
    years_experience: float | None = None
    locations: list[str] = Field(default_factory=list)
    remote_ok: bool = True
    expected_salary_min: float | None = None
    expected_salary_max: float | None = None
    salary_currency: str = "INR"

class FeatureScores(BaseModel):
    skills: float
    experience: float
    location: float
    salary: float
    freshness: float

class MatchResult(BaseModel):
    job: JobPosting
    features: FeatureScores
    score: float
    suggested_band: str
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)

_NEUTRAL = 0.5

_FX_TO_INR = {"INR": 1.0, "USD": 83.0, "EUR": 90.0, "GBP": 105.0}

_SYNONYMS = {
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "mongo": "mongodb",
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "golang": "go",
    "reactjs": "react",
    "node": "nodejs",
    "node.js": "nodejs",
    "cpp": "c++",
    "csharp": "c#",
}

def _norm_skill(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).lower().strip()
    s = re.sub(r"[^a-z0-9+#. ]", "", s)
    s = re.sub(r"\s+", " ", s)
    return _SYNONYMS.get(s, s)

def _skill_hits(user_skills: set[str], haystack: str) -> set[str]:
    hits = set()
    low = haystack.lower()
    for sk in user_skills:
        if not sk:
            continue
        if len(sk) <= 3:
            if re.search(rf"(?<![a-z0-9]){re.escape(sk)}(?![a-z0-9])", low):
                hits.add(sk)
        elif sk in low:
            hits.add(sk)
    return hits

def _score_skills(job: JobPosting, prefs: MatchPreferences) -> tuple[float, list[str], list[str]]:
    user = {_norm_skill(s) for s in prefs.skills if s.strip()}
    if not user:
        return _NEUTRAL, [], []

    required = {_norm_skill(s) for s in job.skills if s.strip()}
    if required:
        matched = sorted(required & user)
        missing = sorted(required - user)
        coverage = len(matched) / len(required)
        extra = _skill_hits(user - required, job.description or "")
        score = min(1.0, coverage + 0.1 * len(extra))
        return score, matched, missing

    text = f"{job.title} {job.description}"
    hits = _skill_hits(user, text)
    if not text.strip():
        return _NEUTRAL, [], []
    return min(1.0, len(hits) / max(3, len(user) * 0.4)), sorted(hits), []

def _score_experience(job: JobPosting, prefs: MatchPreferences) -> float:
    req = job.experience_min
    if req is None:
        return 0.6
    if prefs.years_experience is None:
        return _NEUTRAL
    if req <= 0:
        return 1.0
    if prefs.years_experience >= req:
        return 1.0 if prefs.years_experience <= req * 2.5 else 0.9
    return max(0.0, prefs.years_experience / req)

def _score_location(job: JobPosting, prefs: MatchPreferences) -> float:
    job_loc = (job.location or "").lower()
    if job.remote:
        return 1.0 if prefs.remote_ok else 0.6
    if not prefs.locations:
        return _NEUTRAL
    if not job_loc:
        return _NEUTRAL
    for pref in prefs.locations:
        p = pref.lower().strip()
        if p and (p in job_loc or job_loc in p):
            return 1.0
    if "india" in job_loc and any("india" in p.lower() for p in prefs.locations):
        return 0.6
    return 0.15

def _score_salary(job: JobPosting, prefs: MatchPreferences) -> float:
    if job.salary_min is None and job.salary_max is None:
        return _NEUTRAL
    if prefs.expected_salary_min is None and prefs.expected_salary_max is None:
        return _NEUTRAL

    fx_job = _FX_TO_INR.get((job.salary_currency or "INR").upper(), 1.0)
    fx_pref = _FX_TO_INR.get(prefs.salary_currency.upper(), 1.0)
    job_min = (job.salary_min or 0) * fx_job
    job_max = (job.salary_max or job.salary_min or 0) * fx_job
    want_min = (prefs.expected_salary_min or 0) * fx_pref
    want_max = (prefs.expected_salary_max or prefs.expected_salary_min or 0) * fx_pref

    if want_min <= 0:
        return _NEUTRAL
    if job_max >= want_min and job_min <= want_max:
        return 1.0
    if job_max < want_min:
        return max(0.0, job_max / want_min)
    return 0.85

def _score_freshness(job: JobPosting) -> float:
    if job.posted_at is None:
        return 0.4
    posted = job.posted_at
    if posted.tzinfo is None:
        posted = posted.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - posted).total_seconds() / 86400
    if age_days <= 1:
        return 1.0
    if age_days <= 3:
        return 0.9
    if age_days <= 7:
        return 0.75
    if age_days <= 14:
        return 0.55
    if age_days <= 30:
        return 0.3
    return 0.1

_BANDS = [
    (0.75, "strong_match"),
    (0.55, "great_fit"),
    (0.35, "promising"),
    (0.0, "weak"),
]

def score_job(job: JobPosting, prefs: MatchPreferences) -> MatchResult:
    skills, matched, missing = _score_skills(job, prefs)
    features = FeatureScores(
        skills=round(skills, 3),
        experience=round(_score_experience(job, prefs), 3),
        location=round(_score_location(job, prefs), 3),
        salary=round(_score_salary(job, prefs), 3),
        freshness=round(_score_freshness(job), 3),
    )
    score = round(
        (
            features.skills
            + features.experience
            + features.location
            + features.salary
            + features.freshness
        )
        / 5,
        3,
    )
    band = next(label for cut, label in _BANDS if score >= cut)
    return MatchResult(
        job=job,
        features=features,
        score=score,
        suggested_band=band,
        matched_skills=matched,
        missing_skills=missing,
    )

def rank_jobs(
    jobs: list[JobPosting], prefs: MatchPreferences, limit: int = 50
) -> list[MatchResult]:
    scored = [score_job(j, prefs) for j in jobs]
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:limit]

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SourceName = Literal[
    "linkedin",
    "naukri",
    "instahyre",
    "cutshort",
    "wellfound",
    "telegram",
]

ALL_SOURCES: list[SourceName] = [
    "linkedin",
    "naukri",
    "instahyre",
    "cutshort",
    "wellfound",
    "telegram",
]

class ScoutQuery(BaseModel):

    keywords: str = "software engineer"
    location: str = ""
    limit_per_source: int = Field(default=25, ge=1, le=100)
    remote_ok: bool = True

class JobPosting(BaseModel):

    source: SourceName
    external_id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    remote: bool | None = None
    url: str = ""
    description: str = ""
    skills: list[str] = Field(default_factory=list)
    experience_min: float | None = None
    experience_max: float | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = None
    posted_at: datetime | None = None
    channel: str | None = None
    raw: dict = Field(default_factory=dict)

    @property
    def dedupe_key(self) -> str:
        base = self.url or f"{self.title}|{self.company}|{self.location}"
        return f"{self.source}:{base.strip().lower()}"

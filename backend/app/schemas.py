from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

class ApiError(Exception):

    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message
        super().__init__(message)

class ResumeFields(BaseModel):

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=160)
    location: str | None = Field(default=None, max_length=120)
    yearsExperience: float | None = Field(default=None, ge=0, le=50)
    skills: list[
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    ] = Field(default_factory=list, max_length=40)
    links: list[str] = Field(default_factory=list, max_length=20)
    education: str | None = Field(default=None, max_length=300)
    expectedSalaryMin: float | None = Field(default=None, ge=0)
    expectedSalaryMax: float | None = Field(default=None, ge=0)
    salaryCurrency: str = Field(default="INR", max_length=8)

class IngestProfile(BaseModel):

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: Literal["upload", "link", "drive"]
    fileName: str = Field(min_length=1, max_length=255)
    fileSize: int | None = Field(default=None, ge=0)
    fields: ResumeFields
    rawText: str | None = Field(default=None, max_length=100_000)

class ProfileOut(BaseModel):
    id: UUID
    source: str
    fileName: str
    fields: ResumeFields
    createdAt: str

class ResumeFetch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    url: str = Field(min_length=8, max_length=2000)

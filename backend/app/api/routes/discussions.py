import json

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app import db
from app.schemas import ApiError

router = APIRouter(tags=["discussions"])

class SharedQuestionIn(BaseModel):
    question: str = Field(min_length=8, max_length=400)
    topic: str | None = None
    skills: list[str] = []

class ShareRequest(BaseModel):
    profileId: str | None = None
    author: str = "You"
    questions: list[SharedQuestionIn] = Field(min_length=1, max_length=10)

class PostRequest(BaseModel):
    profileId: str | None = None
    author: str = "You"
    question: str = Field(min_length=8, max_length=400)
    description: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=10)

class AnswerRequest(BaseModel):
    author: str = "Anonymous"
    body: str = Field(min_length=2, max_length=2000)

def _author_match(stored: str | None, given: str | None) -> bool:
    if not stored or not given:
        return False
    return stored == given or stored.startswith(given + " ") or given.startswith(stored + " ")

def _thread_dict(
    row, answers: list, mine_profile: str | None, mine_author: str | None = None
) -> dict:
    skills = list(json.loads(row["skills"] or "[]"))
    tags = ([row["topic"]] if row["topic"] else []) + skills[:2]
    discussants = 1 + len({a["author"] for a in answers})
    mine = bool(
        (mine_profile and row["profile_id"] == mine_profile)
        or (row["kind"] != "peer" and _author_match(row["author"], mine_author))
    )
    return {
        "id": row["id"],
        "author": row["author"],
        "ago": row["created_at"],
        "title": row["question"],
        "description": row["description"],
        "kind": row["kind"] if "kind" in row.keys() else "unknown",
        "tags": tags,
        "skills": skills,
        "replies": len(answers),
        "discussants": discussants,
        "mine": mine,
        "answers": [
            {
                "id": a["id"],
                "author": a["author"],
                "body": a["body"],
                "likes": a["likes"],
                "ago": a["created_at"],
            }
            for a in answers
        ],
    }

@router.post("/discussions/share")
def share(body: ShareRequest) -> dict:
    ids = db.share_questions(
        body.profileId,
        body.author,
        [q.model_dump() for q in body.questions],
    )
    return {"ids": ids}

@router.get("/discussions")
def list_threads(
    profile_id: str | None = Query(default=None),
    author: str | None = Query(default=None),
) -> dict:
    rows = db.list_shared_questions()
    return {
        "threads": [
            _thread_dict(r, db.list_answers(r["id"]), profile_id, author) for r in rows
        ]
    }

@router.post("/discussions")
def create_post(body: PostRequest) -> dict:
    qid = db.post_question(
        body.profileId, body.author, body.question, body.description, body.topic, body.skills
    )
    return {"id": qid}

@router.post("/discussions/{question_id}/answers")
def answer(question_id: str, body: AnswerRequest) -> dict:
    if not any(r["id"] == question_id for r in db.list_shared_questions()):
        raise ApiError(404, "question_not_found", "No such shared question")
    db.add_answer(question_id, body.author, body.body)
    return {"ok": True}

@router.get("/activity/questions")
def activity(
    profile_id: str | None = Query(default=None),
    author: str | None = Query(default=None),
) -> dict:
    if not profile_id and not author:
        raise ApiError(400, "missing_identity", "profile_id or author is required")
    rows = db.list_profile_questions(profile_id, author)
    return {
        "questions": [
            _thread_dict(r, db.list_answers(r["id"]), profile_id, author) for r in rows
        ]
    }

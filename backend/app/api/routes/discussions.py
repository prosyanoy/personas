import json
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app import db
from app.auth import require_user
from app.schemas import ApiError

router = APIRouter(tags=['discussions'])

class SharedQuestionIn(BaseModel):
    question: str = Field(min_length=8, max_length=400)
    topic: str | None = None
    skills: list[str] = []

class ShareRequest(BaseModel):
    profileId: UUID | None = None
    questions: list[SharedQuestionIn] = Field(min_length=1, max_length=10)

class PostRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    profileId: UUID | None = None
    question: str = Field(min_length=8, max_length=400)
    description: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=60)
    skills: list[str] = Field(default_factory=list, max_length=10)

class AnswerRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    body: str = Field(min_length=2, max_length=2000)


def owned_profile(profile_id: UUID | None, user_id: str) -> str | None:
    if profile_id and db.get_profile(profile_id, user_id) is None:
        raise ApiError(404, 'profile_not_found', 'Profile not found')
    return str(profile_id) if profile_id else None


def _thread_dict(row, answers: list, user_id: str) -> dict:
    skills = list(json.loads(row['skills'] or '[]'))
    tags = list(dict.fromkeys(([row['topic']] if row['topic'] else []) + skills[:2]))
    people = {a['user_id'] or 'legacy:' + a['author'] for a in answers}
    people.add(row['user_id'] or 'legacy:' + row['author'])
    return {
        'id': row['id'], 'author': row['author'], 'ago': row['created_at'],
        'title': row['question'], 'description': row['description'], 'kind': row['kind'],
        'tags': tags, 'skills': skills, 'replies': len(answers),
        'discussants': len(people), 'mine': row['user_id'] == user_id,
        'answers': [{'id': a['id'], 'author': a['author'], 'body': a['body'],
                     'likes': a['likes'], 'ago': a['created_at']} for a in answers],
    }

@router.post('/discussions/share')
def share(body: ShareRequest, user: dict = Depends(require_user)) -> dict:
    ids = db.share_questions(owned_profile(body.profileId, user['id']), user['name'],
                             [q.model_dump() for q in body.questions], user['id'])
    return {'ids': ids}

@router.get('/discussions')
def list_threads(user: dict = Depends(require_user)) -> dict:
    return {'threads': [_thread_dict(r, db.list_answers(r['id']), user['id'])
                        for r in db.list_shared_questions()]}

@router.post('/discussions')
def create_post(body: PostRequest, user: dict = Depends(require_user)) -> dict:
    qid = db.post_question(owned_profile(body.profileId, user['id']), user['name'],
                           body.question, body.description, body.topic, body.skills, user['id'])
    return {'id': qid}

@router.post('/discussions/{question_id}/answers')
def answer(question_id: str, body: AnswerRequest, user: dict = Depends(require_user)) -> dict:
    if db._connect().execute('SELECT id FROM shared_questions WHERE id = ?', (question_id,)).fetchone() is None:
        raise ApiError(404, 'question_not_found', 'No such shared question')
    db.add_answer(question_id, user['name'], body.body, user['id'])
    return {'ok': True}

@router.get('/activity/questions')
def activity(user: dict = Depends(require_user)) -> dict:
    return {'questions': [_thread_dict(r, db.list_answers(r['id']), user['id'])
                          for r in db.list_profile_questions(user['id'])]}

import logging
import os
import re

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas import ApiError

router = APIRouter(prefix='/marketing', tags=['marketing'])
logger = logging.getLogger('personas-backend')


class EarlyAccessSignup(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    email: str = Field(min_length=3, max_length=255)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid email address')
        return value.lower()


@router.post('/early-access')
def join_early_access(body: EarlyAccessSignup) -> dict[str, bool]:
    api_key = os.environ.get('BREVO_API_KEY')
    list_id = os.environ.get('BREVO_LIST_ID', '')
    if not api_key or not list_id.isdecimal() or int(list_id) <= 0:
        raise ApiError(503, 'signup_unconfigured', 'Early access signup is not configured on the server.')

    try:
        response = httpx.post(
            'https://api.brevo.com/v3/contacts',
            headers={'api-key': api_key},
            json={'email': body.email, 'listIds': [int(list_id)], 'updateEnabled': True},
            timeout=15,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error('Brevo contact signup failed with status %s', exc.response.status_code)
        raise ApiError(503, 'signup_unavailable', 'Could not join the list. Please try again later.') from None
    except httpx.HTTPError:
        raise ApiError(503, 'signup_unavailable', 'Could not join the list. Please try again later.') from None
    return {'ok': True}

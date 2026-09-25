import hashlib
import hmac
import os
import re
import secrets
import time
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import db
from app.schemas import ApiError

router = APIRouter(prefix='/auth', tags=['auth'])


class CodeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(default='', max_length=120)
    purpose: Literal['registration', 'login']

    @field_validator('email')
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError('Enter a valid email address')
        return value.lower()


class CodeVerify(BaseModel):
    challengeId: str = Field(min_length=32, max_length=128)
    code: str = Field(pattern=r'^\d{6}$')


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def code_digest(challenge: str, code: str) -> str:
    secret = os.environ.get('AUTH_SECRET', '')
    if len(secret) < 32:
        raise ApiError(503, 'auth_unconfigured', 'Email sign-in is not configured on the server.')
    return hmac.new(secret.encode(), f'{challenge}:{code}'.encode(), hashlib.sha256).hexdigest()


def send_code(email: str, code: str) -> None:
    key = os.environ.get('BREVO_API_KEY')
    sender = os.environ.get('BREVO_SENDER_EMAIL')
    if not key or not sender:
        raise ApiError(503, 'email_unconfigured', 'Email delivery is not configured on the server.')
    try:
        response = httpx.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={'api-key': key},
            json={
                'sender': {'email': sender, 'name': os.environ.get('BREVO_SENDER_NAME', 'Personas')},
                'to': [{'email': email}],
                'subject': 'Your Personas verification code',
                'htmlContent': f'<p>Your Personas code is <strong>{code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>',
                'textContent': f'Your Personas code is {code}. It expires in 10 minutes. If you did not request it, ignore this email.',
            },
            timeout=15,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        raise ApiError(503, 'email_unavailable', 'Could not send the email. Please try again later.') from None


def user_dict(row) -> dict:
    return {'id': row['id'], 'email': row['email'], 'name': row['name'],
            'onboardingCompleted': bool(row['onboarding_completed'])}


def require_user(request: Request) -> dict:
    scheme, _, token = request.headers.get('Authorization', '').partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise ApiError(401, 'unauthorized', 'Please sign in to continue.')
    with db._lock:
        row = db._connect().execute(
            'SELECT u.* FROM auth_users u JOIN auth_sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?',
            (digest(token), time.time()),
        ).fetchone()
    if row is None:
        raise ApiError(401, 'unauthorized', 'Your session has expired. Please sign in again.')
    return user_dict(row)


@router.post('/request-code')
def request_code(body: CodeRequest, request: Request) -> dict:
    if body.purpose == 'registration' and not body.name:
        raise ApiError(422, 'name_required', 'Enter your name to register.')
    now = time.time()
    challenge = secrets.token_hex(24)
    code = f'{secrets.randbelow(1000000):06d}'
    hashed_code = code_digest(challenge, code)
    ip = request.client.host if request.client else 'unknown'
    with db._lock:
        conn = db._connect()
        with conn:
            conn.execute('BEGIN IMMEDIATE')
            recent = conn.execute(
                'SELECT COUNT(*), MAX(created_at) FROM auth_challenges WHERE email = ? AND created_at > ?',
                (body.email, now - 3600),
            ).fetchone()
            ip_count = conn.execute(
                'SELECT COUNT(*) FROM auth_challenges WHERE ip_hash = ? AND created_at > ?',
                (digest(ip), now - 3600),
            ).fetchone()[0]
            if recent[0] >= 5 or (recent[1] and now - recent[1] < 60) or ip_count >= 30:
                raise ApiError(429, 'rate_limited', 'Too many code requests. Wait before trying again.')
            conn.execute('UPDATE auth_challenges SET used = 1 WHERE email = ?', (body.email,))
            conn.execute(
                'INSERT INTO auth_challenges (id, email, name, purpose, code_hash, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (challenge, body.email, body.name, body.purpose, hashed_code, digest(ip), now, now + 600),
            )
            exists = conn.execute('SELECT id FROM auth_users WHERE email = ?', (body.email,)).fetchone()
    if body.purpose == 'registration' or exists:
        send_code(body.email, code)
        with db._lock:
            conn = db._connect()
            with conn:
                conn.execute('UPDATE auth_challenges SET delivered = 1 WHERE id = ?', (challenge,))
    return {'challengeId': challenge, 'expiresIn': 600, 'resendAfter': 60}


@router.post('/verify-code')
def verify_code(body: CodeVerify) -> dict:
    now = time.time()
    expected = code_digest(body.challengeId, body.code)
    result = None
    with db._lock:
        conn = db._connect()
        with conn:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute('SELECT * FROM auth_challenges WHERE id = ?', (body.challengeId,)).fetchone()
            if row and not row['used'] and row['delivered'] and row['expires_at'] > now and row['attempts'] < 5:
                conn.execute('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?', (body.challengeId,))
                if hmac.compare_digest(row['code_hash'], expected):
                    conn.execute('UPDATE auth_challenges SET used = 1 WHERE email = ?', (row['email'],))
                    if row['purpose'] == 'registration':
                        conn.execute('INSERT OR IGNORE INTO auth_users (id, email, name) VALUES (?, ?, ?)',
                                     (secrets.token_hex(16), row['email'], row['name']))
                    user = conn.execute('SELECT * FROM auth_users WHERE email = ?', (row['email'],)).fetchone()
                    if user:
                        token = secrets.token_urlsafe(48)
                        conn.execute('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
                                     (digest(token), user['id'], now + 30 * 86400))
                        result = {'accessToken': token, 'user': user_dict(user)}
    if result is None:
        raise ApiError(400, 'invalid_code', 'Code invalid or expired. Request a new code if needed.')
    return result


@router.get('/me')
def me(user: dict = Depends(require_user)) -> dict:
    return user


@router.post('/onboarding-complete')
def complete_onboarding(user: dict = Depends(require_user)) -> dict:
    with db._lock:
        conn = db._connect()
        with conn:
            conn.execute('UPDATE auth_users SET onboarding_completed = 1 WHERE id = ?', (user['id'],))
    return {**user, 'onboardingCompleted': True}


@router.post('/logout')
def logout(request: Request, user: dict = Depends(require_user)) -> dict:
    token = request.headers['Authorization'].partition(' ')[2]
    with db._lock:
        conn = db._connect()
        with conn:
            conn.execute('DELETE FROM auth_sessions WHERE token_hash = ?', (digest(token),))
    return {'ok': True}

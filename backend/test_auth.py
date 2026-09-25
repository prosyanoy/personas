import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import db
from app.main import create_app


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous_conn, self.previous_path = db._conn, db.DB_PATH
        db._conn, db.DB_PATH = None, Path(self.tmp.name) / 'test.db'
        self.env = patch.dict(os.environ, {'AUTH_SECRET': 'test-secret-' * 4})
        self.env.start()
        self.mail = patch('app.auth.send_code')
        self.send = self.mail.start()
        self.client = TestClient(create_app())

    def tearDown(self):
        self.client.close()
        self.mail.stop()
        self.env.stop()
        if db._conn:
            db._conn.close()
        db._conn, db.DB_PATH = self.previous_conn, self.previous_path
        self.tmp.cleanup()

    def challenge(self, email='alice@example.com', purpose='registration'):
        response = self.client.post('/auth/request-code', json={
            'email': email, 'name': 'Same Name', 'purpose': purpose,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['challengeId'], self.send.call_args.args[1]

    def verify(self, challenge, code):
        return self.client.post('/auth/verify-code', json={'challengeId': challenge, 'code': code})

    def login(self, email='alice@example.com'):
        challenge, code = self.challenge(email)
        response = self.verify(challenge, code)
        self.assertEqual(response.status_code, 200, response.text)
        return {'Authorization': 'Bearer ' + response.json()['accessToken']}

    def test_registration_session_replay_and_logout(self):
        challenge, code = self.challenge()
        result = self.verify(challenge, code)
        self.assertEqual(result.status_code, 200)
        headers = {'Authorization': 'Bearer ' + result.json()['accessToken']}
        self.assertEqual(self.client.get('/auth/me', headers=headers).json()['email'], 'alice@example.com')
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        self.assertEqual(self.client.post('/auth/logout', headers=headers).status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers=headers).status_code, 401)

    def test_invalid_attempts_expiry_and_cooldown(self):
        challenge, code = self.challenge()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(5):
            self.assertEqual(self.verify(challenge, wrong).status_code, 400)
        self.assertEqual(self.verify(challenge, code).status_code, 400)
        response = self.client.post('/auth/request-code', json={'email': 'alice@example.com', 'purpose': 'login'})
        self.assertEqual(response.status_code, 429)
        challenge, code = self.challenge('bob@example.com')
        with patch('app.auth.time.time', return_value=9999999999):
            self.assertEqual(self.verify(challenge, code).status_code, 400)

    def test_authorization_is_by_account_not_name(self):
        alice = self.login()
        bob = self.login('bob@example.com')
        for path in ['/profiles', '/activity/questions', '/discussions', '/jobs']:
            self.assertEqual(self.client.get(path).status_code, 401)
        profile = self.client.post('/profiles/ingest', headers=alice, json={
            'source': 'upload', 'fileName': 'resume.pdf', 'fields': {'name': 'Same Name'},
        }).json()
        self.assertEqual(self.client.get('/profiles', headers=bob).json(), [])
        self.assertEqual(self.client.get('/profiles/' + profile['id'], headers=bob).status_code, 404)
        self.assertEqual(self.client.post('/match', headers=bob, json={'profile_id': profile['id']}).status_code, 404)
        self.client.post('/discussions', headers=alice, json={'question': 'A real question here?', 'author': 'Impersonated'})
        mine = self.client.get('/activity/questions', headers=alice).json()['questions']
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]['author'], 'Same Name')
        self.assertEqual(self.client.get('/activity/questions?author=Same%20Name', headers=bob).json()['questions'], [])

    def test_login_normalization_resend_and_onboarding(self):
        headers = self.login(' Alice@Example.COM ')
        before = self.client.get('/auth/me', headers=headers).json()
        self.assertEqual(before['email'], 'alice@example.com')
        self.assertFalse(before['onboardingCompleted'])
        self.assertTrue(self.client.post('/auth/onboarding-complete', headers=headers).json()['onboardingCompleted'])
        with patch('app.auth.time.time', return_value=__import__('time').time() + 61):
            challenge, code = self.challenge('alice@example.com', 'login')
            after = self.verify(challenge, code).json()['user']
        self.assertEqual(before['id'], after['id'])
        self.assertTrue(after['onboardingCompleted'])
        with patch('app.auth.time.time', return_value=9999999999):
            self.assertEqual(self.client.get('/auth/me', headers=headers).status_code, 401)

    def test_resend_invalidates_old_code_and_unknown_login(self):
        challenge, code = self.challenge()
        with patch('app.auth.time.time', return_value=__import__('time').time() + 61):
            new, new_code = self.challenge()
            self.assertEqual(self.verify(challenge, code).status_code, 400)
            self.assertEqual(self.verify(new, new_code).status_code, 200)
        self.send.reset_mock()
        response = self.client.post('/auth/request-code', json={'email': 'nobody@example.com', 'purpose': 'login'})
        self.assertEqual(response.status_code, 200)
        self.send.assert_not_called()
        self.assertEqual(self.verify(response.json()['challengeId'], '123456').status_code, 400)

    def test_share_retry_and_cross_account_profile_write(self):
        alice = self.login()
        bob = self.login('bob@example.com')
        profile = self.client.post('/profiles/ingest', headers=alice, json={
            'source': 'upload', 'fileName': 'resume.pdf', 'fields': {},
        }).json()
        payload = {'profileId': profile['id'], 'questions': [{'question': 'How do transactions work?'}]}
        first = self.client.post('/discussions/share', headers=alice, json=payload)
        second = self.client.post('/discussions/share', headers=alice, json=payload)
        self.assertEqual(first.json()['ids'], second.json()['ids'])
        self.assertEqual(self.client.post('/discussions/share', headers=bob, json=payload).status_code, 404)
        self.assertEqual(self.client.patch('/profiles/' + profile['id'] + '/fields', headers=bob,
                                          json={'location': 'London'}).status_code, 404)
        mine = self.client.get('/activity/questions', headers=alice).json()['questions']
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]['replies'], 0)

    def test_brevo_request_contract_and_failure(self):
        import httpx
        self.mail.stop()
        from app.auth import send_code
        with patch.dict(os.environ, {'BREVO_API_KEY': 'test-only', 'BREVO_SENDER_EMAIL': 'verified@example.com'}):
            with patch('app.auth.httpx.post') as post:
                send_code('alice@example.com', '123456')
                args = post.call_args.kwargs
                self.assertEqual(args['headers']['api-key'], 'test-only')
                self.assertEqual(args['json']['to'], [{'email': 'alice@example.com'}])
                self.assertIn('123456', args['json']['textContent'])
                post.side_effect = httpx.ConnectError('unavailable')
                from app.schemas import ApiError
                with self.assertRaises(ApiError):
                    send_code('alice@example.com', '123456')
        self.mail.start()

    def test_health_and_cors(self):
        self.assertEqual(self.client.get('/healthz').status_code, 200)
        with patch.dict(os.environ, {'LANDING_ORIGIN': 'http://localhost:8081'}):
            with TestClient(create_app()) as client:
                response = client.options('/profiles/any/fields', headers={
                    'Origin': 'http://localhost:8081', 'Access-Control-Request-Method': 'PATCH',
                    'Access-Control-Request-Headers': 'authorization,content-type',
                })
        self.assertEqual(response.status_code, 200)

    def test_personas_web_origins(self):
        for origin in ['http://localhost:8081', 'http://127.0.0.1:8081', 'https://api.personas.global']:
            response = self.client.options('/auth/request-code', headers={
                'Origin': origin, 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'authorization,content-type',
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['access-control-allow-origin'], origin)
        response = self.client.options('/auth/request-code', headers={
            'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'POST',
        })
        self.assertEqual(response.status_code, 400)

    def test_mail_failure_never_creates_session(self):
        from app.schemas import ApiError
        self.send.side_effect = ApiError(503, 'email_unavailable', 'Email unavailable')
        response = self.client.post('/auth/request-code', json={
            'email': 'alice@example.com', 'name': 'Alice', 'purpose': 'registration',
        })
        self.assertEqual(response.status_code, 503)
        self.assertEqual(db._connect().execute('SELECT COUNT(*) FROM auth_users').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()

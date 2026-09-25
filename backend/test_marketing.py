import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.main import create_app


class MarketingTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'BREVO_API_KEY': 'test-key',
            'BREVO_LIST_ID': '42',
            'LANDING_ORIGIN': 'https://api.personas.global',
        })
        self.env.start()
        self.client = TestClient(create_app())

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def test_signup_adds_contact_to_brevo_list(self):
        with patch('app.api.routes.marketing.httpx.post') as send:
            send.return_value.status_code = 201
            response = self.client.post('/marketing/early-access', json={'email': '  ALICE@example.com  '})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True})
        self.assertEqual(send.call_args.kwargs['json'], {
            'email': 'alice@example.com', 'listIds': [42], 'updateEnabled': True,
        })
        self.assertEqual(send.call_args.kwargs['headers']['api-key'], 'test-key')

    def test_validation_and_missing_configuration_do_not_send(self):
        with patch('app.api.routes.marketing.httpx.post') as send:
            self.assertEqual(self.client.post('/marketing/early-access', json={'email': 'not-an-email'}).status_code, 422)
            with patch.dict(os.environ, {'BREVO_LIST_ID': ''}):
                self.assertEqual(self.client.post('/marketing/early-access', json={'email': 'alice@example.com'}).status_code, 503)
            send.assert_not_called()

    def test_upstream_failure_does_not_report_success(self):
        with patch('app.api.routes.marketing.httpx.post') as send:
            send.side_effect = httpx.TimeoutException('timeout')
            response = self.client.post('/marketing/early-access', json={'email': 'alice@example.com'})
            self.assertEqual(response.status_code, 503)
            self.assertFalse(response.json().get('ok', False))
            send.side_effect = None
            send.return_value.raise_for_status.side_effect = httpx.HTTPStatusError(
                'rejected', request=httpx.Request('POST', 'https://api.brevo.com/v3/contacts'),
                response=httpx.Response(401),
            )
            response = self.client.post('/marketing/early-access', json={'email': 'alice@example.com'})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('rejected', response.text)

    def test_cors_only_allows_landing_origin(self):
        for origin, expected in [('https://api.personas.global', 200), ('http://152.228.138.225', 400), ('https://other.example', 400)]:
            response = self.client.options('/marketing/early-access', headers={
                'Origin': origin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            })
            self.assertEqual(response.status_code, expected)
            self.assertEqual(response.headers.get('access-control-allow-origin'), origin if expected == 200 else None)


if __name__ == '__main__':
    unittest.main()

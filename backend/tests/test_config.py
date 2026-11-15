"""Configuration checks use stdlib only; these do not verify browser CORS."""
import os
from pathlib import Path
import subprocess
import sys
import unittest
import asyncio


class CorsConfigurationTests(unittest.TestCase):
    def load_origins(self, value):
        env = os.environ.copy()
        env.pop("TERRANEXIS_CORS_ORIGINS", None)
        if value is not None:
            env["TERRANEXIS_CORS_ORIGINS"] = value
        return subprocess.run(
            [sys.executable, "-c", "from app.config import CORS_ORIGINS; print(','.join(CORS_ORIGINS))"],
            cwd=Path(__file__).resolve().parents[1], env=env,
            capture_output=True, text=True, check=False,
        )

    def test_default_local_origins(self):
        result = self.load_origins(None)
        self.assertEqual(result.returncode, 0)
        self.assertIn("http://127.0.0.1:8080", result.stdout)
        self.assertNotIn("*", result.stdout)

    def test_explicit_frontend_origins_replace_defaults(self):
        result = self.load_origins("https://mission.example, https://preview.example")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "https://mission.example,https://preview.example")

    def test_wildcard_is_rejected(self):
        self.assertNotEqual(self.load_origins("*").returncode, 0)

    def test_invalid_origins_are_rejected(self):
        for origin in ("https://*.example", "https://user:secret@example.com", "https://example.com/path", "https://example.com:99999", "file:///tmp"):
            with self.subTest(origin=origin):
                self.assertNotEqual(self.load_origins(origin).returncode, 0)

    def test_empty_setting_disables_cross_origin_access(self):
        result = self.load_origins("")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "")

    def test_api_preflight_uses_configured_allowlist(self):
        from app.config import CORS_ORIGINS
        from app.main import app

        async def preflight(origin):
            messages = []
            async def receive():
                return {"type": "http.request", "body": b""}
            async def send(message):
                messages.append(message)
            await app({
                "type": "http", "method": "OPTIONS", "path": "/api/v1/missions/plan",
                "headers": [(b"origin", origin.encode()), (b"access-control-request-method", b"POST"),
                            (b"access-control-request-headers", b"content-type")],
            }, receive, send)
            return messages[0]

        for origin in CORS_ORIGINS:
            response = asyncio.run(preflight(origin))
            self.assertEqual(response["status"], 200)
            headers = dict(response["headers"])
            self.assertEqual(headers[b"access-control-allow-origin"].decode(), origin)
            self.assertNotIn(b"access-control-allow-credentials", headers)
        response = asyncio.run(preflight("https://untrusted.invalid"))
        self.assertEqual(response["status"], 400)
        self.assertNotIn(b"access-control-allow-origin", dict(response["headers"]))

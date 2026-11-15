"""Configuration checks use stdlib only; these do not verify browser CORS."""
import os
from pathlib import Path
import subprocess
import sys
import unittest


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

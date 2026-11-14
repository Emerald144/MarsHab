"""Tiny dependency-free ASGI GET client for tests.

``starlette.testclient.TestClient`` needs ``httpx``, which is not part of this project's
requirements. This helper drives the real ASGI app (routing, validation, serialization)
through the ASGI protocol using only the standard library.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib.parse import urlsplit


async def _call(app, scope) -> tuple[int, bytes]:
    status = 500
    chunks: list[bytes] = []
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await asyncio.sleep(3600)  # never reached for a complete request
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal status
        if message["type"] == "http.response.start":
            status = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    return status, b"".join(chunks)


def get(app, url: str) -> tuple[int, Any]:
    """GET ``url`` and return ``(status_code, parsed_json_or_text)``."""

    parts = urlsplit(url)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": parts.path,
        "raw_path": parts.path.encode(),
        "query_string": parts.query.encode(),
        "root_path": "",
        "headers": [(b"host", b"testserver")],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }
    status, body = asyncio.run(_call(app, scope))
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, body.decode("utf-8", "replace")

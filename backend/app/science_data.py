"""Read-only loader for the bounded TerraNexis science catalog.

This module deliberately treats unavailable locations as unavailable. It does
not read or modify SIM 3464 source products and has no Earth/WGS84 fallback.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
TARGETS_PATH = ROOT / "data" / "processed" / "science" / "targets.json"
SOURCES_PATH = ROOT / "data" / "metadata" / "science_sources.json"


def _load_json(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"{path} must contain a JSON array")
    return value


def sources() -> list[dict[str, Any]]:
    return _load_json(SOURCES_PATH)


def targets() -> list[dict[str, Any]]:
    records = _load_json(TARGETS_PATH)
    ids = [record.get("id") for record in records]
    if len(ids) != len(set(ids)) or any(not item for item in ids):
        raise ValueError("science target IDs must be present and unique")
    for record in records:
        location = record.get("location", {})
        if record.get("route_waypoint_eligible") and not location.get("location_verified"):
            raise ValueError("route-eligible targets require a verified location")
    return records


def find_target(target_id: str) -> dict[str, Any] | None:
    return next((record for record in targets() if record["id"] == target_id), None)

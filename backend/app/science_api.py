"""Optional isolated FastAPI router. Mount it from the host application."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .science_data import find_target, sources, targets

router = APIRouter(prefix="/api/science", tags=["science"])


@router.get("/sources")
def get_sources() -> list[dict]:
    return sources()


@router.get("/targets")
def get_targets(
    kind: str | None = None,
    zone: str | None = None,
    verified_route_eligible: bool | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> dict:
    records = targets()
    if kind is not None:
        records = [item for item in records if item.get("kind") == kind]
    if zone is not None:
        records = [item for item in records if zone in item.get("jz_zone_ids", [])]
    if verified_route_eligible is not None:
        records = [item for item in records if item.get("route_waypoint_eligible") is verified_route_eligible]
    return {"items": records[offset : offset + limit], "total": len(records), "offset": offset, "limit": limit}


@router.get("/targets/{target_id}")
def get_target(target_id: str) -> dict:
    record = find_target(target_id)
    if record is None:
        raise HTTPException(status_code=404, detail="science target not found")
    return record

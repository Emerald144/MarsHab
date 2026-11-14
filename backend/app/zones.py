"""Real Jezero zone statistics (Phase 1 outputs) and the mission base location.

This module reads the already-validated static exports under data/web/ and
data/raw/ rather than recomputing anything. It never invents values: any
field absent from the source JSON stays absent in the returned dict.
"""
import csv
from typing import Any

from .config import DATA_ROOT, ROVER_PATH
from .data import read_json

ZONE_STATS_PATH = DATA_ROOT / "web" / "statistics" / "zone_terrain_statistics.json"

# The mission "base" is the Perseverance rover's Sol 0 telemetry position
# (landing_x/y/z == 0 in the source CSV), i.e. the actual Octavia E. Butler
# Landing site, read directly from data/raw/jezero/Martian_Map_Rover_Files.
# It is a verified, published NASA coordinate already present in the
# dataset -- not a hypothetical placeholder.
_BASE_CACHE: dict[str, Any] | None = None


def base_location() -> dict[str, Any]:
    global _BASE_CACHE
    if _BASE_CACHE is not None:
        return _BASE_CACHE
    with ROVER_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("frame") == "ROVER" and row.get("sol") == "0":
                _BASE_CACHE = {
                    "easting": float(row["easting"]),
                    "northing": float(row["northing"]),
                    "longitude_deg": float(row["longitude"]),
                    "latitude_deg": float(row["planetocentric_latitude"]),
                    "label": "Perseverance rover landing site (Sol 0)",
                    "source": "data/raw/jezero/Martian_Map_Rover_Files/Martian_Map_Rover_Files/best_interp.csv, sol=0",
                    "note": "Verified NASA telemetry position, used as the mission base in this prototype; not a dedicated TerraNexis habitat location.",
                }
                return _BASE_CACHE
    raise RuntimeError("Sol 0 rover telemetry row not found; cannot establish a mission base location")


def jezero_zone_stats() -> dict[str, Any]:
    """All JZ-01..JZ-08 real statistics, keyed by zone_id, plus provenance."""
    payload = read_json(ZONE_STATS_PATH)
    by_id = {z["zone_id"]: z for z in payload["zones"]}
    return {
        "disclaimer": payload.get("disclaimer"),
        "crs_projected": payload.get("crs_projected"),
        "units": payload.get("units"),
        "zones": by_id,
    }


def zone_centroid_projected(zone_id: str) -> tuple[float, float]:
    """(easting, northing) in the Jezero projected CRS, from Phase 1 zone statistics."""
    zones = jezero_zone_stats()["zones"]
    if zone_id not in zones:
        raise ValueError(f"unknown zone_id: {zone_id}")
    easting, northing = zones[zone_id]["centroid_projected_m"]
    return float(easting), float(northing)

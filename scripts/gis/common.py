"""Shared paths, constants and helpers for TerraNexis Phase 1 data preparation.

Run every script with the Python bundled with QGIS (it ships GDAL, numpy,
shapely, pyproj, geopandas, Pillow). See scripts/gis/run_all.bat.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Never write .aux.xml sidecars next to the read-only source rasters.
os.environ.setdefault("GDAL_PAM_ENABLED", "NO")

SCRIPTS = Path(__file__).resolve().parent   # <repo>/scripts/gis
ROOT = SCRIPTS.parents[1]                   # repository root
_env_root = os.environ.get("TERRANEXIS_DATA_ROOT", "").strip()
OUT = (ROOT / _env_root).resolve() if _env_root else ROOT / "data"   # data root

RAW = OUT / "raw" / "jezero"
PROCESSED = OUT / "processed" / "jezero"

# ---- Original / pre-existing inputs (read-only, never modified) ----------
SRC_DEM = RAW / "Jezero_CTX_DEM" / "M20_JezeroCrater_CTXDEM_20m.tif"
SRC_SLOPE = RAW / "Jezero_CTX_DEM" / "Jezero_Slope.tif"
SRC_COST = RAW / "Jezero_CTX_DEM" / "Jezero_Terrain_Cost.tif"
SRC_QGZ = RAW / "Jezero_CTX_DEM" / "Jezero_CTX_DEM.qgz"
SRC_ZONES = PROCESSED / "zones_v0" / "jezero_final_zones.geojson"
SRC_ZONE_META = PROCESSED / "zones_v0" / "jezero_dataset_metadata.json"
SRC_ZONE_STATS = PROCESSED / "zones_v0" / "jezero_terrain_statistics.json"

# ---- Output folders --------------------------------------------------------
META = OUT / "metadata"
VECT = OUT / "web" / "zones"
STATS = OUT / "web" / "statistics"
RAST = PROCESSED                            # derived rasters (hillshade.tif)
WEB = OUT / "web" / "layers"

# Outputs generated before the 2026-11-14 restructure record repo-relative paths
# from the old layout. They are kept verbatim (provenance is not rewritten);
# resolve_recorded() maps them to the current location.
LEGACY_PREFIXES = {
    "Jezero_CTX_DEM/": "data/raw/jezero/Jezero_CTX_DEM/",
    "Jezero_HiRISE_DEM/": "data/processed/jezero/zones_v0/",
    "Jezero_Weather_/": "data/raw/jezero/Jezero_Weather_/",
    "Martian_Map_Rover_Files/": "data/raw/jezero/Martian_Map_Rover_Files/",
    "Perseverance_Places/": "data/raw/jezero/Perseverance_Places/",
    "NASADataSearch/": "data/raw/jezero/NASADataSearch/",
    "terranexis-phase1-data/rasters/": "data/processed/jezero/",
    "terranexis-phase1-data/": "data/",
}


def resolve_recorded(path_str: str) -> Path:
    """Resolve a repo-relative path recorded in metadata (old or new layout)."""
    for old, new in LEGACY_PREFIXES.items():
        if path_str.startswith(old):
            return ROOT / (new + path_str[len(old):])
    return ROOT / path_str
for d in (META, VECT, STATS, RAST, WEB):
    d.mkdir(parents=True, exist_ok=True)

# ---- Mars reference --------------------------------------------------------
MARS_RADIUS_M = 3396190.0  # Mars 2000 / IAU 2000 sphere used by the DEM CRS
# Geographic CRS on the SAME sphere as the DEM (planetocentric == planetographic
# on a sphere), longitudes positive east, -180..180.
MARS_GEOG_PROJ4 = f"+proj=longlat +R={MARS_RADIUS_M:.0f} +no_defs +type=crs"

# ---- Configurable slope classes (analysis categories, NOT safety limits) --
CONFIG_PATH = SCRIPTS / "config.json"
DEFAULT_CONFIG = {
    "slope_classes_degrees": [
        {"name": "gentle", "min_exclusive": None, "max_inclusive": 5.0},
        {"name": "moderate", "min_exclusive": 5.0, "max_inclusive": 15.0},
        {"name": "steep", "min_exclusive": 15.0, "max_inclusive": None},
    ],
    "extra_slope_thresholds_degrees": [10.0, 20.0, 30.0],
    "min_coverage_percent_for_heuristic_index": 90.0,
    "preview_downsample_factor": 4,
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, indent=2), encoding="utf-8")
    return DEFAULT_CONFIG


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256(path: Path, chunk: int = 1 << 22) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def rel(path: Path) -> str:
    """Path relative to the repository root, with forward slashes."""
    return os.path.relpath(path, ROOT).replace("\\", "/")


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
                    encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

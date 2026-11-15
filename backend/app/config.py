import os
from pathlib import Path
from urllib.parse import urlsplit


def cors_origins() -> list[str]:
    configured = os.environ.get("TERRANEXIS_CORS_ORIGINS")
    if configured is None:
        return [f"http://{host}:{port}" for port in (5173, 8080) for host in ("localhost", "127.0.0.1")]
    origins = list(dict.fromkeys(value.strip() for value in configured.split(",") if value.strip()))
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme not in ("http", "https") or not parsed.hostname or "*" in origin
                or parsed.username is not None or parsed.password is not None
                or parsed.path or parsed.query or parsed.fragment):
            raise ValueError("TERRANEXIS_CORS_ORIGINS must contain explicit HTTP(S) origins without paths or wildcards")
        _ = parsed.port  # Reject malformed ports as well.
    return origins


CORS_ORIGINS = cors_origins()

# Resolved from this file, so paths work regardless of the current working directory.
BACKEND_DIR = Path(__file__).resolve().parents[1]   # <repo>/backend
PROJECT_DIR = BACKEND_DIR.parent                    # <repo>

# Data root: override with the TERRANEXIS_DATA_ROOT environment variable
# (absolute path, or relative to the repository root). Defaults to <repo>/data.
_env_root = os.environ.get("TERRANEXIS_DATA_ROOT", "").strip()
DATA_ROOT = (PROJECT_DIR / _env_root).resolve() if _env_root else PROJECT_DIR / "data"

RAW_DIR = DATA_ROOT / "raw" / "jezero"
PROCESSED_DIR = DATA_ROOT / "processed" / "jezero"

RASTER_DIR = RAW_DIR / "Jezero_CTX_DEM"
ZONES_DIR = PROCESSED_DIR / "zones_v0"
ZONES_PATH = ZONES_DIR / "jezero_final_zones.geojson"
STATS_PATH = ZONES_DIR / "jezero_terrain_statistics.json"
METADATA_PATH = ZONES_DIR / "jezero_dataset_metadata.json"
ROVER_PATH = RAW_DIR / "Martian_Map_Rover_Files" / "Martian_Map_Rover_Files" / "best_interp.csv"
WEATHER_DIR = RAW_DIR / "Jezero_Weather_" / "MEDA Weather Data"

REQUIRED_PATHS = {
    "dem": RASTER_DIR / "M20_JezeroCrater_CTXDEM_20m.tif",
    "slope": RASTER_DIR / "Jezero_Slope.tif",
    "terrain_cost": RASTER_DIR / "Jezero_Terrain_Cost.tif",
    "zones": ZONES_PATH,
    "zone_statistics": STATS_PATH,
    "zone_metadata": METADATA_PATH,
    "rover_track": ROVER_PATH,
    "weather_dir": WEATHER_DIR,
}


def missing_data_paths() -> list[str]:
    """Names and paths of required datasets that are not present under DATA_ROOT."""
    return [f"{name}: {path}" for name, path in REQUIRED_PATHS.items() if not path.exists()]

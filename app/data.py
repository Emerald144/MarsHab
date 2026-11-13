import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import rasterio

from .config import METADATA_PATH, RASTER_DIR, ROVER_PATH, STATS_PATH, WEATHER_DIR, ZONES_PATH

DEM_PATH = RASTER_DIR / "M20_JezeroCrater_CTXDEM_20m.tif"
SLOPE_PATH = RASTER_DIR / "Jezero_Slope.tif"
COST_PATH = RASTER_DIR / "Jezero_Terrain_Cost.tif"

def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)

def raster_metadata() -> dict[str, Any]:
    with rasterio.open(DEM_PATH) as ds:
        return {
            "bounds_m": {"west": ds.bounds.left, "south": ds.bounds.bottom, "east": ds.bounds.right, "north": ds.bounds.top},
            "shape": {"width": ds.width, "height": ds.height},
            "resolution_m": list(ds.res),
            "nodata": ds.nodata,
            "crs_wkt": str(ds.crs),
            "source": "USGS Mars 2020 Science Investigation CTX DEM Mosaic",
            "source_file": DEM_PATH.name,
        }

def point_sample(easting: float, northing: float) -> dict[str, Any]:
    result: dict[str, Any] = {"easting": easting, "northing": northing}
    for label, path in (("elevation_m", DEM_PATH), ("slope_degrees", SLOPE_PATH), ("terrain_cost", COST_PATH)):
        with rasterio.open(path) as ds:
            value = next(ds.sample([(easting, northing)]))[0]
            invalid = not np.isfinite(value) or (ds.nodata is not None and np.isclose(value, ds.nodata))
            result[label] = None if invalid else round(float(value), 4)
    result["data_covered"] = all(result[k] is not None for k in ("elevation_m", "slope_degrees", "terrain_cost"))
    return result

def rover_track(limit: int = 500) -> dict[str, Any]:
    points = []
    with ROVER_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("frame") != "ROVER" or int(float(row.get("sol", "-1"))) < 0:
                continue
            points.append({"sol": int(float(row["sol"])), "easting": float(row["easting"]), "northing": float(row["northing"]), "elevation_m": float(row["elevation"])})
    stride = max(1, math.ceil(len(points) / limit))
    sampled = points[::stride]
    return {"points": sampled, "total_records": len(points), "returned_records": len(sampled), "coordinate_note": "Mars projected metres; not Earth longitude/latitude."}

def weather_summary() -> dict[str, Any]:
    groups: dict[str, list[float]] = defaultdict(list)
    for path in WEATHER_DIR.rglob("*.csv"):
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                for key, raw in row.items():
                    try:
                        value = float(raw) if raw not in (None, "", "N/A") else None
                    except ValueError:
                        value = None
                    if value is not None and math.isfinite(value) and abs(value) < 1e7:
                        groups[key].append(value)
    stats = {key: {"count": len(values), "mean": round(float(np.mean(values)), 3), "min": round(float(np.min(values)), 3), "max": round(float(np.max(values)), 3)} for key, values in groups.items() if values}
    return {"label": "Historical MEDA context (Sols 36–39); not a forecast.", "fields": stats}

def dataset_summary() -> dict[str, Any]:
    return {"raster": raster_metadata(), "zones": read_json(STATS_PATH), "project_metadata": read_json(METADATA_PATH), "limitations": ["This is a decision-support prototype, not astronaut-navigation or safety certification.", "Terrain indicators derive from a 20 m DEM and cannot identify foot-scale hazards.", "Closures submitted to the routing endpoint are simulated."]}

def zones() -> dict[str, Any]:
    return read_json(ZONES_PATH)

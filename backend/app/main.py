from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import logging

from . import data, missions, zones
from .config import CORS_ORIGINS, DATA_ROOT, missing_data_paths
from .environment_api import router as environment_router
from .science_api import router as science_router
from .models import EmergencyReturnRequest, MissionPlanRequest, RouteRequest
from .routing import route

_missing = missing_data_paths()
if _missing:
    logging.getLogger("uvicorn.error").warning(
        "TerraNexis data root %s is missing required datasets: %s", DATA_ROOT, "; ".join(_missing)
    )

app = FastAPI(title="Jezero Terrain Planning API", version="1.0.0", description="NASA/USGS data-backed educational prototype; not an astronaut safety system.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Historical NASA MEDA environment data (read-only), /api/v1/environment/*
app.include_router(environment_router)
# Provenance-aware science catalog; route-eligible targets remain empty until
# a Mars-only coordinate transformation and DEM coverage check are verified.
app.include_router(science_router)

@app.get("/api/v1/health")
def health(): return {"status": "ok", "service": "jezero-terrain-planning"}

@app.get("/api/v1/datasets")
def datasets(): return data.dataset_summary()

@app.get("/api/v1/zones")
def get_zones(): return data.zones()

@app.get("/api/v1/terrain/point")
def terrain_point(easting: float, northing: float):
    result = data.point_sample(easting, northing)
    if not result["data_covered"]: raise HTTPException(404, "No complete terrain coverage at this Mars projected coordinate")
    return result

@app.get("/api/v1/rover/track")
def get_rover_track(limit: int = Query(500, ge=1, le=5000)): return data.rover_track(limit)

@app.get("/api/v1/weather/summary")
def get_weather_summary(): return data.weather_summary()

@app.post("/api/v1/routes")
def create_route(request: RouteRequest):
    try: return route(request)
    except ValueError as error: raise HTTPException(422, str(error)) from error

@app.get("/api/v1/jezero/zones")
def get_jezero_zones(): return zones.jezero_zone_stats()

@app.get("/api/v1/jezero/base")
def get_jezero_base(): return zones.base_location()

@app.post("/api/v1/missions/plan")
def plan_mission(request: MissionPlanRequest):
    try: return missions.plan_mission(request)
    except ValueError as error: raise HTTPException(422, str(error)) from error

@app.post("/api/v1/missions/emergency-return")
def mission_emergency_return(request: EmergencyReturnRequest):
    return missions.emergency_return(request)

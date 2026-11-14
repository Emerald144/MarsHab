from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import data
from .models import RouteRequest
from .routing import route

app = FastAPI(title="Jezero Terrain Planning API", version="1.0.0", description="NASA/USGS data-backed educational prototype; not an astronaut safety system.")
app.add_middleware(
    CORSMiddleware,
    # Vite commonly uses 5173, while this TanStack Start project runs on 8080.
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

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

# Jezero Terrain Planning Backend

FastAPI service for the Interplanetary Survival Guide prototype. It reads the supplied NASA/USGS raster and PDS-derived files from the repository `data/` folder (override with `TERRANEXIS_DATA_ROOT`, see `.env.example`); it never modifies them.

## Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive contract.

## Important coordinate rule

Every routing and terrain endpoint takes `easting` / `northing` in the supplied **Jezero Mars projected CRS, metres**. These are not Earth latitude/longitude values and must not be plotted as EPSG:4326.

`POST /api/v1/routes` implements A* over the supplied terrain-cost and slope rasters. It supports `shortest` and `terrain_aware` modes, transit-time assumptions, and explicitly **simulated** circular closures. The response is GeoJSON and labels the result as a non-certified prototype estimate.

The front end currently contains presentation-only simulated map data. Its integration layer can call this API at `/api/v1` when it is ready to replace those placeholders.

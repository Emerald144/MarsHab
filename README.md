# MatianMap

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://frame-forger-plus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2e8d7083-3222-4107-875a-2e0a0976e999).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
# Jezero Terrain Planning Backend

FastAPI service for the Interplanetary Survival Guide prototype. It reads the supplied NASA/USGS raster and PDS-derived files in `../nasa-data`; it never modifies them.

## Run

```powershell
cd nasa-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive contract.

## Important coordinate rule

Every routing and terrain endpoint takes `easting` / `northing` in the supplied **Jezero Mars projected CRS, metres**. These are not Earth latitude/longitude values and must not be plotted as EPSG:4326.

`POST /api/v1/routes` implements A* over the supplied terrain-cost and slope rasters. It supports `shortest` and `terrain_aware` modes, transit-time assumptions, and explicitly **simulated** circular closures. The response is GeoJSON and labels the result as a non-certified prototype estimate.

The front end currently contains presentation-only simulated map data; no front-end files were changed. Its integration layer can call this API at `/api/v1` when it is ready to replace those placeholders.

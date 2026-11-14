# Architecture

Verified against the repository on 2026-11-14 (after the Option 1 restructure).

## Repository layout

```
Martain/
├── src/, public/, package.json, vite.config.ts, tsconfig.json,
│   vitest.config.ts, bun.lock, bunfig.toml, .lovable/, AGENTS.md   ← frontend (repo root, required by Lovable)
├── backend/                  ← FastAPI service (app/, tests/, requirements.txt, README.md)
├── data/
│   ├── raw/jezero/           ← original NASA/USGS files (+ the project's QGIS slope/cost rasters, see DATA_INVENTORY)
│   ├── processed/jezero/     ← derived data (zones_v0/, hillshade.tif)
│   ├── web/                  ← Phase 1 integration-ready exports (layers/, zones/, statistics/)
│   └── metadata/             ← provenance, spatial reference, QA report, inventory
├── scripts/gis/              ← Phase 1 GIS pipeline (QGIS-bundled Python)
├── docs/                     ← architecture/, datasets/, integration/, team/
├── .env.example
└── README.md
```

The frontend stays at the repository root on purpose. Lovable syncs from the root `package.json`/`src/`; moving it into `frontend/` would break the Lovable project.

## Frontend

- React 19.2, TypeScript 5.8, TanStack Start 1.168.60 + TanStack Router 1.170.41, Vite 8.1.5, Nitro 3 (beta, build-only, via `@lovable.dev/vite-tanstack-config`), Three.js 0.187, Tailwind 4.2, Radix/shadcn UI, GSAP, Vitest 4 (jsdom).
- File routes: `src/routes/__root.tsx`, `index.tsx`, `mission.tsx`. `src/routeTree.gen.ts` is generated; never edit it by hand.
- SSR entry: `src/server.ts` (error wrapper, set in `vite.config.ts`).
- Alias `@/*` → `src/*` (`tsconfig.json`, `vitest.config.ts`).
- App state: `src/lib/mission-store.tsx`. Demo data and scoring: `src/lib/mission-data.ts`.
- Map: `src/components/mars/MarsMap.tsx` (SVG, viewBox 1000×680), layer toggles in `src/features/survival-map/SurvivalMapView.tsx`.
- The primary real Jezero workflow calls the FastAPI mission endpoints through `src/lib/mission-api.ts`; the legacy A-xx demo map remains local illustrative data. The resource model is an abstract configurable budget, not oxygen or battery telemetry.

## Backend

- FastAPI in `backend/app/`: `main.py` (routes, CORS for localhost 5173/8080), `data.py` (raster/CSV readers), `routing.py` (A\* routing), `models.py`, `config.py`.
- Endpoints (all under `/api/v1`): `health`, `datasets`, `zones`, `terrain/point`, `rover/track`, `weather/summary`, `POST routes`.
- Reads data from `<repo>/data` (see "Configuration"). Raster access uses rasterio point/windowed reads, so the 86 MB DEM is not loaded whole.
- Coordinates in the API are Mars projected metres, not Earth lat/lon.
- The real mission planner calls `/api/v1/jezero/*` and `/api/v1/missions/*`; legacy `/api/v1/zones` remains available for compatibility.

## Configuration

| Setting | Where | Default |
|---|---|---|
| `TERRANEXIS_DATA_ROOT` | env var, read by `backend/app/config.py` and `scripts/gis/common.py` | `<repo>/data` |

Absolute path, or relative to the repo root. See `.env.example`. If required datasets are missing the backend logs a warning at startup listing them. No secrets are used anywhere.

## Run / test commands

| What | Command (from repo root unless noted) |
|---|---|
| Install frontend deps | `npx bun@1.3.5 install --frozen-lockfile` (lockfile is `bun.lock`) |
| Frontend dev server | `npm run dev` |
| Frontend tests | `npm run test` |
| Frontend build | `npm run build` |
| Backend setup | `cd backend`, create a venv, `pip install -r requirements.txt` |
| Backend server | `cd backend` then `uvicorn app.main:app --reload --port 8000` |
| Backend tests | `cd backend` then `pytest` (pytest is not in `requirements.txt`; install it in your venv) |
| GIS pipeline | `scripts\gis\run_all.bat` (needs QGIS; override `QGIS_BIN` if not at `C:\Program Files\QGIS 4.2.3\bin`) |

## Conventions

- Never edit files under `data/raw/`. Derived data goes to `data/processed/` or `data/web/` and must be recorded in `data/metadata/data_sources.json`.
- Mars coordinates stay Mars coordinates. Never feed Mars lon/lat or projected metres to an Earth/EPSG:4326 map.
- Label every number as real, derived, heuristic, or simulated. Do not present demo values as measurements.
- Do not commit `.venv`, `node_modules`, `__pycache__`, `.env`, build output.

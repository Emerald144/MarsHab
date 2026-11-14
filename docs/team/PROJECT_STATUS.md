# Project status — resumed TerraNexis implementation

Updated 2026-11-14. Work is on the local feature/jezero-terrain-integration branch. Nothing has been pushed or merged.

## Git

| Branch | Head | State |
|---|---|---|
| main | 4aefb50 | Stage 1 restructure and data-root fix |
| feature/jezero-terrain-integration | 997c6c7 | Stage 1, Stage 2, and terrain-aware mission integration |

Existing completed work was preserved. The current implementation remains in the working tree for review.

## Completed

- Real JZ-01 through JZ-08 terrain mode using the 1114 x 1267 preview layers, zone statistics, provenance, and verified Perseverance Sol 0 base location.
- Primary workflow: JZ zone selection → mission setup → terrain analysis → Route A/Route B generation → feasibility → simulated execution → closure rerouting → emergency return → report.
- Route A uses deterministic 8-connected A* distance cost. Route B uses the same grid with DEM-derived terrain cost penalties. Route C is explicitly unavailable because no verified science-target waypoint exists.
- Route responses include georeferenced GeoJSON, distance, elevation gain/loss, slope exposure, cumulative terrain cost, estimated time, assumptions, raster resolution, and endpoint-snapping disclosure.
- Backend validates finite coordinates and bounded simulated closures, checks raster CRS/geotransform compatibility, handles NoData/blocked cells, and applies closures to emergency-return planning.
- Frontend preserves the real JZ destination and mission state across planning, routes, execution, reroute, emergency, and report views. The legacy A-xx demo map remains isolated and labelled illustrative.
- Overview rounding is fixed locally: the display boundary 30.45 renders as 30.5 h without changing calculations.

## Verified

| Check | Result |
|---|---|
| node node_modules/typescript/bin/tsc --noEmit | 0 errors |
| npm run test -- --run | 9 files, 40 tests passed; jsdom emits non-fatal Three.js canvas warnings |
| npm run build | Vite and Nitro production build succeeded |
| backend/tests | 17 tests passed, including valid/blocked/NoData/CRS/determinism, feasibility, API, and emergency return |
| missing_data_paths() | [] |

## Not verified in this environment

- Manual browser/visual verification across mobile/desktop, dark/light, English/Myanmar, reduced motion, map layer alignment, closure rerouting, and emergency-return animation.
- scripts/gis/validate_outputs.py; GDAL/osgeo is not available in the current Python environment.
- Clean-room dependency installation and lint cleanup. Existing CRLF/prettier noise remains outside this implementation.

## Local run

Terminal 1:

    cd D:\Martain
    .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000

Terminal 2:

    cd D:\Martain
    npm run dev

Open the Vite URL shown in the terminal, normally http://localhost:5173. The frontend defaults to http://127.0.0.1:8000 for mission API calls. Set VITE_API_BASE_URL if the backend is hosted elsewhere.

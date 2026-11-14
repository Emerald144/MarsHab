# Integration guide: Real Jezero terrain mission workflow

The primary workflow is wired to the Phase 1 Jezero data and the FastAPI terrain planner. The legacy A-xx illustrative mission remains available only through the explicitly labelled Demo Mission Map.

## Frontend data and state

| Need | Current source |
|---|---|
| Real zones | src/lib/jezero-real-data.ts loads JZ-01 through JZ-08 from public/jezero |
| Real map | src/components/mars/RealTerrainMap.tsx, portrait 1114 x 1267 SVG viewBox with meet |
| Real layers | terrain, elevation, slope, hillshade from layer_manifest.json |
| Mission state | src/lib/mission-store.tsx carries zone, setup, plan, reroute, and emergency result |
| Mission API client | src/lib/mission-api.ts |
| Legacy demo | MarsMap.tsx and mission-data.ts remain isolated behind the Demo Mission Map selector |

Real terrain factors are intentionally limited to measured elevation/slope-derived values and a clearly labelled terrain-only heuristic. Resource, access, environment, and science factors render Not available because no verified data exists for them. No A-xx identifier enters the real mission workflow.

## Backend workflow

Start the service with:

    .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000

The real workflow uses:

- GET /api/v1/jezero/zones for JZ statistics.
- GET /api/v1/jezero/base for the verified Perseverance Sol 0 base.
- POST /api/v1/missions/plan for Route A, Route B, Route C availability, and feasibility.
- POST /api/v1/missions/emergency-return for the same-grid return route.

Route A and Route B use the validated terrain cost and slope rasters with an 8-connected A* grid. Returned GeoJSON is in the Mars projected CRS and includes distance, elevation gain/loss, slope exposure, terrain cost, time, assumptions, grid resolution, and closure/snap metadata. Route C is unavailable until a verified science-target waypoint dataset exists.

The legacy /api/v1/zones endpoint remains backed by zones_v0 for compatibility.

## Verification

The completed implementation was verified with:

- node node_modules/typescript/bin/tsc --noEmit
- npm run test -- --run: 40 frontend tests passed
- npm run build: Vite and Nitro succeeded
- backend/tests: 17 tests passed

Manual browser verification and GDAL-based scripts/gis/validate_outputs.py remain follow-up checks because those tools were not available in the implementation environment.

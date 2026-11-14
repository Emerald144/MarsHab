# Project status

Updated 2026-11-14 after Stage 1 (restructure) and Stage 2 (Real Jezero Terrain integration). All work is committed to `feature/jezero-terrain-integration`; `main` has Stage 1 only. **Nothing has been pushed.**

## Git

| Branch | Head | Contains |
|---|---|---|
| `main` | `4aefb50` | Stage 1 restructure + data-root fix |
| `feature/jezero-terrain-integration` | `04297de` | Stage 1 (fast-forwarded from `main`) + Stage 2 |

Stage 2 commits (on the feature branch only):
- `0afed84` — Real Jezero Terrain mode in the Survival Map.
- `04297de` — untrack committed `*.pyc`, add `backend/requirements-dev.txt`.

## Completed

- Phase 1 data preparation: zones JZ-01…JZ-08, per-zone elevation/slope statistics, hillshade, preview layers, manifest, provenance, 12/12 QA checks (last run before Stage 2; nothing under `data/` or `scripts/gis/` changed since, confirmed via `git log d2be110..HEAD -- data/ scripts/gis/`).
- Stage 1 restructure, data-root fix, and the follow-up `.pyc`/dev-requirements hygiene (see Git table).
- **Stage 2**: a Real Terrain / Demo Mission selector in the Survival Map (`src/features/survival-map/SurvivalMapView.tsx`). Real mode renders JZ-01…JZ-08 over the 1114×1267 terrain/elevation/slope/hillshade preview layers (`src/components/mars/RealTerrainMap.tsx`, data loader `src/lib/jezero-real-data.ts`, assets served from `public/jezero/` — copies of `data/web/` + `data/metadata/data_sources.json`, originals untouched) with a metrics panel bound to real elevation/slope/area/coverage values and a terrain-only heuristic index. Demo mode is unchanged and labelled "Illustrative demo — not georeferenced". No A-xx/JZ-xx id crossover: the real view keeps independent local selection state and never calls `setDestination`.

## Verified (these actually ran, on `feature/jezero-terrain-integration`)

| Check | Result |
|---|---|
| `node_modules/.bin/tsc --noEmit` | 0 errors |
| `npm run test` | 9 files, 39 tests passed |
| `npm run build` (vite + nitro) | succeeded; confirmed `public/jezero/*` present under `.output/public/jezero/`, i.e. static assets resolve in the production build, not just dev |
| Backend import; `missing_data_paths()` returns `[]`; 7 routes registered | passed |
| `backend/tests/test_api.py` (4 functions) | passed, called directly — `pytest` could not be installed (`backend/requirements-dev.txt` added, but `pip install` timed out: no PyPI access in this environment) |
| `scripts/gis/validate_outputs.py` | **not re-run this pass** — `osgeo`/GDAL is not importable in `.venv` here; not needed anyway since nothing under `data/` or `scripts/gis/` changed |

## Not verified

- Real browser/visual check (globe, both map modes side by side, EN/MY switch, dark/light, mobile width, reduced motion). No headless browser was available in this environment; verification above is type-check + unit tests + build output inspection only.
- A clean-room reinstall; ESLint (pre-existing ≈10.9k CRLF-only findings, not evaluated again).

## Known issues (pre-existing, not Stage 2 regressions)

- ESLint CRLF/prettier noise (≈10.9k errors), `bun install`'s two nested package failures, ``.venv`` lacking `pytest`/GDAL network access, metadata files recording the pre-restructure path layout (intentional, see `DATA_INVENTORY.md`) — all carried over from the Stage 1 report, unchanged by Stage 2.
- `.aux.xml` sidecar policy: kept tracked as-is (no change). `scripts/gis/*` already set `GDAL_PAM_ENABLED=NO`, so the GIS pipeline does not create or modify them; see `DATA_INVENTORY.md`.
- Optional CTX 5 m orthomosaic: still not downloaded (needs license verification + large-file-storage decision); the hillshade/terrain preview remains the real-mode basemap meanwhile.
- Backend still serves `/api/v1/zones` from the older `zones_v0` statistics (no elevation). No new backend endpoint was added for `data/web/statistics/` — the frontend reads the static files directly via `public/jezero/`, which is simpler and avoids a duplicate API surface; revisit only if something other than this web app needs that data over HTTP.

## Modified/added files (Stage 2, relative to `4aefb50`)

- New: `src/lib/jezero-real-data.ts`, `src/components/mars/RealTerrainMap.tsx`, `backend/requirements-dev.txt`, `public/jezero/**` (copies, not originals).
- Edited: `src/features/survival-map/SurvivalMapView.tsx`, `src/components/mars/DataBadge.tsx`, `src/i18n/translations.ts`.
- Removed from tracking (not deleted on disk, already gitignored): `backend/**/__pycache__/*.pyc`.
- Untouched: `data/`, `scripts/gis/`, `src/lib/mission-data.ts`, `src/lib/mission-store.tsx`, `tsconfig.json`, demo map (`MarsMap.tsx`), routing/feasibility/report/simulation views (`Views.tsx`).

## Remaining

See `NEXT_TASKS.md`.

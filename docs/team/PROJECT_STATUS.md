# Project status

Updated 2026-11-14 after Stage 1 (Option 1, minimal restructure). **Nothing has been committed, pushed, or branched.** The work is in the working tree on `main`.

## Completed

- Phase 1 data preparation: zones JZ-01…JZ-08, per-zone elevation/slope statistics, hillshade, preview layers, manifest, provenance, 12/12 QA checks (re-run after the move: 12/12 pass).
- Stage 1 restructure: backend → `backend/`; data → `data/raw|processed|web|metadata`; GIS scripts → `scripts/gis/`; docs → `docs/`. 73 tracked files moved with `git mv` (history preserved); untracked Phase 1 files moved into place; the temporary `terranexis-phase1-data/` folder was emptied and removed.
- Backend data path fixed: `D:\nasa-data` (did not exist) replaced by a data root that defaults to `<repo>/data` and can be overridden with `TERRANEXIS_DATA_ROOT`.
- Frontend dependencies restored from `bun.lock`.

## Verified (these actually ran)

| Check | Result |
|---|---|
| Hashes of all 96 data/backend files before vs after the move | 88 identical; the 8 differing are files I deliberately edited (5 GIS scripts, `layer_manifest.json` paths, `backend/app/config.py`, `backend/app/main.py`). No scientific data changed. |
| `npm run test` | 9 files, 39 tests passed |
| `npm run build` (`vite build`) | succeeded |
| Backend import; 7 routes registered; data root resolves with 0 missing datasets, also from another working directory | passed |
| Backend HTTP smoke test on a temporary port (8765), then stopped | 200 on health, datasets, zones, terrain/point, rover/track, weather/summary, POST routes |
| Backend test functions in `backend/tests/test_api.py` (4) | passed, run by calling the functions directly (pytest is not installed in `.venv`) |
| GIS QA `scripts/gis/validate_outputs.py` against the moved data | 12/12 PASS |

## Not verified

- Visual/behavioural checks of the running app: globe, dashboard, Survival Map, modes, routes, simulation, report, EN/MY, themes, responsive. No UI regression was expected (no `src/` file changed) but it was **not exercised in a browser**.
- `pytest` itself, ESLint (see below), the Lovable sync after the move, a clean-room reinstall.
- A full re-run of the GIS pipeline end to end from the new locations (only the QA step was re-run; `common.py` paths changed).

## Known issues

- `bun install` reported 2 packages failed (nested `brace-expansion`/`balanced-match` under `@typescript-eslint/typescript-estree/node_modules/minimatch`, Windows path error). Tests and build are unaffected.
- ESLint reports ≈10.9k errors, nearly all prettier "Delete ␍" (CRLF line endings). Not caused by this work.
- `README.md` project description ("Implement exactly the screenshot…") is Lovable boilerplate.
- Six `__pycache__/*.pyc` files are tracked in git (pre-existing) and show as modified/renamed.
- Opening rasters with a GDAL tool that has PAM enabled (QGIS, `gdalinfo -stats`) can rewrite the two tracked `*.aux.xml` sidecars. They are currently identical to HEAD.
- The `.venv` has no `pytest`; `requirements.txt` has no dev dependencies.
- Metadata and the Phase 1 report contain old-layout paths (intentional; see DATA_INVENTORY).

## Modified files (relative to HEAD, uncommitted)

- Moved (renames): `app/*` → `backend/app/*`, `tests/*` → `backend/tests/*`, `requirements.txt` → `backend/requirements.txt`, `Jezero_CTX_DEM`, `Jezero_Weather_`, `Martian_Map_Rover_Files`, `Perseverance_Places`, `NASADataSearch` → `data/raw/jezero/…`, `Jezero_HiRISE_DEM` → `data/processed/jezero/zones_v0`.
- Edited: `backend/app/config.py`, `backend/app/main.py`, `.gitignore`, `README.md`.
- New: `.env.example`, `backend/README.md`, `data/metadata/`, `data/web/`, `data/processed/jezero/hillshade.tif`, `scripts/gis/`, `docs/`.
- Untouched: everything under `src/`, `public/`, `package.json`, `bun.lock`, `vite.config.ts`, `tsconfig.json`, `.lovable/`.

## Shared files (coordinate before editing)

`package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `README.md`, `src/lib/mission-data.ts`, `src/lib/mission-store.tsx`.

## Remaining

Phase 1 frontend integration (see NEXT_TASKS.md). Not started: zones in the app, terrain layers in the app, statistics panel, partial scoring, demo/real labelling.

# Next tasks

Phase 1 integration (Stage 2) is done — see `PROJECT_STATUS.md`. Phase 2 (terrain-aware route optimization for JZ zones, oxygen/life-support models, live monitoring, digital-twin modeling) remains **out of scope**.

## 1. Real browser verification

No headless browser was available while building Stage 2; verification so far is `tsc --noEmit`, `npm run test` (39/39), `npm run build`, and inspecting `.output/public/jezero/` for the static assets. Before shipping, open the app and check: Real Terrain ↔ Demo Mission switch keeps state isolated (no stale JZ selection bleeding into demo, and vice versa); all four real layers render and their legends match `layer_manifest.json`; zone polygons stay aligned to the PNG at different viewport widths (resize/mobile); dark/light themes; English/Myanmar switch on every new string; reduced-motion; the rest of the existing demo flow (modes, feasibility, routes, simulation, emergency return, report) is unaffected.

## 2. Optional CTX 5 m orthomosaic

Download `M20_JezeroCrater_CTXortho_mosaic_5m.tif` from USGS Astrogeology after confirming license/terms and a large-file storage policy (it's a big raster — don't commit it directly without a plan). Generate a lightweight preview PNG on the same bounds as the existing four layers and add it to `layer_manifest.json` + `RealTerrainMap.tsx`'s layer list; re-run `scripts/gis/validate_outputs.py` (12 checks) afterward. Until then, the hillshade/terrain preview remains the real-mode basemap, correctly labelled as display-only, not 5 m satellite imagery.

## 3. GDAL/pytest tooling in this environment

`backend/requirements-dev.txt` adds `pytest`, but `pip install` timed out here (no PyPI access) and `osgeo`/GDAL isn't importable in `.venv`, so `scripts/gis/validate_outputs.py` could not be re-run this pass. Whoever has network/GDAL access should: install `backend/requirements-dev.txt` and confirm `pytest` collects/runs `backend/tests/test_api.py` normally (it passed when the 4 functions were called directly); re-run the GIS QA script to get a fresh 12/12.

## Housekeeping (unchanged from Stage 1, still open)

- CRLF/prettier lint noise (≈10.9k errors, line-ending only): add `.gitattributes` (`* text=auto eol=lf`) and re-normalise in one coordinated commit — don't fold this into an unrelated feature commit.
- Decide whether/when to merge `feature/jezero-terrain-integration` into `main` (still unpushed either way).
- If a non-web consumer ever needs the Phase 1 statistics over HTTP, add a read-only endpoint to the backend reading `data/web/statistics/` — skipped for now since the frontend reads the static files directly and a second API surface wasn't needed.

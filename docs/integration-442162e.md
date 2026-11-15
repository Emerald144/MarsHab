# Integration repair for teammate commit 442162e

The incoming commit added 35 files without updating the existing consumers.
Its tests and documentation described integrations that were not yet wired into
the application. No original scientific dataset was changed by this repair.

## Root causes of the original 18 failures

| Test / scenario | Root cause and repair |
| --- | --- |
| Planning: neutral optional prompt | `Setup` had no `planning` field, so `assessLoad` dereferenced `undefined`. Initialize a fresh `DEFAULT_PLANNING` per provider. |
| Planning: validation and 2 N pressure support | Same missing planning state prevented the existing validation component from mounting. Its numeric constraints remain unchanged. |
| Planning: research example | Same missing state prevented the preset and independent return-speed input from mounting. Wire the existing fields into the planner. |
| Planning: exceeded budgets and disclosures | Same missing state prevented assessment. Use the shared evaluator for actual route geometry and current setup. |
| Planning: localization | Missing planning state was the first exception; the new disclosure, validation and preset labels also lacked translations. Add Myanmar translations. |
| Map: shared camera and fit imagery | The existing map never used the new camera hook, layer card or registered imagery footprint. Connect them to one geographic SVG group. |
| Map: pointer pan, wheel zoom and selection | The map had no camera event bindings or drag-click suppression. Connect the existing hook, retaining keyboard zone selection. |
| Map: mobile drawer and explorer localization | The map had no `explorer` mode, responsive drawer or translated explorer controls. Integrate those controls outside the SVG. |
| Map: exclusive basemaps | The existing toolbar only supported the four original rasters. Add the new layer state and registered CTX basemap. |
| Map: independent overlays | Slope was a replacement basemap; constraints, suitability and historical rover rendering were absent. Compose independent, pointer-transparent overlays. |
| Map: common extent and route registration | Routes had no testable route identifier, and new layers were not rendered. Keep projected-metre conversion on the exact manifest canvas; reject misregistered rasters. |
| Map: hidden boundaries and persistent preferences | No provider-owned map preferences or separate interactive zone hit regions existed. Preserve selection and display preferences across remounts. |
| Map: missing suitability and formula | No suitability overlay or explanatory layer details were connected. Read the existing statistic, preserve unavailable values and expose the documented formula. |
| Map: unavailable/misregistered assets | No alignment or failed-image handling was connected, and the loader did not fetch optional rover records. Disable failed/misaligned assets without fabricated fallback observations. |
| Map: translated collapse controls | The new layer card was unused and its labels had no translations. Connect its accessible disclosure and translation keys. |
| Backend: default CORS origins | `app.config.CORS_ORIGINS` did not exist; middleware had a fixed local list. Export and use a validated, configurable allowlist. |
| Backend: configured CORS origins | No environment override was implemented. `TERRANEXIS_CORS_ORIGINS` now replaces the local defaults; wildcard and malformed origins are rejected. |
| Backend: registered display exports | Both manifests lacked `ctx` and `constraints` despite the PNG exports being present. Regenerate verified entries using the supplied exporter. |

## Preserved behavior and additional integration fixes

- Keep FastAPI's real A* engine, Routes A/B/C, science waypoint selection,
  resource budgeting, MEDA and science catalog APIs.
- Initialize optional crew/suit fields without inventing measured values.
- Use the shared route evaluator in overview, planner, comparison, execution and
  report; honor independently configured return speed, rest and emergency budget.
- Include Route C in evaluation and route availability. Preserve its waypoint,
  two-leg geometry and provenance; update its nested feasibility/resource result.
- Verify Route C's exact joined leg geometry before allowing the backend's
  declared retrace assumption when its two simple legs revisit a cell.
- Evaluate accepted revised geometry consistently and report the selected route.
  Assess real emergency-return geometry at the configured emergency pace.
- Keep desktop zone details beside the map and mobile details below it.
- Keep all raw rasters, original CTX TIFF, source CSVs, scientific observations,
  virtual environments and pre-existing untracked test directories intact.

The older animation/localization fixtures described 2 km routes with roughly
6.9 km coordinate geometry. Their geometry was corrected to match the intended
scenario; assertions were retained. The overview rounding fixture now supplies
geometry consistent with its 30.45 h boundary. The reroute fixture now includes
the accepted revised plan. New regressions cover Route C and actual CORS
preflight behavior rather than loosening the incoming assertions.

## Verification

- Frontend: **100 tests passed** (`npm.cmd run test`).
- Backend: **70 tests and 5 subtests passed**, including real MEDA reproduction,
  science APIs, mission planning, resources and routing.
- TypeScript: **passed**, `node node_modules/typescript/bin/tsc --noEmit`.
- Production build: **passed**, `npm.cmd run build`.
- GIS: all **12** `validate_outputs.py` checks passed under installed QGIS.
- Independent Route C GDAL check: **194 vertices, zero invalid vertices**;
  reported combined length 30,008.2 m, geometry length 30,008.191 m, joined leg
  length consistent with the combined route and a deduplicated seam.
- Existing headless Chrome explorer check: **passed** for desktop/mobile layouts,
  camera, CTX selection, drawers, zone selection and Myanmar navigation.

The browser PNG warning from rasterio is expected: PNG previews have no embedded
geotransform; the verified manifest supplies their registration. Original TIFFs
retain their georeferencing. No remaining validation blockers were identified.

## Files changed

- `.env.example`, `backend/app/config.py`, `backend/app/main.py`,
  `backend/tests/test_config.py`.
- `data/metadata/data_sources.json`, `data/web/layers/layer_manifest.json`,
  `public/jezero/layer_manifest.json` (verified metadata only).
- `src/lib/mission-store.tsx`, `src/lib/jezero-real-data.ts`,
  `src/lib/mission-evaluation.ts`.
- `src/components/mars/RealTerrainMap.tsx`, `src/components/mars/Views.tsx`,
  `src/components/mars/overview/OverviewDashboard.tsx`,
  `src/features/survival-map/SurvivalMapView.tsx`, `src/i18n/translations.ts`.
- `src/test/route-model.test.ts`, `src/test/language.test.tsx`,
  `src/test/mission-section-animations.test.tsx`,
  `src/test/overview-dashboard.test.tsx`, and this report.

The local commit is scoped to this repair. Nothing is pushed or merged into
`main`; published history and teammate branches are unchanged.

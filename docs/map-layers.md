# Real Jezero map layers

The real map remains the mission workflow's primary map. Demo A-xx zones,
MODE_WEIGHTS, fictional hazards/resources, science targets and rover markers
remain confined to the demo map. Layer controls never enter route requests or
the shared evaluator. The mission provider retains layer choices across view
changes, including comparison/execution maps; destination state is independent.

## Connected layers and audit

| Layer | Actual source | Browser integration |
| --- | --- | --- |
| Terrain | CTX DEM + derived hillshade | Existing aligned terrain_preview.png |
| Elevation | M20_JezeroCrater_CTXDEM_20m.tif | Existing elevation_preview.png; metres, manifest percentile stretch |
| Hillshade | data/processed/jezero/hillshade.tif | Existing hillshade_preview.png; relative illumination 0–255 |
| CTX imagery | Supplied data/jezero/jezero-ctx-mosaic.tif | New registered ctx_preview.png, partial coverage |
| Zone boundaries/labels | Project-defined JZ-01…JZ-08 repaired projected GeoJSON | Existing zones_preview_pixels.json, exported from exact projected extent |
| Slope classes | Jezero_Slope.tif, Horn slope | Existing slope_preview.png: ≤5°, >5–15°, >15°; majority of source classes |
| Terrain suitability | zone_terrain_statistics.json | Existing heuristic_terrain_index, shown unrounded internally and as x.x/100 |
| Terrain constraints | DEM valid mask, slope and terrain-cost rasters | New transparent RGBA constraints_preview.png |
| Rover observations | NASA PDS best_interp.csv ROVER rows | Historical locations only: static rover_track.json from the existing backend rover_track(500) function |

Resource and verified science-target datasets are not connected: their controls
and empty legends are removed from real mode. Legacy preference keys are discarded;
demo controls are unchanged. Historical rover positions are not
instrument science observations, live tracking, a refuge, or rescue capability.
The backend also exposes `/api/v1/rover/track`; its reader is reused for the small
static export so viewing the map does not require starting FastAPI. MEDA CSVs
exist as historical context, not georeferenced live weather hazards. No fake
markers are substituted if optional assets are missing or fail to load.

Backend full-resolution TIFFs are not browser assets. The raster source files,
projected zone GeoJSON, zone statistics, display PNGs, and localization CSV/API
are distinct sources. `public/jezero/layer_manifest.json` identifies each PNG's
CRS, bounds, dimensions, source and processing. The browser rejects mismatched
CRS/bounds/dimensions and disables failed assets without silently stretching them.

## Alignment and transparency

All visible rasters use the DEM's exact projected bounds, a 1114×1267 display
grid, and the existing equidistant cylindrical Jezero CRS (Mars sphere radius
3,396,190 m, standard parallel 18.4663°N). Projected points use
`px=(x-xmin)/(xmax-xmin)*width`, `py=(ymax-y)/(ymax-ymin)*height`, matching the
existing zone preview export. Routes, markers and overlays share one SVG
viewBox and clipping extent with `preserveAspectRatio="xMidYMid meet"`.
The primary Jezero Explorer adds a shared camera viewBox for zoom and pan.
Inverse screen transforms keep pointer anchors consistent with SVG hit-testing.
Pointer-transparent imagery/routes/rover layers preserve zone selection. Even
with zone outlines/labels hidden, transparent hit polygons retain keyboard and
pointer selection. The visible legend and source details live beside the map,
not in a large overlay covering its geographic extent.

The supplied JPEG remains unregistered and is never used on the real map.
The **original TIFF** carries ESRI:103885, a 6 m pixel transform, and NoData=0.
This differs from the supplied source note's EPSG description. Actual TIFF
metadata, not viewer centre coordinates or that note, drives rasterio reprojection
into the DEM grid. Bilinear imagery and nearest-neighbour valid-data alpha are
exported separately into one RGBA PNG. Outside the original footprint alpha is
zero; the regional extent is never cropped or stretched to fit partial imagery.
The manifest records the original CRS/transform and SHA-256. Source attribution
comes from the supplied Mars Trek/CTX reference, not an independently verified
product catalog match.

## Suitability and constraints

The current documented index is `gentle% + 0.5 * moderate%`, with gentle ≤5°,
moderate >5–15°, steep >15°. Coverage below 90% yields unavailable. The map reads
the existing statistic rather than fabricating mode-specific weights. Index
colors form a continuous 0–100 ramp; no new high/medium/safety thresholds exist.
Missing/nonfinite indices remain unavailable, never zero or survival probability.

The constraints export classifies full-resolution source pixels:

- Red: slope >15°, the existing router's slope exclusion.
- Amber: other documented exclusions (cost outside [1,100), or negative slope).
- Gray: masked/nonfinite DEM, slope or cost; **unassessed**, not a confirmed hazard.
- Transparent: none of those source-resolution exclusions.

Preview aggregation uses maximum class, prioritizing NoData over other exclusions
over steep over transparent. When a source pixel is both steep and cost-excluded
it is labeled steep. This is a conservative visual summary, **not** a reproduction
of the request-dependent A* grid, which averages/resamples its own window. It
does not change passability, thresholds, route evaluation or simulated closures.
The slope-class overlay remains majority-resampled and therefore can look
different from this conservative constraints overlay. A 20 m DEM does not resolve
individual rocks. Normal basemap/overlay NoData remains transparent; the
constraints layer deliberately shows its NoData class in gray with a clear legend.

## Regeneration and checks

From the repository root, using existing backend dependencies:

```powershell
backend/.venv/Scripts/python.exe scripts/gis/export_map_overlays.py
```

This writes only derived `data/web` assets, their `public/jezero` copies, and
source/manifest entries in `data/metadata/data_sources.json`. Raw TIFF/CSV files
are read-only. Raster CRS, transforms, shapes, and manifest extent are checked
before export; the first retained rover point is checked against its published
Mars longitude/latitude. Exported PNGs intentionally store registration in the
manifest, so rasterio may report “NotGeoreferencedWarning” when reading the PNG
alone; it is not a georeferenced TIFF and must not be treated as one.

Frontend tests cover exclusive basemaps, composable overlays, preserved route and
mission state, state persistence, keyboard zone selection, missing values,
misregistered/disconnected assets, exact SVG coordinates on resize, mobile panel
controls and Myanmar labels. GIS regression tests check thresholds, NoData,
alpha, dimensions, manifest alignment, identical public copies and rover records.
Browser checks, when unavailable, remain an explicit limitation: DOM tests do
not prove visual alignment or native responsive rendering in an actual browser.

Verification from the preceding layer integration (superseded by the explorer checks below):

- 84 frontend tests passed with `vitest run --maxWorkers=1 --testTimeout=20000`.
  The initial default five-second run timed out on four UI cases without
  reporting value/assertion failures; assertions were retained in the longer run.
- 29 backend tests passed, including three new export/threshold/transparency
  checks. TypeScript, production build and focused map-file ESLint passed.
- Both new PNGs returned HTTP 200 with `image/png` from the local frontend.
- A real `POST /api/v1/missions/plan` through the frontend proxy for JZ-06
  returned Routes A/B, 14.408 km and 160 points on A, and unavailable science C.
  This is route availability, not operational clearance.
- Source PNGs were visually inspected. Browser automation was unavailable;
  actual browser/mobile rendering and visual overlay alignment remain unverified.

## Jezero Explorer update

The primary real map now has a 256 px collapsible Layers panel, a shared SVG
camera, and a 300 px collapsible Zone Details panel. Below 1280 px, Layers uses
a keyboard-accessible drawer and details stack below the map. Collapsing panels
preserves selection. The mission provider retains inspected zone and layer state;
selecting a destination still opens Mission Setup. Shared navigation and demo
controls are unchanged.

Zoom buttons act around the viewport center. Clicking/focusing the map engages
pointer-anchored wheel zoom; otherwise the page scrolls normally. Drag pans;
touch supports pan/pinch. Zoom is limited to 1–20 times the fitted regional view.
Fit map restores the regional extent. Fit imagery uses the valid-alpha bounding
box with 8% padding. All raster images, polygons, routes and markers use the same
viewBox; inverse screen coordinates account for letterboxing. Drag gestures
suppress zone clicks, while keyboard zone activation remains available. Controls
stay outside the camera. No Earth scale or decorative motion was added.

The slope and constraints sliders change display opacity only. CTX is labeled
“CTX + hillshade,” with a partial coverage badge and a compact orbital-imagery
legend. Technical source/projection information is collapsed in Layer details.
Zone Details prioritizes the documented index, area, elevation, slope and
destination action; methodology and unavailable factors are collapsed in Details.
Extreme-slope quality is described as unresolved, without assuming artifacts.

### CTX footprint evidence

The small footprint is real partial coverage, not a frontend resizing error:

- Source TIFF: ESRI:103885, 5322 × 5040 pixels, 6 m resolution, NoData 0.
  Affine transform: `[6, 0, 4573663.250853, 0, -6, 1109693.140188]`.
- Original projected bounds: `[4573663.250853, 1079453.140188,
  4605595.250853, 1109693.140188]`.
- Reprojected into the DEM CRS: approximately `[4338165.889, 1079453.140,
  4368453.714, 1109693.140]`. Regional DEM bounds are
  `[4329000, 1042080, 4418120, 1143420]`.
- Mars east-positive longitude/latitude bounds are approximately
  `77.16047–77.69918°E, 18.21103–18.72119°N`. Longitude is x, latitude is y;
  the projected y axis is inverted exactly once when converting to preview pixels.
- On the aligned 1114 × 1267 preview, nonzero alpha occupies the bounding box
  `x=115, y=422, width=378, height=378`, with 10.1233% valid-alpha coverage.
  The manifest stores both the bounding box and coverage fraction. The export
  uses the original Mars CRS/transform, bilinear intensity and nearest-neighbor
  validity alpha. The frontend draws the complete aligned canvas without stretching
  the footprint; hillshade remains visible outside it.

### Explorer verification

- 91 frontend tests passed across 14 files, including shared camera transforms,
  fit extents, drag suppression, wheel engagement, simulated pinch, persisted
  preference normalization, route independence and English/Myanmar controls.
- 29 backend tests passed, including actual PNG alpha bounds/fraction, manifest
  alignment and public-copy checks. The PNG registration warning is expected.
- TypeScript, production build and focused map-file ESLint passed.
- Real headless Chrome checks passed at 1600 × 1000 and 390 × 844: actual pointer
  drag, zoom/reset/fit imagery, keyboard zone selection, destination action,
  collapsible details, mobile drawer and Myanmar switching. Neither viewport had
  horizontal overflow; details were beside/below the map rather than overlapping.
  Desktop/mobile screenshots were inspected, including visible CTX terrain and
  its hillshade surround. This does not independently validate source geodesy;
  CRS/registration are checked against the supplied TIFF and manifest.
- Browser runner: `node scripts/check-explorer-browser.mjs`, with the dev server
  on 127.0.0.1:8080 and an isolated Chrome CDP session on port 9337. It uses a
  no-WebGL fallback for the unrelated overview globe. Touch handling has focused
  event tests; physical touch hardware has not been tested.

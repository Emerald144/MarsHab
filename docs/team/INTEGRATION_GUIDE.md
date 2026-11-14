# Integration guide: Phase 1 real Jezero data (not yet integrated)

Stage 1 only reorganised the repository. **No Phase 1 data is wired into the frontend yet.** This guide is the contract for the next stage. File paths are the current, verified ones.

## What the frontend uses today (demo)

| Need | Current source |
|---|---|
| Zones | `ZONES` in `src/lib/mission-data.ts`: A-12…A-19, SVG `points` in a 1000×680 space, 5 hand-authored factor ratings each |
| Default zone | `useState("A-17")` in `src/lib/mission-store.tsx` |
| Map image | `src/assets/jezero-map.jpg` (1536×1024, not georeferenced) |
| Layers | `Layers` type in `src/components/mars/MarsMap.tsx`: suitability, terrain, hazards, resources, science, rover |
| Scoring | `score()` and `MODE_WEIGHTS` in `mission-data.ts` (Survival / Science / Emergency) |
| Zone references | `ZONES.find(...)` in `MarsMap.tsx`, `SurvivalMapView.tsx`, `Views.tsx`, `OverviewDashboard.tsx`; tests `src/test/language.test.tsx`, `overview-dashboard.test.tsx` reference A-zone IDs |

## Phase 1 data to use

| Need | File |
|---|---|
| Zone geometry for the SVG map | `data/web/zones/jezero_zones_preview_pixels.json` → `zones[].svg_points`, `center`; space is **1114×1267 px** and matches the preview PNGs exactly |
| Map-space transform | same file: `px = (x - xmin)/(xmax - xmin) * width`, `py = (ymax - y)/(ymax - ymin) * height` |
| Mars lon/lat geometry | `data/web/zones/jezero_zones_mars_lonlat.geojson` (Mars degrees, not Earth) |
| Statistics per zone | `data/web/statistics/zone_terrain_statistics.json` → `zones[]` keyed by `zone_id` |
| Layers | `data/web/layers/layer_manifest.json` → `raster_layers[]` (`terrain`, `elevation`, `slope`, `hillshade`) with `path`, `bounds`, `legend` |
| Provenance for the UI | `data/metadata/data_sources.json` |

Example zone record (real values, JZ-07):

```json
{"zone_id":"JZ-07","area_km2_spherical":401.776,"centroid_lon_lat_deg":[77.843251,18.704522],
 "elevation_m":{"min":-2624.997,"max":-1898.057,"mean":-2303.274,"range":726.939,"coverage_percent":100.0},
 "slope_deg":{"mean":4.28,"median":3.208,"std":3.987,"p90":8.366,"p99":20.39,"max":81.538},
 "slope_class_percent":{"gentle":73.29,"moderate":23.861,"steep":2.848},
 "terrain_screening":{"dominant_slope_class":"gentle","heuristic_terrain_index":85.2},
 "data_quality_flags":[]}
```

## Required decisions and constraints

1. **Aspect ratio.** The real basemap is 1114×1267 (portrait). The current map is 1000×680 (landscape) with `preserveAspectRatio="slice"`, which would crop zones. Use `slice` only for the demo layers; for the real map use a 1114×1267 viewBox with `meet`, or a separate real-map component. Zone polygons must be drawn in the same viewBox as the PNG.
2. **Demo overlays cannot be placed on the real map.** Hazards, resources, science targets, routes and rover markers are in the 1000×680 illustrative space. Placing them on the real terrain would invent coordinates. Keep them on the demo basemap (or hide them when the real map is shown), labelled "Demo".
3. **Factors.** Only `terrain` can come from real data (`heuristic_terrain_index`, label "derived from real terrain, heuristic"). Resource/access/environment/science have no data for JZ zones. Recommended: `null` → "Not available", mode score computed from available factors with weights renormalised and labelled "partial, terrain-only". Do not map A-xx IDs or ratings to JZ-xx.
4. **JSON import.** Importing the JSON files from `data/` into `src/` needs `"resolveJsonModule": true` in `tsconfig.json` (a shared file; coordinate before editing), or copy/generate a `.ts` module. Vite already handles JSON imports at build time.
5. **PNG assets.** Import via Vite asset imports (or copy to `public/`); do not serve the `.tif` files.
6. **Missing values** (`null`) must render as "Unavailable", never as 0.
7. **i18n.** New labels need Myanmar entries in `src/i18n/translations.ts`.
8. **Badges.** Use `src/components/mars/DataBadge.tsx` to label Real / Derived / Heuristic / Simulated / Demo.

## Backend usage (optional)

The FastAPI service already serves `/api/v1/zones` and `/api/v1/datasets`, but those return the older `zones_v0` files (A/slope/cost stats, no elevation). Phase 1 should read the static files in `data/web/` rather than depend on the backend. If an API is wanted later, add endpoints to the backend that read `data/web/statistics/`.

## Verification checklist after integrating

Zone polygons overlay the terrain PNG correctly (overlay screenshot); panel values equal the JSON; no A-xx ID is reachable; modes/routes/simulation/report/EN-MY/themes/responsive still work; `npm run test` and `npm run build` pass.

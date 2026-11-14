# Science Route C integration

Updated 2026-11-14, on `feature/terranexis-science-meda-integration`. This closes the
gap `docs/team/MEMBER1_SCIENCE_CONTRACT.md` and `docs/datasets/SCIENCE_DATA.md`
left open: at the time those were written, the science catalog (`data/processed/science/targets.json`)
was intentionally empty, so Route C (Science Priority) was always `available: false`.

This change identifies one real, verified, route-eligible science waypoint from
official NASA archive data already present in the repository, and wires it into
a genuine two-leg A* Route C, end to end (backend contract → frontend map/route
UI → feasibility/resources/simulation/emergency/report).

## A. Source products examined

- `data/raw/jezero/Martian_Map_Rover_Files/Martian_Map_Rover_Files/` and
  `data/raw/jezero/Perseverance_Places/Perseverance PLACES/` — the official **Mars 2020
  Rover PLACES** (Position and Attitude Computation Engine for Surface) data-localization
  bundle, already downloaded locally with PDS4 XML labels (`best_tactical.csv.xml`,
  `Mars2020_Rover_PLACES_PDS_SIS.pdf`). Files used: `best_tactical.csv`,
  `best_interp.csv` (the file `backend/app/zones.py` already reads for the verified
  mission base), and `observations.csv`.
- `data/metadata/science_sources.json` — existing USGS SIM 3464 geologic-map source
  record (unchanged; it still contributes no route-eligible target, per
  `docs/datasets/SCIENCE_DATA.md`).
- Online NASA/USGS/PDS pages were **not** re-fetched in this environment; all values
  below come from the PDS4 labels and CSV data already bundled in this repository,
  per the existing precedent in `science_sources.json` (the SIM 3464 entry already
  notes that the online landing pages returned HTTP 403 here on 2026-11-14).

## B. Verified science waypoint candidate

One record was added to `data/processed/science/targets.json`:

| Field | Value |
|---|---|
| id | `m2020-places-site08-cache-depot` |
| kind | `rover_observation` |
| evidence_level | `verified_observation_site` (per this task's vocabulary: a documented rover position during an observation, not a georeferenced sample/rock target) |
| location (Jezero_Crater_Projection) | easting 4354051.81 m, northing 1092667.644 m |
| location (Mars, planetocentric) | 77.44301922°E, 18.433964063°N |
| route_waypoint_eligible | `true` |

**Why this point, and what it is not.** `best_interp.csv` line 1814 and
`best_tactical.csv` both record RMC **Site 8**, established right after the ROVER
record at site 7/drive 2440 (sol 239), with the rover remaining there — no further
drive record — until site 8/drive 64 on sol 278. In that same sol window,
`observations.csv` shows 558 `CACHECAM` frames (starting sclk 690224439.974, sol
≈258), the instrument used to image the rover's sample-tube caching activity. So
Site 8 is the rover's own **documented stop** during a real, named caching
campaign — it is not a georeferenced sample tube, rock or outcrop coordinate (no
such product was available locally), and the catalog record's `limitations` and
`description` say so explicitly. This is exactly the `verified_observation_site`
case the implementation brief distinguishes from a `verified_target`.

A second source record, `nasa-pds-mars2020-rover-places`, was added to
`data/metadata/science_sources.json` documenting the product, its fields, and an
internal cross-check: the SITE 1 (sol 0) row in the same file matches the
`base_location()` value already used by `backend/app/zones.py` (easting
4354494.09 / northing 1093299.70), confirming `best_interp.csv`/`best_tactical.csv`
share one consistent localization and CRS with the rest of this project.

No other candidate was promoted to `route_waypoint_eligible`. The USGS SIM 3464
geologic map remains `kind: mapped_geologic_unit`-eligible in principle but has no
locally extractable feature geometry (no FileGDB reader was used; the source
geodatabase was not touched), so it stays `region_only`/unlocated, per the existing
`SCIENCE_DATA.md` decision — not changed here.

## C. Geospatial alignment and uncertainties

- **CRS match, not reprojection.** The PLACES CSV's `northing`/`easting` fields are
  documented (via `best_tactical.csv.xml`) as "meters north of the equator" /
  "meters east of the prime meridian, measured at the projection's first standard
  parallel" — the same equidistant-cylindrical convention (standard parallel
  18.4663°N) recorded in `data/metadata/spatial_reference.json` for this project's
  DEM/zones (`Jezero_Crater_Projection`). No coordinate transform was applied; the
  CSV values are used directly as `x_m`/`y_m`.
- **Longitude/latitude convention**: east-positive, planetocentric — matches
  `spatial_reference.json`'s stated convention; verified directly from the PDS4
  field descriptions (not assumed).
- **DEM/traversability check**: `backend/app/data.py:point_sample(4354051.81,
  1092667.644)` returns `elevation_m=-2565.82`, `slope_degrees=3.10`,
  `terrain_cost=2.0`, `data_covered=True` — well inside the A* engine's
  traversability bounds (`slope <= 15°`, `1 <= cost < 100`). The point is also
  confirmed (ray-casting point-in-polygon against
  `data/processed/jezero/zones_v0/jezero_final_zones.geojson`) to lie inside **JZ-06**,
  the same zone that contains the mission base/landing site.
- **Uncertainty**: the exact PLACES positional-accuracy figure is not restated
  numerically here (it is documented in the bundled
  `Mars2020_Rover_PLACES_PDS_SIS.pdf`, not re-parsed); the catalog record's
  `limitations` says so rather than inventing a number. No snapping was needed —
  `snap_distance_m: 0`.

## D. Route C algorithm and API changes

- `backend/app/models.py`: `MissionPlanRequest` gained an optional
  `science_waypoint_id: str | None`. No other field changed.
- `backend/app/missions.py`: added `_science_priority_route(...)`, which:
  1. Returns `available: false` with an explicit reason if no waypoint id was
     given, the id is unknown, the record isn't `route_waypoint_eligible`, or its
     location isn't verified — never a fallback to a preset/invented waypoint.
  2. Otherwise calls the existing `routing.route()` A* engine **twice** — base →
     waypoint, then waypoint → destination — with `mode="terrain_aware"`, the same
     DEM/slope/cost rasters, closures, and walking-speed assumption as Routes A/B.
  3. Joins the two leg `LineString`s without duplicating the shared waypoint seam
     point, and sums distance/elevation gain/loss/terrain cost from the two real
     legs (no invented totals).
  4. Computes `estimated_total_eva_hours` with the same round-trip symmetry
     assumption Routes A/B already use (`one_way_hours * 2 + activity + buffer`),
     now documented as its own explicit assumption string.
  5. Attaches the resolved waypoint's identity, evidence level, location,
     provenance (`source_id`), and `limitations` to the response — so the
     frontend/report can show them without re-deriving anything.
  - `plan_mission()` now also computes a `feasibility`/`resource_assessment` for
    Route C specifically (nested under `routes.C`), using the same
    `assess_resource()` helper Routes A/B use, independent of the top-level
    `feasibility` (still based on A/B as before — unchanged behavior when no
    waypoint is requested).
- Routes A and B are untouched when no `science_waypoint_id` is sent — unit-tested
  explicitly (`test_plan_mission_builds_real_two_leg_science_route_for_verified_waypoint`
  asserts A/B distances are identical with and without a waypoint).

## E. Frontend/mission integration

- `src/lib/mission-api.ts`: `MissionPlanInput.scienceWaypointId`, a
  `ScienceRouteOutcome`/`ScienceRouteWaypoint`/`ScienceCatalogTarget` type, and
  `useScienceWaypoints()` / `useScienceCatalog()` hooks against
  `GET /api/science/targets`.
- `src/lib/mission-store.tsx`: new `scienceWaypointId` state; changing it (like
  changing the destination zone) clears the stale mission plan, feasibility,
  routes-generated flag, simulation, reroute and emergency-route state, so no
  stale Route C (or stale A/B) can leak across a waypoint/destination change.
- `src/components/mars/Views.tsx`:
  - **Planner**: a "Science Waypoint (Route C)" select populated only from
    `verified_route_eligible=true` catalog records; "None" keeps Route C
    unavailable. The feasibility panel shows a live Route C summary line.
  - **RouteAnalysis**: Route C becomes a third selectable/highlightable route
    (legend button, table column, map overlay in `var(--mars)`) exactly when
    `plan.routes.C.available` — never a hardcoded "Unavailable" placeholder. The
    map draws the waypoint with a distinct triangular "SCIENCE" marker (see
    `RealTerrainMap.tsx`'s new `waypointPoint` prop), separate from the base/current
    markers, so it is visibly not the same thing as the rover's live position.
    "Start Simulated Mission" now genuinely starts on Route C when it's the
    highlighted route.
  - **Execution**: the former `activeRoute === "C" ? "A" : ...` placeholder (which
    silently substituted Route A whenever C was selected) is replaced with a real
    narrowing lookup; the science waypoint is drawn on the map and named in the
    "Mission in Progress" panel when Route C is active.
  - **Report**: "Route Decision" and "Science targets" panels report the real
    Route C distance/time and the waypoint's name, evidence level, source id,
    coordinates and limitations when available, instead of the previous
    permanently-unavailable copy.
- Historical MEDA panel is unchanged — still observational-only, never a routing
  input (per the brief's constraint).
- English strings and their Myanmar equivalents were added to
  `src/i18n/translations.ts` for every new UI string.

## F. Exact changed files

```
backend/app/missions.py
backend/app/models.py
backend/tests/test_missions.py
backend/tests/test_science_data.py
data/metadata/science_sources.json
data/processed/science/targets.json
src/components/mars/RealTerrainMap.tsx
src/components/mars/Views.tsx
src/i18n/translations.ts
src/lib/mission-api.ts
src/lib/mission-store.tsx
src/test/environment-panel.test.tsx
src/test/mission-section-animations.test.tsx
docs/team/SCIENCE_ROUTE_C_INTEGRATION.md   (new, this file)
```

No DEM/slope/cost raster, no `backend/app/routing.py`, `backend/app/science_api.py`,
`backend/app/science_data.py`, `backend/app/data.py`, `backend/app/zones.py`,
`backend/app/environment_api.py`/`environment_data.py`, or `backend/app/main.py`
line was changed. Member 1's read-only catalog contract/validation rules
(`science_data.py`) were reused unmodified — only a new, schema-conformant record
and a new source entry were added to the existing JSON files.

## G. Backend, frontend, GIS and browser test results

| Check | Result |
|---|---|
| `cd backend && pytest -q` | **61 passed** (was 56 passed / 1 intentionally-empty-catalog test before this change; that test was updated to assert the one new verified record instead) |
| `node node_modules/typescript/bin/tsc --noEmit` | 0 errors |
| `npm run test -- --run` | **10 files, 54 tests passed** (2 new Route C tests added; pre-existing non-fatal jsdom Three.js canvas warnings, unrelated) |
| `npm run build` | Vite + Nitro production build succeeded (pre-existing `INEFFECTIVE_DYNAMIC_IMPORT` warning on `mission-api.ts`, unrelated to this change) |
| GDAL/osgeo GIS validation (`scripts/gis/validate_outputs.py`) | **Not run** — GDAL/osgeo is not available in this Python environment (same limitation noted in `docs/team/PROJECT_STATUS.md`). The point-in-polygon zone check and DEM point-sample check above were done instead, with pure-Python ray casting and the project's own `rasterio`-based `point_sample()`, as an honest substitute — not claimed as full GIS validation. |
| Manual browser check (desktop/mobile, light/dark, English/Myanmar) | **Not performed** — no browser available in this environment; explicitly marked unverified, per the brief's instruction not to falsely claim it. |

## H. Data/provenance limitations

- The waypoint is a **rover localization position**, not an independently
  georeferenced sample/rock/outcrop target. This is stated in the catalog record's
  `evidence_level`, `description`, and `limitations`, and surfaced in the UI
  (Route Analysis caption, Report science-targets panel) rather than hidden.
- The PLACES product's own stated positional-accuracy figure was not restated
  numerically; only the DEM-derived slope/cost/elevation at that point were
  re-verified locally.
- The USGS SIM 3464 geologic map still contributes zero route-eligible targets
  (unchanged from the prior handoff) — no FileGDB reader was introduced, and the
  source geodatabase was not touched, per the brief's constraint against editing
  original NASA/USGS files.
- Official NASA/USGS/PDS web pages were not re-fetched in this run; all claims
  trace to the PDS4 labels and CSVs already committed under `data/raw/jezero/`.

## I. Git branch/status/commits

Branch: `feature/terranexis-science-meda-integration` (unchanged from the start of
this task; verified via `git status`/`git log` before any edit). **No commits were
made and nothing was pushed or merged** — all changes above are currently
uncommitted in the working tree, per the no-push/no-merge instruction. Run `git
status`/`git diff` to review before committing.

## J. Remaining work and next three recommendations

1. If a FileGDB-capable GIS tool becomes available, extract SIM 3464 feature
   geometry/attributes and compute a real intersection with JZ zones, to
   potentially promote a `mapped_geologic_unit`/`region_only` candidate to
   route-eligible — this was explicitly out of reach in this environment (no
   FileGDB reader).
2. Parse `Mars2020_Rover_PLACES_PDS_SIS.pdf` for the product's stated positional
   accuracy and add it as a numeric `horizontal_uncertainty_m` on the catalog
   record, rather than the qualitative note used here.
3. Run the manual browser verification pass (desktop/mobile, both themes, both
   languages, Route C selection → simulation → emergency return → report) once a
   browser/dev-server is available in-session, and run `scripts/gis/validate_outputs.py`
   once GDAL/osgeo is installed, to close the two "not performed" rows in section G.

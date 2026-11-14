# Member 2 + Member 3 handoff: MEDA environment data and mission integration

Written 2026-11-14. **Nothing is committed, pushed, merged or branched.** Branch at the time: `feature/jezero-terrain-integration`.
Member 1's science/geology work was not touched.

## A. Interrupted MEDA work recovered

An earlier agent was cut off after writing these files (all untracked, all intact on disk; none was registered with the app):

| File | State found | State now |
|---|---|---|
| `backend/app/environment_data.py` | implemented, schema for an empty dataset | **rewritten** for the real schema (kept names/contract; added caching, sol/family filters, availability, 503 on bad data) |
| `backend/app/environment_api.py` | router, prefix `/api/environment`, not mounted | prefix changed to the app convention `/api/v1/environment`; added `/availability`; **mounted** in `main.py` |
| `scripts/gis/prepare_meda.py` | generic CSV importer needing a hand-written mapping, never run | **rewritten** around the verified PDS products (deterministic, validated) |
| `data/metadata/meda_sources.json` | `available: false`, "blocked: could not resolve host" | rewritten with verified provenance; blocker resolved |
| `data/metadata/meda_import_schema.example.json` | placeholder `replace-with-...` | **deleted**, replaced by the real `meda_import_mapping.json` |
| `data/processed/environment/meda_observations.csv`, `meda_sol_summary.json` | header only / `status: blocked_download` | real data (see C) |
| `backend/tests/test_environment_data.py`, `test_environment_api.py` | 7 fixture-only tests (the API tests needed `httpx`, which is not installed) | rewritten: 19 tests, no `httpx` needed |
| `docs/datasets/MEDA_ENVIRONMENT.md` | blocker description | rewritten |

The blocker was environmental: the earlier sandbox could not resolve `pds-atmospheres.nmsu.edu`. From this machine the archive is reachable.

## B. New implementation and files changed

Modified (4): `backend/README.md` (section appended), `backend/app/main.py` (+3 lines: import and `include_router`), `src/components/mars/Views.tsx` (MEDA panel in Execution and Report, value-category badges, scenario note, science-unavailable panel), `src/i18n/translations.ts` (new English/Myanmar keys).

New: backend `environment_api.py`, `environment_data.py`, tests `asgi_client.py`, `test_environment_api.py`, `test_environment_data.py`, `test_meda_importer.py`; scripts `scripts/gis/prepare_meda.py`, `fetch_meda_products.py`; data `data/metadata/meda_import_mapping.json`, `meda_products.json`, `meda_sources.json`, `data/processed/environment/` (2 files), `data/raw/meda/` (20 labels + 1 product, 3.2 MB); frontend `src/lib/environment-api.ts`, `src/components/mars/HistoricalObservationPanel.tsx`, `ValueCategory.tsx`, `src/test/environment-panel.test.tsx`; docs `docs/datasets/MEDA_ENVIRONMENT.md`, `docs/team/MEMBER1_SCIENCE_CONTRACT.md`, this file; (and the section appended to `backend/README.md`, listed above).

Not touched: `backend/app/{missions,routing,resources,models,zones,data,config}.py`, `src/lib/{mission-store,mission-api,mission-data}.ts`, all Phase 1 data, `package.json`, `bun.lock`.

## C. Real PDS products

Archive `urn:nasa:pds:mars2020_meda` (<https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/>), citation DOI 10.17189/1522849 (as printed on the PDS Atmospheres MEDA page).
20 products, each with its official `.CSV` + `.xml` URL, version and SHA-256 in `data/metadata/meda_products.json` (checked 2026-11-14): sols 36-39 x {`CAL_ATS` P01, `DER_PS` P01, `DER_WS` P02, `DER_RHS` P03, `DER_ANCILLARY` P03}.
Example: `.../data_derived_env/sol_0000_0089/sol_0036/WE__0036___________DER_PS__________________P01.CSV` (SHA-256 `b2904ca1...`).

* **Date range:** 2021-03-27T04:09:24.994Z to 2021-03-31T06:47:45.293Z (sols 36-39; UTC derived, see H).
* **Verification:** 19/20 local files byte-identical to the official ones; the sol-38 pressure product was missing locally and was downloaded.
* **Counts:** 2,910,973 valid native samples; 5,532 observation rows (first valid sample per 300 s bin).

| Metric | Unit | Valid native samples | Observation rows |
|---|---|---|---|
| `air_temperature.ats1` .. `ats5` (5 channels, 2 Hz) | K | 464,006 each | 815 each |
| `pressure` | Pa | 231,319 | 811 |
| `wind_speed.horizontal` | m/s | 179,812 | 323 |
| `wind_direction` | deg | 179,812 | 323 |

Per sol, pressure samples: 54,957 / 59,531 / 56,196 / 60,635 (sols 36-39). Excluded: wind fill values 995 / 1,185 / 1,331 / 1,584 (2.4-3.4%); no other exclusions. Relative humidity is **not published** (PDS readme: unreliable before sol 63).
Provenance per row: source product id, processing level, source field, SCLK, LMST, LTST, derived UTC, quality flag, rover location.
Rover location: validated for all 4 sols (0.025 m from the latest PLACES pose; no PLACES pose inside the sols), inside **JZ-06**, about 16 m from the mission base.

## D. Environment API

Mounted at `/api/v1/environment/`: `observations`, `summary`, `availability`, `metadata` (see `docs/datasets/MEDA_ENVIRONMENT.md`). Real sample (trimmed, from the running app):

```json
GET /api/v1/environment/observations?metric=pressure&sol=36&limit=1
{ "data_label": {"label": "Historical Rover Observation", "is_current": false, ...},
  "observations": [{ "source_product_id": "WE__0036___________DER_PS__________________P01",
     "processing_level": "derived", "sol": 36, "sclk": 670090050.0, "utc_time": "2021-03-27T04:09:24.994Z",
     "utc_basis": "derived_from_pds_label_linear", "lmst": "00036M00:00:00.393", "ltst": "0035 23:34:39",
     "metric": "pressure", "value": 742.46, "unit": "Pa", "quality": "unflagged", "quality_flag": "transducer=1",
     "rover_location": {"status": "validated", "easting_m": 4354501.716, "northing_m": 1093313.635, ...},
     "jz_zone_id": "JZ-06", "is_current": false }],
  "total": 195, "limit": 1, "offset": 0, "next_offset": 1, "status": "ok" }

GET /api/v1/environment/summary?metric=pressure&sol=36   -> groups[0]:
  { "sol": 36, "metric": "pressure", "unit": "Pa", "sample_count": 54957, "covered_minutes": 928,
    "coverage_fraction_of_sol": 0.6272, "minimum": 732.83, "maximum": 756.18, "mean": 742.929569,
    "first_lmst": "00036M00:00:00.393", "last_lmst": "00036M23:59:59.864" }
```

With no data the endpoints return HTTP 200 and `status: "unavailable"` with a reason (tested).

## E. Frontend / mission integration

* **Historical Rover Observation** panel (`HistoricalObservationPanel.tsx`) in the **Execution** view (right column) and the **Mission Report**: label and OBSERVED badge, "Not live weather, not a forecast, and not valid for every Jezero zone", sol selector (36-39), pressure / air temperature (RSM sensor 1) / horizontal wind speed with min, mean, max, coverage, local mean solar time and derived UTC, a gap-preserving temperature profile, the rover's validated zone, and collapsible data notes. Loading, unavailable, error (with Retry) and per-metric "Not available" states.
* **Scenarios stay scenarios:** the Execution view states the closure "is a user-configured scenario... not detected from, or driven by, MEDA observations". No MEDA value is read by the route, terrain-cost, feasibility, resource or emergency code.
* **Report categories:** every summary fact and panel is tagged Observed / Derived / Estimated / Simulated / Unavailable with a legend (`ValueCategory.tsx`).
* **Preserved (audited, not modified):** real JZ-01..08, terrain layers, A* routes (A, B), feasibility, closure + reroute, emergency return, abstract resource model, EN/MY, themes.
* **Science:** Route C remains unavailable (existing behaviour); the Report states this and points to the contract.

## F. Member 1 contract and unmet dependencies

`docs/team/MEMBER1_SCIENCE_CONTRACT.md`. Unmet: verified science targets (location, provenance, imagery), the science API, and coordinate validation against the DEM/A* grid. **Science Mode integration is not complete** and no science routing exists.

## G. Tests (all run on 2026-11-14)

| Command | Result |
|---|---|
| `cd backend; ..\.venv\Scripts\python.exe -m pytest -p no:cacheprovider -q` | **54 passed** (23 existing + 19 environment + 12 importer), 0 failed |
| `npm run test` | **52 passed**, 10 files (40 existing + 12 new) |
| `node node_modules/typescript/lib/_tsc.js --noEmit` | clean (`npx tsc` fails only because the bun-installed `.bin` shim is not a Node script) |
| `npm run build` | succeeded |
| `validate_outputs.py` (Phase 1 GIS QA, QGIS Python) | **12/12 PASS** |
| `prepare_meda.py --check` and `test_real_pds_import_reproduces_committed_outputs_exactly` | outputs reproduced byte-for-byte |
| Live app (Vite + uvicorn, in-app browser) | Execution and Report views, panel with real data, sol switching, Myanmar, light theme, 375 px width with no horizontal overflow, closure scenario still reroutes, no console errors |

Not tested: the panel's error state in the live browser (covered by a unit test only), a real PDS re-download from a clean machine, tablet widths, screen-reader use, Myanmar text by a native speaker (strings were machine-authored).

## H. Known limitations

* Four sols only (a snapshot); no seasonal, dust-storm or other-location coverage.
* Coverage is 23-69% of each sol per metric (MEDA's 12 h/sol duty cycle); wind is sparsest.
* **UTC is derived** from PDS label times (about +/-1 s), not SPICE. LMST/LTST are as published.
* Observation rows are a decimated subset (one per 300 s); aggregates use all valid samples.
* Wind direction reference frame and uncertainty units are not stated in the labels; the pressure-uncertainty label unit (kelvin) is inconsistent, so it is reported as unverified.
* The rover was inside JZ-06; nothing describes the other zones. "Air temperature (RSM sensor 1)" is one of five channels; the choice is a display default, not a recommendation.
* The PDS licence text was not located (public archive; cite the DOI).
* `Region` and `Destination` labels in the report are tagged Derived as a convention.

## I. Git status (uncommitted)

Modified: `backend/README.md`, `backend/app/main.py`, `src/components/mars/Views.tsx`, `src/i18n/translations.ts`. Everything else listed in B is untracked. Use explicit `git add <paths>`, not `git add .`. `data/raw/meda/` (3.2 MB) and `data/processed/environment/` (1.9 MB) are small enough to commit. Servers started for browser testing were stopped.

## J. Instructions for Member 1 and for merging

* Member 1: follow `MEMBER1_SCIENCE_CONTRACT.md`; keep science code and data in your own files. Overlap risk is limited to `backend/app/main.py` (one added line here) and `src/i18n/translations.ts` (appended block here); resolve by keeping both.
* Merge order suggestion: this work and Member 1's are independent; merge whichever is ready first, then rebase the other.
* Rebuild processed MEDA data after any mapping change: `python scripts/gis/prepare_meda.py`, then `pytest` (the reproduction test fails if the committed outputs are stale).
* Extending to more sols: add them to `SOLS` in `scripts/gis/fetch_meda_products.py`, run it, then the importer; check the humidity cutoff (sol 63) before publishing humidity.

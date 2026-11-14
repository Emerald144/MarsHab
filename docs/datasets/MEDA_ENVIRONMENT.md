# MEDA historical environment data

Real NASA Mars 2020 Perseverance **MEDA** (Mars Environmental Dynamics Analyzer) measurements for sols 36-39,
imported from official PDS4 products and served read-only. They are **historical rover observations**: not live
weather, not a forecast, and not valid for every Jezero zone. They never change A* terrain cost, routes, feasibility,
the resource model or the simulated closure events.

## Source

| | |
|---|---|
| Archive | `urn:nasa:pds:mars2020_meda` (NASA PDS Atmospheres Node) |
| Archive root | <https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/> |
| Catalog page | <https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html> |
| Citation (as printed on the PDS page) | J.A. Rodriguez-Manfredi et al. (2021), *The Mars Environmental Dynamics Analyzer, MEDA*, NASA PDS, DOI [10.17189/1522849](https://doi.org/10.17189/1522849) |
| Collections used | `data_calibrated_env` (air temperature), `data_derived_env` (pressure, wind, humidity, ancillary geometry; collection version 16.0 seen) |
| Subset | sols 36, 37, 38, 39 (UTC 2021-03-27T04:09Z to 2021-03-31T06:47Z) |
| Licence | Public PDS archive; no restriction found on the pages consulted, but no explicit licence text was located. Cite the DOI. |

The full machine-readable record is `data/metadata/meda_sources.json`; the 20 verified products (URLs, versions, SHA-256)
are in `data/metadata/meda_products.json`.

### Products (all `WE__00NN___________<TOKEN>` + padding + version)

| Instrument | Level | Version | Role |
|---|---|---|---|
| `CAL_ATS` Air Temperature Sensor | calibrated (K) | P01 | `air_temperature.ats1..ats5` |
| `DER_PS` Pressure Sensor | derived (Pa) | P01 | `pressure` |
| `DER_WS` Wind Sensor | derived (m/s, deg) | P02 | `wind_speed.horizontal`, `wind_direction` |
| `DER_RHS` Humidity Sensor | derived | P03 | read for diagnostics only (not published, see below) |
| `DER_ANCILLARY` | derived geometry | P03 | rover position per second |

`NN` = 36..39. Directory pattern:
`.../<collection>/sol_0000_0089/sol_00NN/<product>.CSV` with a matching `.xml` PDS4 label.

### Verification performed

* Each official CSV was streamed from the archive and its SHA-256 compared **by content** with the project's local
  files in `data/raw/jezero/Jezero_Weather_/`: 19 of 20 were byte-identical.
* The pressure product for sol 38 was missing locally (a TIRS file was stored in its place, and a few other files were
  mis-filed or carry "(1)" suffixes). The official file was downloaded to `data/raw/meda/products/`.
* The official XML labels are stored in `data/raw/meda/labels/` and were read for units, column meanings and times.

## Processing

`scripts/gis/fetch_meda_products.py` (network; verifies) then `scripts/gis/prepare_meda.py` (offline; normalizes).
The column/unit/range mapping is data, in `data/metadata/meda_import_mapping.json`.

```text
.venv\Scripts\python.exe scripts\gis\fetch_meda_products.py      # optional, needs network
.venv\Scripts\python.exe scripts\gis\prepare_meda.py             # writes data/processed/environment/*
.venv\Scripts\python.exe scripts\gis\prepare_meda.py --check     # fails if outputs differ from a fresh run
```

The importer is deterministic (no wall-clock values in outputs; running twice gives byte-identical files; a test
reproduces the committed outputs from the raw products).

### Decisions

* **No fabrication, no interpolation.** Fill values (`>= 999999999`, observed in the wind product; the readme names
  9999999999), empty cells and values outside documented physical ranges are excluded and counted per sol and metric.
* **Units are the PDS label units**: K, Pa, m/s, degree. No conversion.
* **Times.** `lmst` and `ltst` (local mean / true solar time) and `sclk` are copied from the product. **UTC is derived**
  by a two-point mapping between each product's label start/stop time and its first/last SCLK (the label times imply an
  SCLK drift of about 7.9 ppm = 0.7 s per sol, which this absorbs). It is not a SPICE conversion; estimated accuracy
  about +/-1 s. `utc_basis = derived_from_pds_label_linear`.
* **Quality.** The products have no per-sample quality flag. Rows that pass the checks are `unflagged`; transducer,
  boom and rover-still flags are kept in `quality_flag`.
* **Relative humidity is not published.** The PDS readme states humidity data before sol 63 are not reliable, and the
  label gives no unit. It is reported as an excluded metric with that reason. (Sols 36-39 are all before sol 63.)
* **Pressure uncertainty unit**: the label says kelvin (inconsistent); reported as unverified and not converted.
* **Observations vs aggregates.** `meda_observations.csv` keeps the first valid native sample in each absolute 300 s
  SCLK bin per metric (no averaging). `meda_sol_summary.json` holds per-sol, per-metric aggregates computed from **all**
  valid native samples, with sample counts, coverage minutes and exclusion counts.
* **Location.** Each sample's position comes from the ancillary product (M2020_TOPO frame: +X north, +Z up, so +Y is
  west) added to the PLACES landing-site position. A sol's location is attached only if it agrees with the latest PLACES
  rover pose within 2 m (sols 36-39: 0.025 m, with no PLACES pose inside the sols, so the rover was stationary).
  `jz_zone_id` is the zone that contains the rover at that time; it does not make the value valid for the whole zone.

### Output files

| File | Content |
|---|---|
| `data/processed/environment/meda_observations.csv` | 5,532 decimated native samples, 24 columns (schema in `environment_data.OBSERVATION_FIELDS`) |
| `data/processed/environment/meda_sol_summary.json` | aggregates, exclusion counts, per-product import report, rover location validation, time conventions |
| `data/metadata/meda_sources.json` / `meda_products.json` / `meda_import_mapping.json` | provenance, verified product list, reviewed mapping |
| `data/raw/meda/labels/*.xml`, `data/raw/meda/products/*.csv` | official PDS labels; the one product that was missing locally |

## API (read-only, mounted in `backend/app/main.py`)

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/environment/observations?metric=&start=&end=&sol=&limit=&offset=` | rows (limit 1..1000, default 100), `total`, `next_offset`, provenance. `metric=air_temperature` selects the family `air_temperature.*` |
| `GET /api/v1/environment/summary?metric=&sol=&by=sol` | per-sol per-metric aggregates (derived) |
| `GET /api/v1/environment/availability` | coverage, quality counts, location status, excluded metrics, missing-data and product diagnostics |
| `GET /api/v1/environment/metadata` | source manifest, verified product list, import summary |

All responses include a `data_label` (`Historical Rover Observation`, `is_current: false`). Empty datasets return
HTTP 200 with `status: "unavailable"` and a reason; unreadable files return 503; bad parameters 422.

## Limitations

* Four sols are a snapshot, not a climatology; no seasonal or dust-storm coverage.
* MEDA samples about 12 hours per sol (even hours on even sols, odd hours on odd sols); coverage is 23-69% of a sol per
  metric, and wind is much sparser (derived wind exists only for part of the day and about 3% of wind samples are fill
  values).
* Values describe the rover's location, which was inside JZ-06 close to the landing site for sols 36-39. Nothing here
  describes JZ-01..JZ-05, JZ-07, JZ-08.
* The wind direction reference frame is not stated in the label.
* UTC is derived (about +/-1 s), not computed from SPICE.
* Not provided: dust, radiation, humidity, ground temperature (TIRS), or any forecast.

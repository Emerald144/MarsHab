# Data inventory

Verified 2026-11-14. Every file below was hashed (SHA-256) before and after the restructure; all moved files are byte-identical. Full machine-readable details (hashes, CRS, extents) are in `data/metadata/existing_data_inventory.json`; provenance is in `data/metadata/data_sources.json`; the full Phase 1 report is `docs/datasets/PHASE1_DATA_REPORT.md`.

> The Phase 1 report and some metadata files record paths in the **pre-restructure layout** (for example `Jezero_CTX_DEM/...`). They are intentionally unchanged as a historical record. `scripts/gis/common.py::resolve_recorded()` maps old paths to the current ones.

## Coordinate system (all rasters and zone files)

`Jezero_Crater_Projection`: equidistant cylindrical, standard parallel 18.4663°N, Mars 2000 sphere (R = 3,396,190 m), metres. Longitude is east-positive; latitude is planetocentric. See `data/metadata/spatial_reference.json`.

## Real (original NASA/USGS)

| Path | Description |
|---|---|
| `data/raw/jezero/Jezero_CTX_DEM/M20_JezeroCrater_CTXDEM_20m.tif` | USGS Mars 2020 CTX DEM, 20 m, 4456×5067, Float32 metres. Used for all elevation statistics. |
| `data/raw/jezero/Martian_Map_Rover_Files/`, `Perseverance_Places/`, `NASADataSearch/` | PDS Mars 2020 PLACES rover localization tables and labels. The `.img` map files referenced by the labels are **not present**. Used by the backend rover track. |
| `data/raw/jezero/Jezero_Weather_/` | MEDA weather CSVs, sols 36–39. Used by the backend weather summary. |

## Derived

| Path | Description |
|---|---|
| `data/raw/jezero/Jezero_CTX_DEM/Jezero_Slope.tif` | Slope in degrees (Horn, 3×3). Validated: bit-identical to an independent GDAL recomputation. Lives in `raw/` only because the QGIS project references it relatively; treat as derived. |
| `data/raw/jezero/Jezero_CTX_DEM/Jezero_Terrain_Cost.tif` | Prototype slope-cost raster (bins 1/2/4/8/100). **Heuristic.** Used by backend routing; not used for Phase 1 statistics. |
| `data/raw/jezero/Jezero_CTX_DEM/Jezero_CTX_DEM.qgz` | QGIS project (references the three rasters above; has no zone layer). |
| `data/processed/jezero/zones_v0/` | Study zones JZ-01…JZ-08 (`jezero_final_zones.geojson`), earlier slope/cost statistics (superseded by `data/web/statistics/`), dataset metadata. The folder was originally named `Jezero_HiRISE_DEM` but is CTX-based. |
| `data/processed/jezero/hillshade.tif` | Phase 1 hillshade (display only). |
| `data/web/zones/` | `jezero_zones.geojson` (projected metres), `jezero_zones_mars_lonlat.geojson` (Mars degrees), `jezero_zones_preview_pixels.json` (SVG pixel space of the preview PNGs). |
| `data/web/statistics/` | `zone_terrain_statistics.json` and `.csv` (elevation, slope, class percentages, heuristic terrain index, quality flags). |
| `data/web/layers/` | `terrain_`, `elevation_`, `slope_`, `hillshade_preview.png` (1114×1267 RGBA) and `layer_manifest.json` (bounds, CRS, resolution, legends). |
| `data/metadata/` | `data_sources`, `spatial_reference`, `processing_metadata`, `existing_data_inventory`, `validation_report` (12/12 QA checks passed). |

## Project-defined / simulated

- Zones JZ-01…JZ-08 are project-defined geometric partitions, not official NASA hazard zones.
- Frontend demo data in `src/lib/mission-data.ts` (zones A-12…A-19, factor ratings, routes A/B/C, hazards, resources, science targets, rover markers) is simulated and **not georeferenced**. `src/assets/jezero-map.jpg` (1536×1024) is not georeferenced either.

## Duplicates (identical content, left in place, not deleted)

- `best_interp.csv` (+ `.xml`): in `Martian_Map_Rover_Files/Martian_Map_Rover_Files/` and `NASADataSearch/NASADataSearch/`.
- `best_tactical.csv` (+ `.xml`) and `m20_orbital_dem.xml`, `m20_orbital_map.xml`: in `Martian_Map_Rover_Files/` and `Perseverance_Places/`.
- Two MEDA CSVs sit in the wrong sub-folders: `MEDA_PS_Sol36-39/…0038…DER_TIRS…P04 (1).csv` and `MEDA_TIRS_Sol36-39/…0039…DER_WS…P02 (1).csv`.

## Missing

`Jezero_Final_Terrain_Stats.gpkg` (not needed; zones were exported from it), the CTX 5 m orthomosaic `M20_JezeroCrater_CTXortho_mosaic_5m.tif` (recommended next download), `m20_orbital_dem.img` / `m20_orbital_map.img`, USGS SIM 3464 geology (optional).

## Known data caveats

- Maximum slopes of 75–88° at 20 m likely include DEM artefacts. Use `p90`/`p99` and class percentages, not `max`.
- `heuristic_terrain_index` = `100 × (f_gentle + 0.5 × f_moderate)`; heuristic, slope-only, not validated.
- GDAL writes `*.aux.xml` sidecars (statistics metadata) next to rasters when statistics are computed. Two are tracked in git; they are unchanged by the restructure. The GIS scripts set `GDAL_PAM_ENABLED=NO` so they do not create or modify sidecars.

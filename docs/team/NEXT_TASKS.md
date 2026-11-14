# Next tasks

Phase 1 integration only. Phase 2 (terrain-aware route optimization, oxygen models, live monitoring) is **out of scope** until Phase 1 is done. Suggested roles are not permanent. Work on separate feature branches; do not edit the shared files listed in PROJECT_STATUS.md without telling the other developer.

## Developer A: frontend and integration

1. **Data module** (`feature/terrain-map`). Create `src/lib/jezero-real-data.ts` that loads `data/web/statistics/zone_terrain_statistics.json`, `data/web/zones/jezero_zones_preview_pixels.json` and `data/web/layers/layer_manifest.json`, with types and "unavailable" handling for nulls. Decide JSON import vs generated `.ts` (see INTEGRATION_GUIDE #4). Add unit tests that the 8 zones load and values equal the JSON.
2. **Real zone map**. Add a real-terrain view using the 1114×1267 space with JZ-01…JZ-08 polygons, selection/highlight, and layer switches for Terrain, Elevation, Slope, Hillshade (from the manifest, with legends). Keep demo overlays on the demo basemap, labelled "Demo". Preserve pan/zoom, click, themes, responsive layout.
3. **Zone data and scoring**. Replace `ZONES`/`destination` default and every dropdown with JZ zones; remove A-12…A-19 from calculations; update the tests that reference A-zone IDs. Terrain factor = heuristic index; other factors `null` → "Not available"; partial mode scores as in INTEGRATION_GUIDE #3. Add the zone statistics panel and Real/Derived/Heuristic/Demo badges; add Myanmar strings.

## Developer B: backend and GIS

1. **Decide the sidecar policy.** GDAL tools with PAM enabled (QGIS, `gdalinfo -stats`) rewrite the `*.aux.xml` files next to the rasters; two are tracked in git. Decide whether to keep them tracked or add them to `.gitignore`.
2. **Optional orthomosaic.** Download the USGS CTX 5 m orthomosaic (`M20_JezeroCrater_CTXortho_mosaic_5m.tif`, verify terms), generate a lightweight web layer on the same bounds, and re-run `scripts/gis/run_all.bat` QA. Check large-file storage policy before committing any raster.
3. **Backend tests and hygiene.** Add `pytest` to a dev requirements file; untrack the committed `__pycache__/*.pyc` files (needs a commit; coordinate); consider an endpoint serving `data/web/statistics`.

## Shared / housekeeping

- Fix the CRLF/prettier lint noise (≈10.9k errors are line endings from Windows checkouts): add `.gitattributes` (`* text=auto eol=lf`) and re-normalise in one coordinated commit.
- Decide who commits the Stage 1 restructure (it is currently **uncommitted**), and on which branch.
- Review: hash-verified data are in `data/`; re-run `python scripts/gis/validate_outputs.py` (via QGIS Python) after any data change.

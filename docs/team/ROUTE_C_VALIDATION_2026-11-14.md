# Route C validation record

This record supersedes the earlier environment-only validation note in
`SCIENCE_ROUTE_C_INTEGRATION.md`.

## Confirmed correction

Independent A* legs originally built independent resampled raster envelopes.
For RMC Site 8, the leg-1 endpoint and leg-2 start then differed by 47.48 m,
and the joined geometry was 40.50 m shorter than the two leg geometries.

The narrow fix in `backend/app/routing.py` and `backend/app/missions.py` gives
Route C one common search envelope for base, waypoint, and destination. Route A
and Route B calls retain their existing per-request envelope.

## QGIS/GDAL proof

Environment: QGIS 4.2.3 Python, GDAL 3.13.3.

- `scripts/gis/validate_outputs.py`: **12/12 PASS**.
- `scripts/gis/validate_route_c.py`: **PASS**.
- Waypoint: `m2020-places-site08-cache-depot`, RMC Site 8, sols 239–278.
- CRS: `Jezero_Crater_Projection`, Mars 2000 sphere, radius 3,396,190 m.
- Raster resolution: 20 m × 20 m.
- Waypoint location: contained by `JZ-06`.
- Waypoint samples: elevation `-2565.8159 m`, slope `3.0962°`, terrain cost `2.0`.
- Route C destination used for this run: `JZ-07`.
- Route vertices: `194`; invalid NoData/out-of-extent vertices: `0`.
- Reported leg distances: `798.6 m + 29,209.6 m = 30,008.2 m`.
- Geometry leg distances: `798.614 m + 29,209.577 m = 30,008.191 m`.
- Geometry seam: deduplicated; leg-sum discrepancy: `0 m` within floating-point precision.

## Remaining gate

Manual browser verification is still **not verified**. The computer-use browser
host was unavailable after its required retry, so no visual claim is made for
desktop/tablet/mobile layout, light/dark themes, English/Myanmar rendering, or
the end-to-end visible Route C → simulation → emergency return → report flow.

# TerraNexis science-data handoff

## Result

This handoff provides an authoritative-source catalog and a safe, empty target
catalog. It intentionally provides **zero verified, route-eligible waypoints**.
The supplied USGS SIM 3464 package establishes a regional geologic map, but it
does not by itself establish a source-verified target coordinate that can be
assigned to a project JZ zone. Inventing target coordinates or zone assignments
would violate the source constraints.

## Source and lineage

The immutable source package was inspected in place at:

`C:\Users\htoom\Downloads\sim3464_database\sim3464_JezeroNili_FINAL`

Its supplied XML metadata identifies the product as *Geologic map of Jezero
crater and the Nili Planum region, Mars*, by Vivian Z. Sun and Kathryn M. Stack,
USGS Scientific Investigations Map 3464, 2020. It gives the source URL
https://doi.org/10.3133/sim3464 and USGS landing page
https://pubs.usgs.gov/publication/sim3464. On 2026-11-14 both official pages
returned HTTP 403 from this environment, so online-page fields were not inferred
or claimed as independently verified.

The package has `Nili.gdb`, MXD/layer definitions, XML metadata, coordinate
systems, and rasters. The full machine-readable source inventory is in
`data/metadata/science_sources.json`; the raw package was neither copied nor
modified.

## CRS and coordinate safety

The supplied `MTM_clon77_5E.prj` specifies **Mars_2000_(Sphere)** with radius
3,396,190 m and a Transverse Mercator projection, central meridian 77.5°E,
origin 0°, scale 1, and metre units. It is not Earth WGS84. The SIM 3464 local
metadata publishes a 76.8–77.8° by 17.7–18.7° bounding box, but does not
explicitly state longitude direction or latitude definition. Those conventions
are therefore recorded as unspecified—not silently converted.

The host project's JZ zones use a distinct Mars 2000 spherical equidistant
cylindrical CRS with planetocentric latitude and east-positive longitude.
Although the stated SIM 3464 bounds overlap that study area, no target was
reprojected: the source feature geometry/attributes were not extracted through
a verified FileGDB reader and an overlap alone does not demonstrate a target's
location.

## Dataset contract

`targets.json` is a JSON array. A populated record must have this shape:

```json
{
  "id": "source-defined-id",
  "name": "source-verified name",
  "kind": "science_target|mapped_geologic_unit|rover_observation",
  "location": {
    "x_m": null,
    "y_m": null,
    "crs": null,
    "mars_lon_deg": null,
    "mars_lat_deg": null,
    "location_verified": false
  },
  "geologic_unit_id": null,
  "jz_zone_ids": [],
  "description": "source-grounded summary",
  "source_id": "usgs-sim-3464",
  "evidence_level": "verified_record_without_verified_location",
  "route_waypoint_eligible": false,
  "is_historical": false
}
```

The current catalog is intentionally `[]`: it has no sample records, imagery,
or rover observations. No `geologic_units.geojson` was generated because native
feature geometry/attributes could not be inspected with a verified FileGDB
reader. `null` is required for unavailable coordinates; a record can only be
route eligible when `location_verified` is true.

## Integration

The router is deliberately not mounted in `backend/app/main.py`, which belongs
to the integration owner. To enable it, that owner should add:

```python
from .science_api import router as science_router
app.include_router(science_router)
```

Read-only endpoints:

- `GET /api/science/sources`
- `GET /api/science/targets?kind=&zone=&verified_route_eligible=&offset=0&limit=50`
- `GET /api/science/targets/{target_id}`

The current response to `GET /api/science/targets` is:

```json
{"items": [], "total": 0, "offset": 0, "limit": 50}
```

Before importing any target, install a known FileGDB-capable GIS tool, inspect
the precise feature-class geometry and attributes, establish a documented
Mars-only transformation and round-trip check to the host JZ CRS, then compute
actual intersections. Preserve the source geodatabase as immutable.

## Files and limitations

New files are limited to the isolated science catalog, router, tests, and this
documentation. No existing project files, DEM/slope products, A* routing,
missions, or frontend code were changed. Tests exercise the catalog’s safe
empty state, Mars CRS declaration, and read-only router shape. Run from
`backend` with `pytest -q`.

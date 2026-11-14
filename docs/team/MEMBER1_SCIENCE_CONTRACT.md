# What Member 3 needs from Member 1 (science / geology)

**Status: science routing is unavailable and stays unavailable until Member 1 delivers real, verified data.**
Member 1's files are not touched or duplicated by the MEDA/mission work. No science adapter code was added (it would
guess at Member 1's API names); this document is the contract instead.

## Where science currently stands in the app

* Backend: `backend/app/missions.py` returns Route C ("Science Priority") as `available: false` with
  `SCIENCE_PRIORITY_UNAVAILABLE_REASON`. Routes A and B run real A* over the DEM-derived cost grid.
* Frontend: Route C shows that reason; the Report has a "Science targets: UNAVAILABLE" panel; Science mode only changes
  suitability weights (`MODE_WEIGHTS` in `src/lib/mission-data.ts`). The demo science markers
  (`SCIENCE_TARGETS`) are illustrative and not georeferenced; they must never be used as targets.

## Requested API (names are a proposal; Member 1 may choose others if the shape is kept)

`GET /api/v1/science/availability` and `GET /api/v1/science/targets?zone_id=&limit=&offset=`

Empty state must be explicit: `{ "available": false, "targets": [], "reason": "..." }`, HTTP 200.

```jsonc
{
  "available": true,
  "data_label": { "label": "...", "is_current": false },
  "targets": [{
    "target_id": "stable-string",
    "name": "as published",
    "category": "geologic_unit | sample_site | feature | other",
    "location": {
      "status": "verified",                       // otherwise omit coordinates entirely
      "easting_m": 4354501.7, "northing_m": 1093313.6,   // Jezero_Crater_Projection (same CRS as data/web/zones)
      "lon_deg": 77.45, "lat_deg": 18.44,         // optional; Mars, planetocentric, east-positive
      "coordinate_source": "agency product + field",     // how it was obtained
      "method": "published_by_agency | digitised_from_map"
    },
    "jz_zone_id": "JZ-06",                        // derived containment, nullable
    "scientific_value": { "summary": "text from the source", "basis": "citation / product id" },  // no invented numeric score
    "image": { "record": "id or null", "url": "https://...", "verified_link": false },
    "provenance": { "agency": "", "product": "", "identifier": "", "url": "", "date": "", "attribution": "" },
    "quality": { "notes": "", "limitations": "" }
  }]
}
```

Rules: no invented coordinates; no numeric "safety" or "science score" that is not published; an image is linked to a
target only if the relationship is verifiable (otherwise `verified_link: false`); Mars coordinates stay Mars
coordinates.

## What Member 3 does once real data exists (not before)

1. Check coordinates against the DEM extent and the A* grid (`backend/app/routing.py`; the resampled cell size is reported in each route's `grid_resolution_m`) and confirm the
   target is on or near a traversable cell.
2. Add an optional `science_target_id` to the mission plan request; Route C = start -> verified target -> destination,
   using the same A* engine. Routes stay unavailable for zones with no verified target.
3. Show targets in the real-terrain map only where verified; keep every demo marker labelled "Demo".
4. Add report entries: target location and provenance as **Observed/Derived**, route metrics **Derived/Estimated**.

## Ownership

| Member 1 | Member 3 |
|---|---|
| `backend/app/science_*.py` (new), `data/processed/science/`, `data/metadata/science_sources.json`, science docs | `backend/app/missions.py` (Route C), `src/lib/mission-api.ts`, map/report UI, translations |

Shared files (`backend/app/main.py`, `backend/app/models.py`, `src/i18n/translations.ts`) need a heads-up before editing
(`main.py` already has one added line for the environment router).

## Acceptance criteria

* Targets are reproducible from cited agency products, with the import script and manifest committed.
* Coordinates are validated against the DEM (inside coverage, no NoData).
* The empty/unavailable state is honest and tested.
* No demo or AI-generated imagery is described as an agency product.

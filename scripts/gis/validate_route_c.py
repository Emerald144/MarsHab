"""Validate the science-waypoint Route C against the Mars raster/vector data.

This is a read-only integration check.  It asks the running FastAPI service for
Route C, then uses GDAL/OGR to verify the waypoint and every returned geometry
vertex against the documented Mars projected datasets.  It never writes raster,
vector, or metadata files.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path
from typing import Any

from osgeo import gdal, ogr, osr


def request_json(url: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def mars_srs(wkt: str) -> osr.SpatialReference:
    result = osr.SpatialReference()
    result.ImportFromWkt(wkt)
    return result


def point_sample(dataset: gdal.Dataset, point: tuple[float, float]) -> float | None:
    x, y = point
    transform = dataset.GetGeoTransform()
    column = int(math.floor((x - transform[0]) / transform[1]))
    row = int(math.floor((y - transform[3]) / transform[5]))
    if not (0 <= column < dataset.RasterXSize and 0 <= row < dataset.RasterYSize):
        return None
    value = float(dataset.GetRasterBand(1).ReadAsArray(column, row, 1, 1)[0, 0])
    nodata = dataset.GetRasterBand(1).GetNoDataValue()
    if not math.isfinite(value) or (nodata is not None and math.isclose(value, nodata)):
        return None
    return value


def geometry_length(coordinates: list[list[float]]) -> float:
    return sum(
        math.hypot(b[0] - a[0], b[1] - a[1])
        for a, b in zip(coordinates, coordinates[1:])
    )


def check_route(root: Path, base_url: str, destination: str, waypoint_id: str) -> dict[str, Any]:
    target = request_json(f"{base_url}/api/science/targets/{waypoint_id}")
    plan = request_json(
        f"{base_url}/api/v1/missions/plan",
        method="POST",
        payload={
            "destination_zone_id": destination,
            "science_waypoint_id": waypoint_id,
            "eva_hours": 72,
            "science_hours": 1,
            "buffer_hours": 0.5,
        },
    )
    route_c = plan["routes"]["C"]
    if not route_c.get("available"):
        raise AssertionError(f"Route C unavailable: {route_c.get('reason')}")

    location = target["location"]
    waypoint = (float(location["x_m"]), float(location["y_m"]))
    if location.get("crs") != "Jezero_Crater_Projection":
        raise AssertionError(f"unexpected waypoint CRS: {location.get('crs')}")
    if not target.get("route_waypoint_eligible") or not location.get("location_verified"):
        raise AssertionError("Route C target is not explicitly verified and route eligible")

    raster_dir = root / "data" / "raw" / "jezero" / "Jezero_CTX_DEM"
    datasets = [
        gdal.Open(str(raster_dir / "M20_JezeroCrater_CTXDEM_20m.tif")),
        gdal.Open(str(raster_dir / "Jezero_Slope.tif")),
        gdal.Open(str(raster_dir / "Jezero_Terrain_Cost.tif")),
    ]
    if any(dataset is None for dataset in datasets):
        raise AssertionError("one or more Route C rasters could not be opened with GDAL")
    dem, slope, cost = datasets
    raster_srs = mars_srs(dem.GetProjection())
    rasters_share_crs = all(raster_srs.IsSame(mars_srs(dataset.GetProjection())) for dataset in datasets[1:])
    if not rasters_share_crs:
        raise AssertionError("DEM, slope, and terrain-cost rasters do not share a CRS")
    zone_metadata = json.loads(
        (root / "data" / "processed" / "jezero" / "zones_v0" / "jezero_dataset_metadata.json").read_text(
            encoding="utf-8"
        )
    )
    if not raster_srs.IsSame(mars_srs(zone_metadata["coordinate_reference_system"]["wkt"])):
        raise AssertionError("Route C rasters and zone metadata CRS differ")

    zones = ogr.Open(str(root / "data" / "processed" / "jezero" / "zones_v0" / "jezero_final_zones.geojson"))
    if zones is None:
        raise AssertionError("zone GeoJSON could not be opened with OGR")
    point = ogr.Geometry(ogr.wkbPoint)
    point.AddPoint(*waypoint)
    containing_zones = []
    for feature in zones.GetLayer(0):
        if feature.GetGeometryRef().Contains(point):
            containing_zones.append(feature.GetField("area_id") or feature.GetFID())
    if containing_zones != ["JZ-06"]:
        raise AssertionError(f"RMC Site 8 expected in JZ-06, found in {containing_zones}")

    waypoint_samples = [point_sample(dataset, waypoint) for dataset in datasets]
    if any(value is None for value in waypoint_samples):
        raise AssertionError(f"Route C waypoint contains NoData: {waypoint_samples}")

    route = route_c["route"]
    coordinates = route["geometry"]["coordinates"]
    legs = route["properties"]["legs"]
    leg1_coordinates = legs["base_to_waypoint"]["geometry"]["coordinates"]
    leg2_coordinates = legs["waypoint_to_destination"]["geometry"]["coordinates"]
    invalid_vertices = [
        coordinate
        for coordinate in coordinates
        if any(point_sample(dataset, (coordinate[0], coordinate[1])) is None for dataset in datasets)
    ]
    if invalid_vertices:
        raise AssertionError(f"{len(invalid_vertices)} Route C vertices contain NoData or leave raster extent")
    reported_leg1 = legs["base_to_waypoint"]["properties"]["distance_m"]
    reported_leg2 = legs["waypoint_to_destination"]["properties"]["distance_m"]
    reported_combined = route["properties"]["distance_m"]
    if abs(reported_leg1 + reported_leg2 - reported_combined) > 1e-6:
        raise AssertionError("Route C reported leg distances do not sum to the combined distance")
    if len(leg1_coordinates) + len(leg2_coordinates) - 1 != len(coordinates):
        raise AssertionError("Route C geometry has an unexpected waypoint seam")

    leg1_geometry = geometry_length(leg1_coordinates)
    leg2_geometry = geometry_length(leg2_coordinates)
    combined_geometry = geometry_length(coordinates)
    return {
        "gdal_version": gdal.VersionInfo("--version"),
        "target_id": target["id"],
        "target_kind": target["kind"],
        "sol_range": target["provenance_detail"]["sol_range"],
        "waypoint_crs": location["crs"],
        "containing_zones": containing_zones,
        "raster_crs_is_mars": "Mars" in dem.GetProjection() and "3396190" in dem.GetProjection(),
        "rasters_share_crs": rasters_share_crs,
        "zone_metadata_crs_matches": True,
        "raster_resolution_m": [dem.GetGeoTransform()[1], abs(dem.GetGeoTransform()[5])],
        "waypoint_dem_slope_cost": waypoint_samples,
        "route_vertices": len(coordinates),
        "invalid_route_vertices": len(invalid_vertices),
        "reported_leg_distances_m": [reported_leg1, reported_leg2],
        "reported_combined_distance_m": reported_combined,
        "reported_leg_sum_delta_m": reported_leg1 + reported_leg2 - reported_combined,
        "geometry_leg_distances_m": [round(leg1_geometry, 3), round(leg2_geometry, 3)],
        "geometry_combined_distance_m": round(combined_geometry, 3),
        "geometry_leg_sum_delta_m": round(leg1_geometry + leg2_geometry - combined_geometry, 6),
        "geometry_seam_deduplicated": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--destination", default="JZ-07")
    parser.add_argument("--waypoint", default="m2020-places-site08-cache-depot")
    args = parser.parse_args()
    try:
        result = check_route(args.root.resolve(), args.base_url.rstrip("/"), args.destination, args.waypoint)
    except (AssertionError, OSError, ValueError, KeyError, RuntimeError) as error:
        print(f"Route C GDAL validation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

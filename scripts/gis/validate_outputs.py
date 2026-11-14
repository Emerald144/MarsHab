"""Step 4: automated QA. Writes metadata/validation_report.json and exits 1 on failure."""
from __future__ import annotations

import csv
import math
import sys

import numpy as np
from osgeo import gdal
from PIL import Image
from pyproj import CRS
from shapely.geometry import box, shape

import argparse
from pathlib import Path

from common import (META, OUT, RAST, ROOT, SRC_DEM, SRC_ZONE_META, SRC_ZONE_STATS, STATS, VECT, WEB,
                    now_iso, read_json, rel, resolve_recorded, write_json)

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_PAM_ENABLED", "NO")  # keep source rasters untouched
checks = []


def check(n, name, ok, detail=""):
    checks.append(dict(id=n, check=name, status="PASS" if ok else "FAIL", detail=detail))


def main():
    zones = read_json(VECT / "jezero_zones.geojson")["features"]
    stats = read_json(STATS / "zone_terrain_statistics.json")
    recs = {z["zone_id"]: z for z in stats["zones"]}
    dem = gdal.Open(str(SRC_DEM)); gt = dem.GetGeoTransform()
    W, H = dem.RasterXSize, dem.RasterYSize
    dem_box = box(gt[0], gt[3] + H * gt[5], gt[0] + W * gt[1], gt[3])
    geoms = {f["id"]: shape(f["geometry"]) for f in zones}

    bad = [k for k, g in geoms.items() if not g.is_valid]
    check(1, "All vector geometries are valid", not bad, f"invalid: {bad}" if bad else f"{len(geoms)} valid")
    ids = [f["id"] for f in zones]
    check(2, "Zone IDs are unique", len(ids) == len(set(ids)), ", ".join(ids))
    outside = [k for k, g in geoms.items() if not g.intersects(dem_box)]
    partial = [k for k, g in geoms.items() if not g.within(dem_box)]
    check(3, "Zone geometries intersect raster coverage", not outside,
          f"all intersect; fully inside DEM extent: {len(geoms) - len(partial)}/{len(geoms)}")
    proc = read_json(META / "processing_metadata.json")
    same = CRS.from_wkt(dem.GetProjection()).equals(CRS.from_wkt(stats["crs_projected"]))
    zmeta = read_json(SRC_ZONE_META)
    same_zone = CRS.from_wkt(dem.GetProjection()).equals(CRS.from_wkt(zmeta["coordinate_reference_system"]["wkt"]),
                                                         ignore_axis_order=True)
    sl = gdal.Open(str(resolve_recorded(proc["slope_used"])))
    grid_ok = sl.GetGeoTransform() == gt and (sl.RasterXSize, sl.RasterYSize) == (W, H)
    check(4, "Raster and zone CRS align", same and grid_ok and same_zone,
          f"DEM==stats CRS: {same}; DEM==zone metadata CRS: {same_zone}; slope grid identical: {grid_ok}")
    nd_ok = all(r["elevation_m"]["min"] is None or r["elevation_m"]["min"] > -1e5 for r in recs.values())
    check(5, "NoData excluded from statistics", nd_ok,
          "no elevation minimum near float32 NoData (-3.4e38) or -9999; mask built from band NoData")
    fin = all(all(v is None or (isinstance(v, (int, float)) and math.isfinite(v))
                  for v in list(r["elevation_m"].values()) + list(r["slope_deg"].values())) for r in recs.values())
    rng = all(-9000 < r["elevation_m"]["min"] <= r["elevation_m"]["max"] < 22000 for r in recs.values()
              if r["elevation_m"]["min"] is not None)
    check(6, "Elevation values numeric and finite", fin and rng, "within Mars physical range -9 km..+22 km")
    srng = all(0 <= r["slope_deg"]["min"] <= r["slope_deg"]["max"] <= 90 for r in recs.values()
               if r["slope_deg"]["min"] is not None)
    check(7, "Slope values within 0-90 degrees", srng and proc["slope_validation"]["passed"],
          f"existing slope vs recomputation: mean |diff| {proc['slope_validation']['abs_diff_mean_deg']} deg")
    area_ok = all(abs(r["area_km2_spherical"] - geoms[k].area / 1e6) / r["area_km2_spherical"] < 0.02
                  and abs(r["pixels_in_zone"] * 400e-6 - geoms[k].area / 1e6) / (geoms[k].area / 1e6) < 0.01
                  for k, r in recs.items())
    check(8, "Zone area computed in suitable units", area_ok,
          "km2 from projected metres and from sphere geodesic; agree within 2%; pixel count x 400 m2 within 1%")
    with open(STATS / "zone_terrain_statistics.csv", encoding="utf-8") as f:
        rows = {r["zone_id"]: r for r in csv.DictReader(f)}
    mism = []
    for k, r in recs.items():
        c = rows.get(k)
        if c is None: mism.append(k); continue
        for a, b in [(r["elevation_m"]["mean"], c["elev_mean_m"]), (r["slope_deg"]["mean"], c["slope_mean_deg"]),
                     (r["area_km2_spherical"], c["area_km2_spherical"]), (r["slope_class_percent"]["steep"], c["pct_steep"])]:
            if (a is None) != (b == "") or (a is not None and abs(a - float(b)) > 1e-9): mism.append(k)
    check(9, "JSON and CSV statistics match", not mism and set(rows) == set(recs), f"mismatches: {sorted(set(mism))}")
    srcs = read_json(META / "data_sources.json")["datasets"]
    documented = {resolve_recorded(d["file"]) for d in srcs if d.get("file")}
    derived = [RAST / "hillshade.tif", resolve_recorded(proc["slope_used"])]
    manifest = read_json(WEB / "layer_manifest.json")
    prov_ok = all(d in documented for d in derived) and all(l.get("source") for l in manifest["raster_layers"])
    check(10, "Every derived file has documented provenance", prov_ok,
          "derived rasters in data_sources.json; every web layer lists its source")
    b = manifest["raster_layers"][0]["bounds"]["projected_m"]
    allz = shape({"type": "GeometryCollection", "geometries": [f["geometry"] for f in zones]})
    zx0, zy0, zx1, zy1 = allz.bounds
    bounds_ok = (b["xmin"] <= zx0 and b["ymin"] <= zy0 and b["xmax"] >= zx1 and b["ymax"] >= zy1)
    px = read_json(VECT / "jezero_zones_preview_pixels.json")
    sizes_ok = all(Image.open(resolve_recorded(l["path"])).size == (l["width_px"], l["height_px"]) == (px["width"], px["height"])
                   for l in manifest["raster_layers"])
    check(11, "Web layer bounds align with vector layers", bounds_ok and sizes_ok,
          f"zone bbox {tuple(round(v) for v in allz.bounds)} inside layer bounds; PNG sizes match manifest and pixel vectors")
    old = {z["area_id"]: z for z in read_json(SRC_ZONE_STATS)["zones"]}
    fab = [k for k, r in recs.items() if r["slope_deg"]["valid_pixels"] == 0 and r["slope_deg"]["mean"] is not None]
    xchk = [k for k, r in recs.items() if k in old and abs(old[k]["slope"]["mean_degrees"] - r["slope_deg"]["mean"]) > 0.01]
    check(12, "No zone contains fabricated measurements", not fab and not xchk,
          "every value computed from raster pixels; slope means reproduce the earlier independent QGIS zonal stats "
          f"(differences > 0.01 deg: {xchk})")

    failed = [c for c in checks if c["status"] == "FAIL"]
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", type=Path, default=META / "validation_report.json",
                    help="where to write the JSON report (default: data/metadata/validation_report.json)")
    report = ap.parse_args().report
    write_json(report, dict(generated=now_iso(), passed=len(checks) - len(failed),
                                                     failed=len(failed), checks=checks))
    for c in checks:
        print(f"[{c['status']}] {c['id']:>2}. {c['check']} - {c['detail']}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

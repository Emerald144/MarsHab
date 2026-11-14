"""Step 2: validate the existing slope raster, derive missing rasters, compute
per-zone terrain statistics from the CTX DEM.

Outputs
  rasters/hillshade.tif                       (new; Byte, DEFLATE)
  rasters/slope_degrees.tif                   (ONLY written if the existing slope fails validation)
  statistics/zone_terrain_statistics.json/.csv
  metadata/processing_metadata.json (slope validation + parameters)
"""
from __future__ import annotations

import csv
import math
import tempfile
from pathlib import Path

import numpy as np
from osgeo import gdal, ogr, osr
from pyproj import CRS, Geod, Transformer
from shapely import wkt as shp_wkt
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

from common import (MARS_GEOG_PROJ4, MARS_RADIUS_M, META, RAST, SRC_DEM, SRC_SLOPE,
                    SRC_ZONES, STATS, load_config, now_iso, read_json, rel, write_json)

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_PAM_ENABLED", "NO")  # keep source rasters untouched
CFG = load_config()


def read_band(path: Path):
    ds = gdal.Open(str(path))
    b = ds.GetRasterBand(1)
    arr = b.ReadAsArray().astype(np.float64)
    nd = b.GetNoDataValue()
    valid = np.isfinite(arr)
    if nd is not None:
        # float32 NoData (-3.4028235e38) must be compared at float32 precision
        valid &= arr != np.float64(np.float32(nd))
    return ds, arr, valid


# --------------------------------------------------------------------------
# 1. Slope validation: independent recomputation with GDAL (Horn 1981).
#    Horizontal unit of the CRS = metre, vertical unit of DEM = metre -> scale 1.
# --------------------------------------------------------------------------
def validate_slope(dem_ds, dem_valid):
    tmp = Path(tempfile.gettempdir()) / "terranexis_slope_check.tif"
    gdal.DEMProcessing(str(tmp), dem_ds, "slope", alg="Horn", scale=1.0,
                       slopeFormat="degree", computeEdges=False)
    _, recomputed, rvalid = read_band(tmp)
    _, existing, evalid = read_band(SRC_SLOPE)
    both = rvalid & evalid
    diff = np.abs(recomputed[both] - existing[both])
    result = dict(
        method="GDAL DEMProcessing slope, Horn (1981) 3x3, scale=1 (metre/metre), degrees",
        existing_file=rel(SRC_SLOPE),
        compared_pixels=int(both.sum()),
        existing_valid_pixels=int(evalid.sum()),
        recomputed_valid_pixels=int(rvalid.sum()),
        valid_only_in_existing=int((evalid & ~rvalid).sum()),
        valid_only_in_recomputed=int((rvalid & ~evalid).sum()),
        abs_diff_mean_deg=float(diff.mean()),
        abs_diff_p99_deg=float(np.percentile(diff, 99)),
        abs_diff_max_deg=float(diff.max()),
        existing_range_deg=[float(existing[evalid].min()), float(existing[evalid].max())],
        same_grid=True,
    )
    # pass criteria: same grid, sub-0.01 deg mean difference, physical range
    result["passed"] = bool(result["abs_diff_mean_deg"] < 0.01 and result["abs_diff_p99_deg"] < 0.1
                            and 0 <= result["existing_range_deg"][0] and result["existing_range_deg"][1] <= 90)
    if result["passed"]:
        slope_path, slope = SRC_SLOPE, existing
        slope_valid = evalid
        result["decision"] = "Existing Jezero_Slope.tif reused (units = degrees, Horn method, metre scale)."
        tmp.unlink(missing_ok=True)
    else:
        slope_path = RAST / "slope_degrees.tif"
        gdal.Translate(str(slope_path), str(tmp), creationOptions=["COMPRESS=DEFLATE", "PREDICTOR=3", "TILED=YES"])
        slope, slope_valid = recomputed, rvalid
        result["decision"] = "Existing slope failed validation; recomputed slope written to data/processed/jezero/slope_degrees.tif."
    return slope_path, slope, slope_valid, result


def make_hillshade(dem_ds) -> Path:
    out = RAST / "hillshade.tif"
    gdal.DEMProcessing(str(out), dem_ds, "hillshade", alg="Horn", azimuth=315, altitude=45,
                       zFactor=1.0, scale=1.0, computeEdges=False,
                       creationOptions=["COMPRESS=DEFLATE", "TILED=YES"])
    return out


# --------------------------------------------------------------------------
# 2. Zonal statistics
# --------------------------------------------------------------------------
def zone_mask(geom_wkt: str, gt, w, h, srs_wkt):
    """Rasterise one polygon onto the DEM grid (pixel-centre rule) within its bbox window."""
    g = ogr.CreateGeometryFromWkt(geom_wkt)
    xmin, xmax, ymin, ymax = g.GetEnvelope()
    c0 = max(0, int(math.floor((xmin - gt[0]) / gt[1])))
    c1 = min(w, int(math.ceil((xmax - gt[0]) / gt[1])))
    r0 = max(0, int(math.floor((ymax - gt[3]) / gt[5])))
    r1 = min(h, int(math.ceil((ymin - gt[3]) / gt[5])))
    if c1 <= c0 or r1 <= r0:
        return None, (0, 0, 0, 0)
    mem = gdal.GetDriverByName("MEM").Create("", c1 - c0, r1 - r0, 1, gdal.GDT_Byte)
    mem.SetGeoTransform((gt[0] + c0 * gt[1], gt[1], 0, gt[3] + r0 * gt[5], 0, gt[5]))
    mem.SetProjection(srs_wkt)
    vds = ogr.GetDriverByName("MEM").CreateDataSource("")
    sr = osr.SpatialReference(wkt=srs_wkt)
    lyr = vds.CreateLayer("z", sr, ogr.wkbMultiPolygon)
    f = ogr.Feature(lyr.GetLayerDefn()); f.SetGeometry(g); lyr.CreateFeature(f)
    gdal.RasterizeLayer(mem, [1], lyr, burn_values=[1], options=["ALL_TOUCHED=FALSE"])
    return mem.ReadAsArray().astype(bool), (r0, r1, c0, c1)


def rnd(x, n=3):
    return None if x is None else round(float(x), n)


def slope_class_pct(vals, classes):
    out = {}
    for c in classes:
        m = np.ones(vals.shape, bool)
        if c["min_exclusive"] is not None:
            m &= vals > c["min_exclusive"]
        if c["max_inclusive"] is not None:
            m &= vals <= c["max_inclusive"]
        out[c["name"]] = rnd(100.0 * m.sum() / vals.size, 3) if vals.size else None
    return out


def main():
    dem_ds, dem, dem_valid = read_band(SRC_DEM)
    gt = dem_ds.GetGeoTransform(); w, h = dem_ds.RasterXSize, dem_ds.RasterYSize
    srs_wkt = dem_ds.GetProjection()

    slope_path, slope, slope_valid, slope_check = validate_slope(dem_ds, dem_valid)
    hill = make_hillshade(dem_ds)

    proj_crs = CRS.from_wkt(srs_wkt)
    to_geog = Transformer.from_crs(proj_crs, CRS.from_proj4(MARS_GEOG_PROJ4), always_xy=True)
    geod = Geod(a=MARS_RADIUS_M, b=MARS_RADIUS_M)
    classes = CFG["slope_classes_degrees"]
    extra = CFG["extra_slope_thresholds_degrees"]
    min_cov = CFG["min_coverage_percent_for_heuristic_index"]

    zones_src = read_json(SRC_ZONES)
    raster_poly = shp_wkt.loads(
        f"POLYGON(({gt[0]} {gt[3]},{gt[0]+w*gt[1]} {gt[3]},{gt[0]+w*gt[1]} {gt[3]+h*gt[5]},"
        f"{gt[0]} {gt[3]+h*gt[5]},{gt[0]} {gt[3]}))")

    records = []
    for feat in zones_src["features"]:
        zid = feat["properties"]["area_id"]
        geom = shape(feat["geometry"])
        geog = shp_transform(lambda x, y, z=None: to_geog.transform(x, y), geom)
        area_sphere_km2 = abs(geod.geometry_area_perimeter(geog)[0]) / 1e6
        c = geom.centroid
        clon, clat = to_geog.transform(c.x, c.y)
        mask, (r0, r1, c0, c1) = zone_mask(geom.wkt, gt, w, h, srs_wkt)
        flags = []
        if mask is None or not mask.any():
            n_in = 0
            e = s = np.array([])
            flags.append("ZONE_OUTSIDE_RASTER")
        else:
            n_in = int(mask.sum())
            dv = dem_valid[r0:r1, c0:c1] & mask
            sv = slope_valid[r0:r1, c0:c1] & mask
            e = dem[r0:r1, c0:c1][dv]
            s = slope[r0:r1, c0:c1][sv]
        elev_cov = 100.0 * e.size / n_in if n_in else 0.0
        slope_cov = 100.0 * s.size / n_in if n_in else 0.0
        if not geom.within(raster_poly):
            flags.append("ZONE_EXTENDS_BEYOND_DEM_EXTENT")
        if elev_cov < 100:
            flags.append("PARTIAL_DEM_COVERAGE")
        if elev_cov < min_cov:
            flags.append("LOW_DEM_COVERAGE")

        cls = slope_class_pct(s, classes)
        f_g = (cls.get("gentle") or 0) / 100; f_m = (cls.get("moderate") or 0) / 100
        heuristic = rnd(100 * (f_g + 0.5 * f_m), 1) if s.size and slope_cov >= min_cov else None

        records.append(dict(
            zone_id=zid,
            geometry_source=rel(SRC_ZONES),
            area_km2_planar_projected=rnd(geom.area / 1e6, 3),
            area_km2_spherical=rnd(area_sphere_km2, 3),
            centroid_projected_m=[rnd(c.x, 1), rnd(c.y, 1)],
            centroid_lon_lat_deg=[rnd(clon, 6), rnd(clat, 6)],
            pixels_in_zone=n_in,
            elevation_m=dict(
                valid_pixels=int(e.size), coverage_percent=rnd(elev_cov, 3),
                min=rnd(e.min()) if e.size else None, max=rnd(e.max()) if e.size else None,
                mean=rnd(e.mean()) if e.size else None,
                median=rnd(np.median(e)) if e.size else None,
                std=rnd(e.std()) if e.size else None,
                range=rnd(e.max() - e.min()) if e.size else None),
            slope_deg=dict(
                valid_pixels=int(s.size), coverage_percent=rnd(slope_cov, 3),
                mean=rnd(s.mean()) if s.size else None, median=rnd(np.median(s)) if s.size else None,
                std=rnd(s.std()) if s.size else None, min=rnd(s.min()) if s.size else None,
                max=rnd(s.max()) if s.size else None,
                p90=rnd(np.percentile(s, 90)) if s.size else None,
                p99=rnd(np.percentile(s, 99)) if s.size else None),
            slope_class_percent=cls,
            percent_above_threshold={f"gt_{t:g}_deg": (rnd(100.0 * (s > t).sum() / s.size, 3) if s.size else None)
                                     for t in extra},
            terrain_screening=dict(
                gentle_coverage_percent=cls.get("gentle"),
                steep_coverage_percent=cls.get("steep"),
                elevation_range_m=rnd(e.max() - e.min()) if e.size else None,
                data_completeness_percent=rnd(min(elev_cov, slope_cov), 3),
                dominant_slope_class=max(cls, key=lambda k: cls[k] or -1) if s.size else None,
                heuristic_terrain_index=heuristic,
                heuristic_terrain_index_note="HEURISTIC, not validated: 100*(f_gentle + 0.5*f_moderate); null if coverage < "
                                             f"{min_cov}%"),
            data_quality_flags=flags,
            sources=dict(elevation=rel(SRC_DEM), slope=rel(slope_path), zones=rel(SRC_ZONES)),
        ))

    meta_common = dict(
        generated=now_iso(),
        crs_projected=proj_crs.to_wkt(), crs_proj4=proj_crs.to_proj4(),
        slope_classes_degrees=classes, extra_thresholds_degrees=extra,
        units=dict(elevation="metre (relative to Mars 2000 sphere datum, MOLA-tied per USGS)",
                   slope="degree", area="km2", centroid_projected="metre (Jezero_Crater_Projection)",
                   centroid_lon_lat="degree, planetocentric latitude, east-positive longitude, Mars 2000 sphere R=3396190 m"),
        zonal_method="Polygon rasterised to the 20 m DEM grid using the pixel-centre rule (ALL_TOUCHED=FALSE); "
                     "NoData pixels excluded; coverage = valid pixels / pixels inside polygon.",
        disclaimer="Slope classes are analysis categories, not validated astronaut safety thresholds. Slope at 20 m "
                   "does not measure boulders, loose regolith, sand or surface stability.",
    )
    write_json(STATS / "zone_terrain_statistics.json", dict(**meta_common, zones=records))
    write_csv(records)
    write_json(META / "processing_metadata.json", dict(
        generated=now_iso(),
        inputs=dict(dem=rel(SRC_DEM), slope=rel(SRC_SLOPE), zones=rel(SRC_ZONES)),
        slope_validation=slope_check,
        slope_used=rel(slope_path),
        hillshade=dict(file=rel(hill), method="GDAL DEMProcessing hillshade, Horn, azimuth 315, altitude 45, z=1, scale=1",
                       data_type="Byte (0 = NoData)", purpose="display only"),
        elevation_clipped="NOT created: zones lie inside the DEM; a clip would duplicate the 86 MB original. "
                          "The original DEM is referenced directly.",
        zonal=meta_common,
        config=CFG,
        software=dict(gdal=gdal.__version__, numpy=np.__version__),
    ))
    print(slope_check["decision"]); print(f"{len(records)} zones processed")


def write_csv(records):
    cols = None
    rows = []
    for r in records:
        flat = dict(zone_id=r["zone_id"], area_km2_planar_projected=r["area_km2_planar_projected"],
                    area_km2_spherical=r["area_km2_spherical"],
                    centroid_x_m=r["centroid_projected_m"][0], centroid_y_m=r["centroid_projected_m"][1],
                    centroid_lon_deg=r["centroid_lon_lat_deg"][0], centroid_lat_deg=r["centroid_lon_lat_deg"][1],
                    pixels_in_zone=r["pixels_in_zone"])
        for k, v in r["elevation_m"].items():
            flat[f"elev_{k}" + ("" if k in ("valid_pixels", "coverage_percent") else "_m")] = v
        for k, v in r["slope_deg"].items():
            flat[f"slope_{k}" + ("" if k in ("valid_pixels", "coverage_percent") else "_deg")] = v
        for k, v in r["slope_class_percent"].items():
            flat[f"pct_{k}"] = v
        for k, v in r["percent_above_threshold"].items():
            flat[f"pct_{k}"] = v
        flat["dominant_slope_class"] = r["terrain_screening"]["dominant_slope_class"]
        flat["data_completeness_percent"] = r["terrain_screening"]["data_completeness_percent"]
        flat["heuristic_terrain_index"] = r["terrain_screening"]["heuristic_terrain_index"]
        flat["data_quality_flags"] = ";".join(r["data_quality_flags"])
        flat["source_dem"] = r["sources"]["elevation"]; flat["source_slope"] = r["sources"]["slope"]
        cols = cols or list(flat)
        rows.append(flat)
    with open(STATS / "zone_terrain_statistics.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=cols)
        wr.writeheader()
        for r in rows:
            wr.writerow({k: ("" if v is None else v) for k, v in r.items()})


if __name__ == "__main__":
    main()

"""Step 1: inventory every relevant existing GIS file (read-only).

Writes metadata/existing_data_inventory.json.
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from osgeo import gdal, ogr, osr

from common import (META, ROOT, SRC_COST, SRC_DEM, SRC_QGZ, SRC_SLOPE, SRC_ZONES,
                    now_iso, read_json, rel, sha256, write_json)

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_PAM_ENABLED", "NO")  # keep source rasters untouched

SKIP_DIRS = {"node_modules", ".git", "src", "public", "backend", "scripts", "docs", "web", "metadata", ".lovable", ".venv", "venv", "dist", ".output"}
GIS_EXT = {".tif", ".tiff", ".gpkg", ".geojson", ".qgz", ".qgs", ".shp", ".zip", ".vrt",
           ".img", ".png", ".xml", ".json", ".csv", ".pdf", ".txt"}

# What we know about each file (verified from file contents / headers / USGS pages).
NOTES = {
    "data/raw/jezero/Jezero_CTX_DEM/M20_JezeroCrater_CTXDEM_20m.tif": dict(
        role="original", source="USGS Astrogeology, Mars 2020 Science Investigation CTX DEM Mosaic "
        "(filename matches the USGS-distributed product; size ~86 MB matches the published ~87 MB file)",
        phase1="REUSED - primary elevation source"),
    "data/raw/jezero/Jezero_CTX_DEM/Jezero_Slope.tif": dict(
        role="derived", source="Project-derived slope from the CTX DEM (QGIS). Validated against an "
        "independent GDAL Horn slope recomputation in process_terrain.py",
        phase1="REUSED if validation passes (see processing_metadata.json)"),
    "data/raw/jezero/Jezero_CTX_DEM/Jezero_Terrain_Cost.tif": dict(
        role="derived (prototype)", source="Project-derived reclassification of slope into cost bins "
        "1/2/4/8/100 (bins documented in Jezero_HiRISE_DEM/jezero_dataset_metadata.json)",
        phase1="NOT USED for statistics - heuristic prototype cost, not a measurement"),
    "data/raw/jezero/Jezero_CTX_DEM/Jezero_CTX_DEM.qgz": dict(
        role="QGIS project", source="Project QGIS project; references only the three rasters above "
        "(no vector/zone layers)", phase1="Inspected only"),
    "data/processed/jezero/zones_v0/jezero_final_zones.geojson": dict(
        role="derived (study zones)", source="Export of 8 project-defined study zones JZ-01..JZ-08 from "
        "Jezero_Final_Terrain_Stats.gpkg (gpkg itself is NOT present in this workspace). Folder name says "
        "HiRISE but the zones and statistics are on the CTX DEM grid/CRS",
        phase1="REUSED - zone geometry and IDs (statistics recomputed)"),
    "data/processed/jezero/zones_v0/jezero_terrain_statistics.json": dict(
        role="derived (superseded)", source="Earlier slope/cost zonal stats for JZ-01..JZ-08",
        phase1="SUPERSEDED by statistics/zone_terrain_statistics.json; used only for cross-check"),
    "data/processed/jezero/zones_v0/jezero_dataset_metadata.json": dict(
        role="metadata", source="Project metadata for the zones (CRS WKT, cost bins, limitations)",
        phase1="Used as provenance input"),
}


def raster_info(p: Path) -> dict:
    ds = gdal.Open(str(p))
    gt = ds.GetGeoTransform()
    b = ds.GetRasterBand(1)
    srs = ds.GetSpatialRef()
    w, h = ds.RasterXSize, ds.RasterYSize
    info = dict(
        driver=ds.GetDriver().ShortName, width=w, height=h, bands=ds.RasterCount,
        data_type=gdal.GetDataTypeName(b.DataType),
        pixel_size=[gt[1], gt[5]],
        extent_projected=dict(xmin=gt[0], ymax=gt[3], xmax=gt[0] + w * gt[1], ymin=gt[3] + h * gt[5]),
        nodata=b.GetNoDataValue(),
        crs_name=srs.GetName() if srs else None,
        crs_proj4=srs.ExportToProj4() if srs else None,
        linear_unit=srs.GetLinearUnitsName() if srs else None,
        compression=ds.GetMetadata("IMAGE_STRUCTURE").get("COMPRESSION"),
    )
    st = b.ComputeStatistics(False)  # exact, NoData excluded
    info["stats_exact"] = dict(min=st[0], max=st[1], mean=st[2], std=st[3])
    return info


def vector_info(p: Path) -> dict:
    ds = ogr.Open(str(p))
    layers = []
    for i in range(ds.GetLayerCount()):
        lyr = ds.GetLayerByIndex(i)
        defn = lyr.GetLayerDefn()
        srs = lyr.GetSpatialRef()
        env = lyr.GetExtent()
        layers.append(dict(
            name=lyr.GetName(), feature_count=lyr.GetFeatureCount(),
            geometry_type=ogr.GeometryTypeToName(lyr.GetGeomType()),
            fields=[defn.GetFieldDefn(j).GetName() for j in range(defn.GetFieldCount())],
            crs_name=srs.GetName() if srs else None,
            extent=dict(xmin=env[0], xmax=env[1], ymin=env[2], ymax=env[3])))
    return dict(driver=ds.GetDriver().GetName(), layers=layers)


def main() -> None:
    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            continue
        if p.suffix.lower() not in GIS_EXT and not p.name.endswith(".aux.xml"):
            continue
        if p.parent == ROOT:
            continue  # app config files (package.json, tsconfig...) are not GIS data
        r = rel(p)
        entry = dict(path=r, full_path=str(p), format=p.suffix.lower().lstrip("."),
                     size_bytes=p.stat().st_size, **NOTES.get(r, {}))
        try:
            if p.suffix.lower() in (".tif", ".tiff"):
                entry["raster"] = raster_info(p)
                entry["sha256"] = sha256(p)
            elif p.suffix.lower() in (".geojson", ".gpkg", ".shp"):
                entry["vector"] = vector_info(p)
                entry["sha256"] = sha256(p)
            elif p.suffix.lower() == ".qgz":
                with zipfile.ZipFile(p) as z:
                    entry["archive_members"] = z.namelist()
        except Exception as e:  # report, never hide
            entry["inspection_error"] = repr(e)
        files.append(entry)

    # duplicates by content hash for the CSVs that appear twice
    by_size: dict[int, list] = {}
    for f in files:
        by_size.setdefault(f["size_bytes"], []).append(f)
    dups = []
    for group in by_size.values():
        if len(group) > 1 and group[0]["size_bytes"] > 1000:
            hashes = {}
            for f in group:
                hashes.setdefault(sha256(Path(f["full_path"])), []).append(f["path"])
            dups += [v for v in hashes.values() if len(v) > 1]

    missing = []
    for name in ("Jezero_Final_Terrain_Stats.gpkg", "Jezero_CTX_DEM.zip",
                 "M20_JezeroCrater_CTXortho_mosaic_5m.tif"):
        if not list(ROOT.rglob(name)):
            missing.append(name)

    write_json(META / "existing_data_inventory.json", dict(
        generated=now_iso(), workspace=str(ROOT), files=files,
        identical_duplicates=dups, expected_but_missing=missing))
    print(f"inventoried {len(files)} files; duplicates={dups}; missing={missing}")


if __name__ == "__main__":
    main()

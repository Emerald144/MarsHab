"""Small display exports using the existing backend rasterio/numpy environment.

Run from the repo root: backend/.venv/Scripts/python.exe scripts/gis/export_map_overlays.py
Never writes to raw inputs. All previews share the existing manifest's exact extent.
"""
import csv
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.config import DATA_ROOT, ROVER_PATH  # noqa: E402
from app.data import COST_PATH, DEM_PATH, SLOPE_PATH, rover_track  # noqa: E402


def classify_constraints(dem, slope, cost):
    """0 transparent, 1 steep (>15°), 2 other routing exclusions, 3 unassessed.

    This source-resolution display classification does not change the router's
    separate request-window resampling or simulated closures.
    """
    valid = (~np.ma.getmaskarray(dem) & ~np.ma.getmaskarray(slope) & ~np.ma.getmaskarray(cost)
             & np.isfinite(dem.data) & np.isfinite(slope.data) & np.isfinite(cost.data))
    out = np.zeros(dem.shape, dtype=np.uint8)
    out[valid & (slope.data > 15)] = 1
    out[valid & ((cost.data < 1) | (cost.data >= 100) | (slope.data < 0)) & (out != 1)] = 2
    out[~valid] = 3
    return out


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def png_bytes(rgba):
    with MemoryFile() as mem:
        with mem.open(driver="PNG", width=rgba.shape[1], height=rgba.shape[0], count=4, dtype="uint8") as ds:
            ds.write(rgba.transpose(2, 0, 1))
        return mem.read()


def main():
    manifest_path = DATA_ROOT / "web/layers/layer_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    basis = next(layer for layer in manifest["raster_layers"] if layer["id"] == "terrain")
    bounds = basis["bounds"]["projected_m"]
    width, height = basis["width_px"], basis["height_px"]
    target_transform = from_bounds(bounds["xmin"], bounds["ymin"], bounds["xmax"], bounds["ymax"], width, height)
    entries = []
    with rasterio.Env(GDAL_PAM_ENABLED="NO"):
        with rasterio.open(DEM_PATH) as dem, rasterio.open(SLOPE_PATH) as slope, rasterio.open(COST_PATH) as cost:
            for source in (slope, cost):
                if source.crs != dem.crs or source.transform != dem.transform or source.shape != dem.shape:
                    raise ValueError("Refusing to align incompatible terrain rasters by assumption")
            if not np.allclose(tuple(dem.bounds), (bounds["xmin"], bounds["ymin"], bounds["xmax"], bounds["ymax"])):
                raise ValueError("Manifest extent does not match the DEM")
            classes = classify_constraints(dem.read(1, masked=True), slope.read(1, masked=True), cost.read(1, masked=True))
            small = np.zeros((height, width), dtype=np.uint8)
            reproject(classes, small, src_transform=dem.transform, src_crs=dem.crs,
                      dst_transform=target_transform, dst_crs=dem.crs, resampling=Resampling.max)
            rgba = np.zeros((height, width, 4), dtype=np.uint8)
            for code, color in ((1, (210, 50, 50, 220)), (2, (240, 180, 40, 220)), (3, (148, 163, 184, 170))):
                rgba[small == code] = color
            sources = [str(path.relative_to(ROOT)).replace("\\", "/") for path in (DEM_PATH, SLOPE_PATH, COST_PATH)]
            entry = {**basis, "id": "constraints", "name": "Terrain constraints", "path": "data/web/layers/constraints_preview.png",
                     "source": sources, "legend": {"unit": "category", "classes": [
                         {"name": "Steep terrain (>15°)", "color": "#d23232"},
                         {"name": "Other routing exclusions", "color": "#f0b428"},
                         {"name": "NoData / unassessed", "color": "#94a3b8"}]},
                     "resampling": "Maximum class over source pixels: NoData > other exclusions > steep > transparent",
                     "note": "Display-only source-resolution constraints. Steep >15°; other = cost outside [1,100) or negative slope. NoData is unassessed, not a confirmed hazard. Router uses its own resampled grid; no individual rocks or simulated closures are shown."}
            entries.append((entry, png_bytes(rgba)))

            # Reproject the actual georeferenced TIFF; never stretch the unregistered JPEG.
            ctx_path = DATA_ROOT / "jezero/jezero-ctx-mosaic.tif"
            if ctx_path.exists():
                with rasterio.open(ctx_path) as ctx:
                    if ctx.crs is None or ctx.transform.is_identity:
                        raise ValueError("CTX TIFF has no usable geographic registration")
                    gray = np.zeros((height, width), dtype=np.uint8)
                    alpha = np.zeros_like(gray)
                    reproject(rasterio.band(ctx, 1), gray, src_transform=ctx.transform, src_crs=ctx.crs,
                              src_nodata=ctx.nodata, dst_transform=target_transform, dst_crs=dem.crs,
                              dst_nodata=0, resampling=Resampling.bilinear)
                    reproject(ctx.dataset_mask(), alpha, src_transform=ctx.transform, src_crs=ctx.crs,
                              dst_transform=target_transform, dst_crs=dem.crs, resampling=Resampling.nearest)
                    if not np.any(alpha):
                        raise ValueError("CTX imagery does not overlap the real terrain extent")
                    rows, columns = np.where(alpha > 0)
                    coverage = {"x": int(columns.min()), "y": int(rows.min()),
                                "width": int(columns.max() + 1 - columns.min()), "height": int(rows.max() + 1 - rows.min())}
                    ctx_entry = {**basis, "id": "ctx", "name": "CTX imagery", "path": "data/web/layers/ctx_preview.png",
                                 "source_pixel_size_m": abs(ctx.transform.a),
                                 "coverage_preview_px": coverage,
                                 "coverage_fraction": float(np.count_nonzero(alpha) / alpha.size),
                                 "source": [str(ctx_path.relative_to(ROOT)).replace("\\", "/")],
                                 "legend": {"unit": "image intensity", "min": 0, "max": 255},
                                 "resampling": "Bilinear imagery / nearest valid-data mask, reprojected to DEM preview grid",
                                 "note": "Partial CTX coverage; transparent outside the source footprint. Original TIFF CRS/transform used, not the unregistered JPEG or viewer center coordinates.",
                                 "source_crs": ctx.crs.to_string(), "source_transform": list(ctx.transform)[:6],
                                 "source_sha256": hashlib.sha256(ctx_path.read_bytes()).hexdigest()}
                    entries.append((ctx_entry, png_bytes(np.dstack((gray, gray, gray, alpha)))))

            track = rover_track(500)
            with ROVER_PATH.open(encoding="utf-8-sig", newline="") as handle:
                first = next(row for row in csv.DictReader(handle) if row["frame"] == "ROVER" and int(row["sol"]) >= 0)
            lon, lat = transform(dem.crs, "+proj=longlat +R=3396190", [float(first["easting"])], [float(first["northing"])])
            if abs(lon[0] - float(first["longitude"])) > 1e-5 or abs(lat[0] - float(first["planetocentric_latitude"])) > 1e-5:
                raise ValueError("Rover projected CRS does not match published coordinates")
            track.update({"crs": basis["crs"], "source": str(ROVER_PATH.relative_to(ROOT)).replace("\\", "/"),
                          "note": "Historical NASA PDS rover localization records, not live tracking or science-target observations."})

    for entry, image in entries:
        for folder in (DATA_ROOT / "web/layers", ROOT / "public/jezero/layers"):
            folder.mkdir(parents=True, exist_ok=True)
            (folder / Path(entry["path"]).name).write_bytes(image)
        manifest["raster_layers"] = [layer for layer in manifest["raster_layers"] if layer["id"] != entry["id"]] + [entry]
    manifest["rover_track"] = {"path": "rover_track.json", "crs": basis["crs"], "source": track["source"]}
    for path in (manifest_path, ROOT / "public/jezero/layer_manifest.json"):
        write_json(path, manifest)
    for path in (DATA_ROOT / "web/rover/rover_track.json", ROOT / "public/jezero/rover_track.json"):
        write_json(path, track)
    source_path = DATA_ROOT / "metadata/data_sources.json"
    sources = json.loads(source_path.read_text(encoding="utf-8"))
    rover_record = {"id": "map_display_rover_track", "role": "derived display asset", "file": "data/web/rover/rover_track.json",
                    "sources": [track["source"]], "crs": track["crs"],
                    "processing": "Existing backend rover_track(500) stride sampling; first retained coordinate checked against published Mars longitude/latitude",
                    "limitations": track["note"]}
    sources["datasets"] = [item for item in sources["datasets"] if item["id"] != rover_record["id"]] + [rover_record]
    for entry, _image in entries:
        record = {"id": "map_display_" + entry["id"], "role": "derived display asset", "file": entry["path"],
                  "sources": entry["source"], "crs": entry["crs"], "processing": entry["resampling"], "limitations": entry["note"]}
        sources["datasets"] = [item for item in sources["datasets"] if item["id"] != record["id"]] + [record]
    write_json(source_path, sources)
    print(f"Exported {len(entries)} aligned RGBA layers at {width}x{height}; {len(track['points'])} historical rover positions")


if __name__ == "__main__":
    main()

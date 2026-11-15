"""Regression checks for aligned display exports; no routing settings are changed."""
import importlib.util
import json
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("map_export", ROOT / "scripts/gis/export_map_overlays.py")
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


def test_constraints_keep_documented_thresholds_and_distinguish_unknown():
    dem = np.ma.array(np.zeros((1, 6)), mask=[[False, False, False, False, False, True]])
    slope = np.ma.array([[5, 15, 15.1, -1, 5, 0]], mask=False)
    cost = np.ma.array([[1, 99, 100, 1, 100, 1]], mask=False)
    assert export.classify_constraints(dem, slope, cost).tolist() == [[0, 0, 1, 2, 2, 3]]
    dem = np.ma.array([[float("nan")]], mask=False)
    assert export.classify_constraints(dem, np.ma.array([[0]]), np.ma.array([[1]])).item() == 3


def test_registered_exports_match_real_canvas_and_preserve_alpha():
    manifest = json.loads((ROOT / "public/jezero/layer_manifest.json").read_text())
    basis = next(layer for layer in manifest["raster_layers"] if layer["id"] == "terrain")
    for name in ("ctx", "constraints"):
        layer = next(layer for layer in manifest["raster_layers"] if layer["id"] == name)
        assert layer["bounds"] == basis["bounds"]
        assert layer["crs"] == basis["crs"]
        path = ROOT / f"public/jezero/layers/{name}_preview.png"
        assert path.read_bytes() == (ROOT / f"data/web/layers/{name}_preview.png").read_bytes()
        with rasterio.open(path) as image:
            assert (image.width, image.height) == (basis["width_px"], basis["height_px"])
            assert image.count == 4
            alpha = image.read(4)
            assert np.any(alpha == 0)
            assert np.any(alpha > 0)
    ctx = next(layer for layer in manifest["raster_layers"] if layer["id"] == "ctx")
    assert ctx["source_pixel_size_m"] == 6
    assert ctx["source_crs"] == "ESRI:103885"
    assert "Partial CTX coverage" in ctx["note"]
    with rasterio.open(ROOT / "public/jezero/layers/ctx_preview.png") as image:
        rows, columns = np.where(image.read(4) > 0)
        assert ctx["coverage_preview_px"] == {"x": int(columns.min()), "y": int(rows.min()),
            "width": int(columns.max() + 1 - columns.min()), "height": int(rows.max() + 1 - rows.min())}
        assert 0 < ctx["coverage_fraction"] < 1


def test_rover_display_uses_verified_backend_records():
    from app.data import rover_track
    track = json.loads((ROOT / "public/jezero/rover_track.json").read_text())
    assert track["points"] == rover_track(500)["points"]
    assert track["points"][0]["sol"] == 0
    assert track["crs"] == "Jezero_Crater_Projection"
    assert "best_interp.csv" in track["source"]

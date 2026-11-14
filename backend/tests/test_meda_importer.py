"""Tests for scripts/gis/prepare_meda.py (MEDA importer).

Importer behaviour is tested on a tiny SYNTHETIC data root built in a temp directory (clearly
fake values, never written under data/). One test also re-runs the importer on the real PDS
products and requires the committed processed outputs to be reproduced byte-for-byte.
"""

import csv
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "gis" / "prepare_meda.py"
_spec = importlib.util.spec_from_file_location("prepare_meda", SCRIPT)
prepare_meda = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prepare_meda)

LABEL = """<?xml version="1.0" encoding="UTF-8"?>
<Product_Observational xmlns="http://pds.nasa.gov/pds4/pds/v1">
  <Observation_Area><Time_Coordinates>
    <start_date_time>2021-03-27T04:00:00.000Z</start_date_time>
    <stop_date_time>2021-03-27T04:10:00.006Z</stop_date_time>
  </Time_Coordinates></Observation_Area>
</Product_Observational>
"""

PRODUCTS = [
    ("ATS", "calibrated", "CAL_ATS", "P01"),
    ("PS", "derived", "DER_PS", "P01"),
    ("WS", "derived", "DER_WS", "P02"),
    ("RHS", "derived", "DER_RHS", "P03"),
    ("ANCILLARY", "derived", "DER_ANCILLARY", "P03"),
]


def _write_csv(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def build_root(tmp_path, *, places_offset=(0.0, 0.0), drop_column=None):
    """Synthetic MEDA data root (sol 36). Values are fake and exist only for these tests."""

    root = tmp_path / "data"
    (root / "metadata").mkdir(parents=True)
    shutil.copy(REPO / "data" / "metadata" / "meda_import_mapping.json", root / "metadata" / "meda_import_mapping.json")

    ats_header = ["SCLK", "LMST", "LTST"] + [f"ATS_LOCAL_TEMP{i}" for i in range(1, 6)]
    if drop_column:
        ats_header.remove(drop_column)
    ats_rows = [
        [900.0, "00036M00:00:00.000", "0035 23:00:00", 200, 201, 202, 203, 204],
        [950.0, "00036M00:00:50.000", "0035 23:00:50", 200.5, "999999999", 5, "", 204.5],
        [1200.0, "00036M00:05:00.000", "0036 00:05:00", 210, 211, 212, 213, 214],
        [1250.0, "garbage", "x", 1, 1, 1, 1, 1],
        [1500.0, "00036M00:10:00.000", "0036 00:10:00", 220, 221, 222, 223, 224],
    ]
    if drop_column:
        drop = ["SCLK", "LMST", "LTST"] + [f"ATS_LOCAL_TEMP{i}" for i in range(1, 6)]
        keep = [i for i, name in enumerate(drop) if name != drop_column]
        ats_rows = [[row[i] for i in keep] for row in ats_rows]
    tables = {
        "ATS": (ats_header, ats_rows),
        "PS": (["SCLK", "LMST", "LTST", "PRESSURE", "PRESSURE_UNCERTAINTY", "TRANSDUCER"], [
            [900.0, "00036M00:00:00.000", "t", 740, 0.5, 1],
            [1200.0, "00036M00:05:00.000", "t", "999999999", "", 1],
            [1500.0, "00036M00:10:00.000", "t", 5000, "", 1],
        ]),
        "WS": (["SCLK", "LMST", "LTST", "HORIZONTAL_WIND_SPEED", "HORIZONTAL_WIND_SPEED_UNCERTAINTY",
                "VERTICAL_WIND_SPEED", "VERTICAL_WIND_SPEED_UNCERTAINTY", "WIND_DIRECTION",
                "WIND_DIRECTION_UNCERTAINTY", "BOTH_BOOMS_USED_FOR_RETRIEVAL", "ROVER_STILL"], [
            [900.0, "00036M00:00:00.000", "t", "999999999", "", "", "", "999999999", "", "", 1],
            [1200.0, "00036M00:05:00.000", "t", 3.5, 0.2, "", "", 120, 5, 1, 1],
            [1500.0, "00036M00:10:00.000", "t", 4.0, 0.2, "", "", 130, 5, 1, 1],
        ]),
        "RHS": (["SCLK", "LMST", "LTST", "LOCAL_RELATIVE_HUMIDITY", "LOCAL_RELATIVE_HUMIDITY_UNCERTAINTY"], [
            [900.0, "00036M00:00:00.000", "t", 55.0, 1],
            [1200.0, "00036M00:05:00.000", "t", "", ""],
            [1500.0, "00036M00:10:00.000", "t", "999999999", ""],
        ]),
        "ANCILLARY": (["SCLK", "LMST", "LTST", "ROVER_POSITION_X", "ROVER_POSITION_Y", "ROVER_POSITION_Z"],
                      [[s, "00036M00:00:00.000", "t", 13.94, -7.63, 0.5] for s in (900.0, 950.0, 1200.0, 1250.0, 1500.0)]),
    }
    manifest = []
    for instrument, level, token, version in PRODUCTS:
        stem = f"WE__0036___________{token}".ljust(43, "_") + version
        header, rows = tables[instrument]
        _write_csv(root / "raw" / "meda" / "products" / f"{stem}.csv", header, rows)
        (root / "raw" / "meda" / "labels").mkdir(parents=True, exist_ok=True)
        (root / "raw" / "meda" / "labels" / f"{stem}.xml").write_text(LABEL, encoding="utf-8")
        manifest.append({
            "product_id": stem, "instrument": instrument, "processing_level": level, "sol": 36, "version": version,
            "local_path": f"raw/meda/products/{stem}.csv", "label_file": f"raw/meda/labels/{stem}.xml",
            "official_sha256": "fixture",
        })
    (root / "metadata" / "meda_products.json").write_text(json.dumps({"products": manifest}), encoding="utf-8")

    places = root / "raw" / "jezero" / "Martian_Map_Rover_Files" / "Martian_Map_Rover_Files" / "best_interp.csv"
    _write_csv(places, ["frame", "site", "drive", "pose", "northing", "easting", "sclk", "sol"], [
        ["SITE", 1, -1, -1, 1000000.0, 2000000.0, 0, -1],
        ["ROVER", 3, 1392, -1, 1000013.96 + places_offset[1], 2000007.64 + places_offset[0], 100, 34],
    ])
    zones = root / "web" / "zones" / "jezero_zones.geojson"
    zones.parent.mkdir(parents=True)
    square = [[1999900, 999900], [2000100, 999900], [2000100, 1000100], [1999900, 1000100], [1999900, 999900]]
    zones.write_text(json.dumps({"features": [{
        "id": "JZ-TEST", "geometry": {"type": "MultiPolygon", "coordinates": [[square]]},
    }]}), encoding="utf-8")
    return root


def _run(root, tmp_path):
    return prepare_meda.run_import(root, tmp_path / "out")


def _rows(result):
    return list(csv.DictReader(result["csv_text"].splitlines()))


def _group(result, metric):
    return next(g for g in result["summary"]["groups_by_sol"] if g["metric"] == metric)


def test_invalid_values_are_excluded_and_counted_never_replaced(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    ats2 = _group(result, "air_temperature.ats2")
    assert ats2["sample_count"] == 3 and ats2["exclusion_counts"] == {"bad_time": 1, "invalid_fill_value": 1}
    ats3 = _group(result, "air_temperature.ats3")
    assert ats3["exclusion_counts"]["outside_valid_range"] == 1  # 5 K is not a plausible air temperature
    assert _group(result, "air_temperature.ats4")["exclusion_counts"]["empty_or_non_numeric"] == 1
    pressure = _group(result, "pressure")
    assert pressure["sample_count"] == 1
    assert pressure["exclusion_counts"] == {"invalid_fill_value": 1, "outside_valid_range": 1}
    wind = _group(result, "wind_speed.horizontal")
    assert wind["sample_count"] == 2 and wind["exclusion_counts"] == {"invalid_fill_value": 1}
    assert all("999999999" not in row["value"] for row in _rows(result))


def test_decimation_keeps_first_native_sample_per_bin_without_averaging(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    ats1 = [r for r in _rows(result) if r["metric"] == "air_temperature.ats1"]
    assert [r["value"] for r in ats1] == ["200", "210", "220"]  # 200.5 (same 300 s bin as 200) is not kept
    group = _group(result, "air_temperature.ats1")
    assert group["sample_count"] == 4  # aggregates use ALL valid samples
    assert group["mean"] == 207.625 and group["minimum"] == 200 and group["maximum"] == 220
    assert result["summary"]["observation_count"] == len(_rows(result))


def test_sol_comes_from_lmst_and_time_fields_are_preserved(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    row = next(r for r in _rows(result) if r["metric"] == "pressure")
    assert row["sol"] == "36" and row["lmst"] == "00036M00:00:00.000" and row["ltst"] == "t"
    assert row["unit"] == "Pa" and row["uncertainty"] == "0.5" and row["quality_flag"] == "transducer=1"
    assert row["utc_basis"] == "derived_from_pds_label_linear" and row["is_current"] == "false"
    assert row["observation_type"] == "historical_rover_measurement"


def test_utc_is_a_two_point_label_mapping(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    by_sclk = {r["sclk"]: r["utc_time"] for r in _rows(result) if r["metric"] == "air_temperature.ats1"}
    assert by_sclk["900"] == "2021-03-27T04:00:00.000Z"
    assert by_sclk["1200"] == "2021-03-27T04:05:00.003Z"  # 300 s * 600.006/600
    assert by_sclk["1500"] == "2021-03-27T04:10:00.006Z"


def test_rover_location_is_validated_against_places_and_zone_is_derived(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    location = result["summary"]["rover_location_by_sol"][0]
    assert location["status"] == "validated" and location["distance_to_places_m"] < 0.05
    assert location["places_poses_within_sol"] == 0 and location["position_changes_in_sol"] is False
    row = next(r for r in _rows(result) if r["metric"] == "pressure")
    assert row["location_status"] == "validated"
    assert float(row["rover_easting_m"]) == pytest.approx(2000007.63)  # landing easting minus Y (+Y is west)
    assert float(row["rover_northing_m"]) == pytest.approx(1000013.94)
    assert row["jz_zone_id"] == "JZ-TEST"


def test_location_is_withheld_when_it_disagrees_with_places(tmp_path):
    result = _run(build_root(tmp_path, places_offset=(50.0, 0.0)), tmp_path)
    location = result["summary"]["rover_location_by_sol"][0]
    assert location["status"] == "unvalidated" and "withheld" in location["reason"]
    for row in _rows(result):
        assert row["location_status"] == "unvalidated"
        assert row["rover_easting_m"] == "" and row["rover_northing_m"] == "" and row["jz_zone_id"] == ""


def test_humidity_is_excluded_by_policy_and_reported(tmp_path):
    result = _run(build_root(tmp_path), tmp_path)
    assert not any("humidity" in r["metric"] for r in _rows(result))
    product = next(p for p in result["summary"]["products"] if p["instrument"] == "RHS")
    assert product["status"] == "excluded_by_policy" and product["rows_published"] == 0
    assert product["valid_native_values_not_published"] == 1  # 55.0; the fill value is not counted
    assert result["summary"]["excluded_metrics"][0]["metric"] == "relative_humidity"


def test_importer_is_deterministic_and_idempotent(tmp_path):
    root = build_root(tmp_path)
    first, second = _run(root, tmp_path), _run(root, tmp_path)
    assert first["csv_text"] == second["csv_text"]
    assert first["summary_text"] == second["summary_text"]
    assert "generated" not in first["summary_text"].lower()  # no wall-clock timestamps in outputs


def test_missing_mapped_column_fails_clearly(tmp_path):
    root = build_root(tmp_path, drop_column="ATS_LOCAL_TEMP3")
    with pytest.raises(prepare_meda.ImportError_, match="missing mapped columns: ATS_LOCAL_TEMP3"):
        _run(root, tmp_path)


def test_missing_product_file_fails_clearly(tmp_path):
    root = build_root(tmp_path)
    next((root / "raw" / "meda" / "products").glob("*DER_PS*")).unlink()
    with pytest.raises(prepare_meda.ImportError_, match="product file is missing"):
        _run(root, tmp_path)


def test_cli_check_mode_detects_drift(tmp_path, capsys):
    root = build_root(tmp_path)
    out = tmp_path / "out"
    assert prepare_meda.main(["--data-root", str(root), "--output-dir", str(out)]) == 0
    assert prepare_meda.main(["--data-root", str(root), "--output-dir", str(out), "--check"]) == 0
    (out / "meda_observations.csv").write_text("tampered\n", encoding="utf-8")
    assert prepare_meda.main(["--data-root", str(root), "--output-dir", str(out), "--check"]) == 1


REAL_PRODUCTS = (REPO / "data" / "metadata" / "meda_products.json").exists()
REAL_OUTPUT = REPO / "data" / "processed" / "environment" / "meda_observations.csv"


@pytest.mark.skipif(not (REAL_PRODUCTS and REAL_OUTPUT.exists()), reason="real MEDA products/outputs not present")
def test_real_pds_import_reproduces_committed_outputs_exactly(tmp_path):
    data_root = REPO / "data"
    result = prepare_meda.run_import(data_root, tmp_path / "out")
    assert result["csv_text"] == REAL_OUTPUT.read_text(encoding="utf-8")
    assert result["summary_text"] == (REPO / "data" / "processed" / "environment" / "meda_sol_summary.json").read_text(encoding="utf-8")
    summary = result["summary"]
    assert summary["coverage"]["sols"] == [36, 37, 38, 39]
    assert all(p["status"] in ("imported", "excluded_by_policy") for p in summary["products"])
    assert all(loc["status"] == "validated" for loc in summary["rover_location_by_sol"])

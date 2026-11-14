"""API tests for the historical environment router.

Fixture tests use synthetic data in a temp dir. Real-data tests run against the committed
processed MEDA files and are skipped (and reported as skipped) if those files are absent.
"""

import csv
import json

import pytest
from fastapi import FastAPI

from app import environment_data as env
from app.environment_api import router
from app.main import app as main_app

from asgi_client import get

REAL_DATA = env.OBSERVATIONS_PATH.exists() and env.SUMMARY_PATH.exists()
needs_real = pytest.mark.skipif(not REAL_DATA, reason="processed MEDA files are not present")


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(env, "OBSERVATIONS_PATH", tmp_path / "meda_observations.csv")
    monkeypatch.setattr(env, "SUMMARY_PATH", tmp_path / "meda_sol_summary.json")
    monkeypatch.setattr(env, "METADATA_PATH", tmp_path / "meda_sources.json")
    monkeypatch.setattr(env, "PRODUCTS_PATH", tmp_path / "meda_products.json")
    env.clear_cache()
    app = FastAPI()
    app.include_router(router)
    yield app, tmp_path
    env.clear_cache()


def _write_rows(tmp_path, rows):
    fields = env.OBSERVATION_FIELDS
    with (tmp_path / "meda_observations.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for values in rows:
            row = {f: "" for f in fields}
            row.update(values)
            writer.writerow(row)
    env.clear_cache()


# ------------------------------------------------------------------ registration
def test_environment_router_is_registered_with_the_main_app():
    paths = set(main_app.openapi()["paths"])
    for suffix in ("observations", "summary", "availability", "metadata"):
        assert f"/api/v1/environment/{suffix}" in paths


def test_existing_api_endpoints_are_still_registered():
    paths = set(main_app.openapi()["paths"])
    for path in (
        "/api/v1/health", "/api/v1/datasets", "/api/v1/zones", "/api/v1/terrain/point",
        "/api/v1/rover/track", "/api/v1/weather/summary", "/api/v1/routes",
        "/api/v1/jezero/zones", "/api/v1/jezero/base", "/api/v1/missions/plan",
        "/api/v1/missions/emergency-return",
    ):
        assert path in paths


# --------------------------------------------------------------------- honest empty
def test_empty_dataset_returns_explicit_unavailable_not_errors_or_samples(isolated):
    app, _ = isolated
    for url in ("/api/v1/environment/observations", "/api/v1/environment/summary", "/api/v1/environment/availability"):
        status, body = get(app, url)
        assert status == 200
        assert body["data_label"]["is_current"] is False
        assert body.get("observations", []) == [] and body.get("groups", []) == []
    _, availability = get(app, "/api/v1/environment/availability")
    assert availability["available"] is False and availability["status"] == "unavailable"
    status, metadata = get(app, "/api/v1/environment/metadata")
    assert status == 200 and metadata["available"] is False


# ---------------------------------------------------------------- fixture contract
def test_observations_contract_pagination_and_validation(isolated):
    app, tmp = isolated
    _write_rows(tmp, [
        {"sol": "36", "sclk": "1", "utc_time": "2021-03-27T04:00:00.000Z", "metric": "pressure", "value": "740", "unit": "Pa", "quality": "unflagged"},
        {"sol": "36", "sclk": "2", "utc_time": "2021-03-27T04:05:00.000Z", "metric": "pressure", "value": "741", "unit": "Pa", "quality": "unflagged"},
    ])
    status, body = get(app, "/api/v1/environment/observations?metric=pressure&limit=1")
    assert status == 200 and body["total"] == 2 and body["next_offset"] == 1
    assert body["observations"][0]["value"] == 740 and body["observations"][0]["is_current"] is False
    assert body["data_label"]["label"] == "Historical Rover Observation"
    status, page2 = get(app, "/api/v1/environment/observations?metric=pressure&limit=1&offset=1")
    assert page2["observations"][0]["value"] == 741 and page2["next_offset"] is None
    assert get(app, "/api/v1/environment/observations?start=not-a-time")[0] == 422
    assert get(app, "/api/v1/environment/observations?start=2021-03-27T04:00:00")[0] == 422  # no timezone
    assert get(app, "/api/v1/environment/observations?limit=0")[0] == 422
    assert get(app, "/api/v1/environment/observations?limit=1001")[0] == 422
    assert get(app, "/api/v1/environment/observations?metric=bad/metric")[0] in (404, 422)
    assert get(app, "/api/v1/environment/summary?by=zone")[0] == 400


def test_unreadable_dataset_is_a_503_with_a_reason(isolated):
    app, tmp = isolated
    (tmp / "meda_observations.csv").write_text("metric,value\npressure,1\n", encoding="utf-8")
    env.clear_cache()
    status, body = get(app, "/api/v1/environment/observations")
    assert status == 503 and "unavailable" in body["detail"]


# ------------------------------------------------------------------ real MEDA data
@needs_real
def test_real_meda_data_is_served_with_units_provenance_and_no_current_flag():
    env.clear_cache()
    status, body = get(main_app, "/api/v1/environment/observations?metric=pressure&limit=5")
    assert status == 200 and body["total"] > 100
    first = body["observations"][0]
    assert first["unit"] == "Pa" and first["is_current"] is False
    assert first["source_product_id"].startswith("WE__00") and "DER_PS" in first["source_product_id"]
    assert first["lmst"].startswith("000") and first["utc_time"].endswith("Z")
    assert 100 <= first["value"] <= 1500
    assert first["rover_location"]["status"] == "validated" and first["jz_zone_id"]
    assert body["provenance"]["archive_identifier"] == "urn:nasa:pds:mars2020_meda"
    assert body["provenance"]["verified_products"], "verified product list must accompany the data"


@needs_real
def test_real_meda_summary_and_availability_are_consistent():
    status, summary = get(main_app, "/api/v1/environment/summary?metric=pressure")
    assert status == 200 and summary["available"] and summary["record_type"] == "derived_aggregate"
    assert {g["sol"] for g in summary["groups"]} == {36, 37, 38, 39}
    for group in summary["groups"]:
        assert group["minimum"] <= group["mean"] <= group["maximum"]
        assert group["sample_count"] > 1000 and group["unit"] == "Pa"
    status, availability = get(main_app, "/api/v1/environment/availability")
    assert status == 200 and availability["available"] is True
    assert availability["coverage"]["sols"] == [36, 37, 38, 39]
    assert availability["quality_counts"] == {"unflagged": availability["observation_count"]}
    excluded = {m["metric"] for m in availability["missing_data"]["excluded_metrics"]}
    assert "relative_humidity" in excluded  # unreliable before sol 63 per the PDS readme
    assert all(r["status"] == "validated" for r in availability["rover_location_by_sol"])


@needs_real
def test_real_meda_rows_match_the_source_csv_for_a_sample():
    """Spot-check: a served pressure value must equal the value in the official PDS CSV."""

    status, body = get(main_app, "/api/v1/environment/observations?metric=pressure&sol=36&limit=3")
    assert status == 200
    product = env.DATA_ROOT / "raw" / "jezero" / "Jezero_Weather_" / "MEDA Weather Data" / "MEDA_PS_Sol36-39" / (
        "WE__0036___________DER_PS__________________P01.csv"
    )
    if not product.exists():
        pytest.skip("source product not present")
    with product.open(newline="", encoding="utf-8") as handle:
        source = {row["SCLK"].strip(): row for row in csv.DictReader(handle)}
    for observation in body["observations"]:
        key = f"{observation['sclk']:.0f}" if float(observation["sclk"]).is_integer() else str(observation["sclk"])
        assert key in source, key
        assert float(source[key]["PRESSURE"]) == observation["value"]
        assert source[key]["LMST"].strip() == observation["lmst"]

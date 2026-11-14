"""Unit tests for backend/app/environment_data.py.

All rows here are synthetic test fixtures in a temporary directory; they are never written
to data/ and never presented as NASA measurements.
"""

import csv
import json

import pytest

from app import environment_data as env

FIELDS = env.OBSERVATION_FIELDS


def _row(**overrides):
    row = {field: "" for field in FIELDS}
    row.update({
        "source": "fixture", "source_product_id": "FIXTURE-1", "processing_level": "derived",
        "observation_type": "historical_rover_measurement", "sol": "36", "sclk": "100",
        "utc_time": "2021-03-27T04:00:00.000Z", "utc_basis": "derived_from_pds_label_linear",
        "lmst": "00036M00:00:00.000", "ltst": "0035 23:00:00", "metric": "pressure", "value": "740",
        "unit": "Pa", "quality": "unflagged", "source_field": "PRESSURE",
        "location_status": "unavailable", "is_current": "false",
    })
    row.update(overrides)
    return row


@pytest.fixture
def paths(tmp_path, monkeypatch):
    """Point the module at an isolated directory; returns (writer, tmp_path)."""

    obs = tmp_path / "meda_observations.csv"
    monkeypatch.setattr(env, "OBSERVATIONS_PATH", obs)
    monkeypatch.setattr(env, "SUMMARY_PATH", tmp_path / "meda_sol_summary.json")
    monkeypatch.setattr(env, "METADATA_PATH", tmp_path / "meda_sources.json")
    monkeypatch.setattr(env, "PRODUCTS_PATH", tmp_path / "meda_products.json")
    env.clear_cache()

    def write(rows, clear=True):
        with obs.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        if clear:
            env.clear_cache()

    yield write, tmp_path
    env.clear_cache()


def test_missing_files_are_explicitly_unavailable(paths):
    _, tmp = paths  # nothing written
    result = env.query_observations()
    assert result["observations"] == []
    assert result["data_available"] is False and result["status"] == "unavailable"
    assert result["data_label"]["is_current"] is False
    assert env.summarize_by_sol()["available"] is False
    availability = env.availability()
    assert availability["available"] is False and "prepare_meda" in availability["reason"]
    assert env.load_metadata()["available"] is False


def test_header_only_csv_is_unavailable_not_an_error(paths):
    write, _ = paths
    write([])
    assert env.query_observations()["status"] == "unavailable"
    assert env.availability()["available"] is False


def test_query_orders_filters_family_sol_and_paginates(paths):
    write, _ = paths
    write([
        _row(sol="37", sclk="300", utc_time="2021-03-28T04:00:00.000Z", value="710"),
        _row(sol="36", sclk="100", utc_time="2021-03-27T04:00:00.000Z", value="700"),
        _row(sol="36", sclk="100", utc_time="2021-03-27T04:00:00.000Z", metric="air_temperature.ats1", value="210", unit="K"),
        _row(sol="36", sclk="200", utc_time="2021-03-27T05:00:00.000Z", metric="air_temperature.ats2", value="211", unit="K"),
    ])
    first = env.query_observations(metric="pressure", limit=1)
    assert first["total"] == 2 and first["observations"][0]["sol"] == 36
    assert first["next_offset"] == 1
    second = env.query_observations(metric="pressure", limit=1, offset=1)
    assert second["observations"][0]["sol"] == 37 and second["next_offset"] is None
    # a family prefix selects every channel; an exact id selects one
    assert env.query_observations(metric="air_temperature")["total"] == 2
    assert env.query_observations(metric="air_temperature.ats2")["total"] == 1
    assert env.query_observations(sol=37)["total"] == 1
    window = env.query_observations(start="2021-03-28T00:00:00Z", end="2021-03-28T23:59:59Z")
    assert window["total"] == 1
    assert env.query_observations(metric="humidity")["status"] == "empty_selection"


def test_invalid_rows_are_not_exposed_and_current_flag_is_forced_false(paths):
    write, _ = paths
    write([
        _row(value="not-a-number"),
        _row(metric=""),
        _row(value="nan"),
        _row(value="741", is_current="true"),
    ])
    result = env.query_observations()
    assert result["total"] == 1
    assert result["observations"][0]["is_current"] is False


def test_location_is_only_reported_when_validated(paths):
    write, _ = paths
    write([
        _row(sclk="1", location_status="validated", rover_easting_m="4354501.716", rover_northing_m="1093313.635",
             rover_site_x_north_m="13.94", rover_site_y_west_m="-7.63", jz_zone_id="JZ-06"),
        _row(sclk="2"),
    ])
    rows = env.query_observations()["observations"]
    assert rows[0]["rover_location"]["status"] == "validated"
    assert rows[0]["rover_location"]["easting_m"] == 4354501.716
    assert rows[0]["jz_zone_id"] == "JZ-06"
    assert rows[1]["rover_location"] == {"status": "unavailable"}
    assert rows[1]["jz_zone_id"] is None


def test_time_metric_and_limit_validation(paths):
    write, _ = paths
    write([])
    with pytest.raises(ValueError, match="timezone"):
        env.query_observations(start="2021-05-01T00:00:00")
    with pytest.raises(ValueError, match="ISO-8601"):
        env.query_observations(end="yesterday")
    with pytest.raises(ValueError, match="metric"):
        env.query_observations(metric="pressure/invalid")
    with pytest.raises(ValueError, match="limit"):
        env.query_observations(limit=env.MAX_LIMIT + 1)
    with pytest.raises(ValueError, match="offset"):
        env.query_observations(offset=-1)
    with pytest.raises(ValueError, match="earlier"):
        env.query_observations(start="2021-05-02T00:00:00Z", end="2021-05-01T00:00:00Z")


def test_malformed_csv_raises_a_clear_error(paths):
    _, tmp = paths
    (tmp / "meda_observations.csv").write_text("metric,value\npressure,700\n", encoding="utf-8")
    env.clear_cache()
    with pytest.raises(env.EnvironmentDataError, match="schema columns"):
        env.query_observations()


def test_summary_prefers_importer_aggregates_and_labels_basis(paths):
    write, tmp = paths
    write([_row(value="1")])
    summary = {
        "available": True,
        "groups_by_sol": [
            {"sol": 36, "metric": "pressure", "unit": "Pa", "sample_count": 1000, "minimum": 730.0, "maximum": 750.0, "mean": 740.0},
            {"sol": 36, "metric": "air_temperature.ats1", "unit": "K", "sample_count": 5, "minimum": 1.0, "maximum": 3.0, "mean": 2.0},
        ],
    }
    (tmp / "meda_sol_summary.json").write_text(json.dumps(summary), encoding="utf-8")
    env.clear_cache()
    result = env.summarize_by_sol(metric="pressure")
    assert result["record_type"] == "derived_aggregate"
    assert result["basis"].startswith("all valid native samples")
    assert [g["metric"] for g in result["groups"]] == ["pressure"]
    assert result["groups"][0]["sample_count"] == 1000


def test_summary_fallback_from_rows_excludes_bad_quality(paths):
    write, _ = paths
    write([
        _row(value="700", quality="unflagged"),
        _row(value="710", quality="unflagged"),
        _row(value="900", quality="bad"),
    ])
    group = env.summarize_by_sol("pressure")["groups"][0]
    assert group["row_count"] == 3 and group["sample_count"] == 2 and group["mean"] == 705
    assert env.summarize_by_sol("pressure")["basis"].startswith("decimated observation rows")


def test_availability_reports_coverage_quality_and_location_counts(paths):
    write, _ = paths
    write([
        _row(sclk="1", utc_time="2021-03-27T04:00:00.000Z"),
        _row(sclk="2", utc_time="2021-03-27T05:00:00.000Z", location_status="validated", rover_easting_m="1", rover_northing_m="2"),
    ])
    result = env.availability()
    assert result["available"] is True and result["observation_count"] == 2
    assert result["coverage"]["sols"] == [36]
    assert result["coverage"]["utc_start"] == "2021-03-27T04:00:00.000Z"
    assert result["quality_counts"] == {"unflagged": 2}
    assert result["location_status_counts"] == {"unavailable": 1, "validated": 1}


def test_cache_is_refreshed_when_the_file_changes(paths):
    write, _ = paths
    write([_row(value="700")])
    assert env.query_observations()["total"] == 1
    write([_row(value="700"), _row(value="701", sclk="5")], clear=False)  # no manual cache reset
    assert env.query_observations()["total"] == 2

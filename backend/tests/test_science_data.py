from app.science_data import sources, targets


def test_sources_have_ids_and_mars_crs():
    records = sources()
    assert records
    assert records[0]["id"] == "usgs-sim-3464"
    assert records[0]["coordinate_reference_system"]["body"] == "Mars"


def test_empty_catalog_is_safe_and_has_no_waypoints():
    assert targets() == []

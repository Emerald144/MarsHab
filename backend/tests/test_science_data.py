from app.science_data import find_target, sources, targets


def test_sources_have_ids_and_mars_crs():
    records = sources()
    assert records
    assert records[0]["id"] == "usgs-sim-3464"
    assert records[0]["coordinate_reference_system"]["body"] == "Mars"
    places_source = next(r for r in records if r["id"] == "nasa-pds-mars2020-rover-places")
    assert places_source["coordinate_reference_system"]["body"] == "Mars"


def test_catalog_has_exactly_one_route_eligible_verified_waypoint():
    records = targets()
    assert len(records) == 1
    record = records[0]
    assert record["route_waypoint_eligible"] is True
    assert record["location"]["location_verified"] is True
    assert record["evidence_level"] == "verified_observation_site"
    assert record["kind"] == "rover_observation"


def test_route_eligible_record_has_no_invented_coordinates():
    record = find_target("m2020-places-site08-cache-depot")
    assert record is not None
    location = record["location"]
    assert location["x_m"] is not None and location["y_m"] is not None
    assert location["crs"] == "Jezero_Crater_Projection"
    # Verified against the PDS PLACES source CSV directly (best_interp.csv line 1814).
    assert abs(location["x_m"] - 4354051.81) < 1
    assert abs(location["y_m"] - 1092667.644) < 1


def test_unknown_target_id_returns_none():
    assert find_target("does-not-exist") is None

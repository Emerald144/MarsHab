from app import zones, missions
from app.models import EmergencyReturnRequest, MissionPlanRequest, Point

def test_base_location_is_rover_sol_zero():
    base = zones.base_location()
    assert base["label"] == "Perseverance rover landing site (Sol 0)"
    assert abs(base["easting"] - 4354494.086) < 1
    assert abs(base["northing"] - 1093299.695) < 1

def test_all_eight_jezero_zones_present_with_real_elevation():
    stats = zones.jezero_zone_stats()
    assert sorted(stats["zones"].keys()) == [f"JZ-0{i}" for i in range(1, 9)]
    for zone in stats["zones"].values():
        assert zone["elevation_m"]["mean"] is not None
        assert zone["centroid_projected_m"]

def test_zone_centroid_lookup_rejects_unknown_zone():
    try:
        zones.zone_centroid_projected("JZ-99")
    except ValueError as error:
        assert "unknown zone_id" in str(error)
    else:
        raise AssertionError("expected unknown zone id to raise")

def test_plan_mission_returns_two_real_routes_and_unavailable_science_route_by_default():
    plan = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-07", eva_hours=8))
    assert plan["routes"]["A"]["available"] is True
    assert plan["routes"]["B"]["available"] is True
    assert plan["routes"]["C"]["available"] is False
    assert "reason" in plan["routes"]["C"]
    a_props = plan["routes"]["A"]["route"]["properties"]
    b_props = plan["routes"]["B"]["route"]["properties"]
    assert a_props["mode"] == "shortest"
    assert b_props["mode"] == "terrain_aware"
    assert a_props["distance_km"] > 0
    assert "elevation_gain_m" in b_props and "elevation_loss_m" in b_props


def test_plan_mission_rejects_unknown_science_waypoint_id():
    plan = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-07", science_waypoint_id="not-a-real-id"))
    assert plan["routes"]["C"]["available"] is False
    assert "Unknown science_waypoint_id" in plan["routes"]["C"]["reason"]


def test_plan_mission_builds_real_two_leg_science_route_for_verified_waypoint():
    waypoint_id = "m2020-places-site08-cache-depot"
    plan = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-06", eva_hours=72, science_waypoint_id=waypoint_id))
    route_c = plan["routes"]["C"]
    assert route_c["available"] is True
    assert route_c["waypoint"]["id"] == waypoint_id
    props = route_c["route"]["properties"]
    assert props["mode"] == "science_priority"
    assert props["distance_m"] > 0
    assert "legs" in props
    leg1_coords = props["legs"]["base_to_waypoint"]["geometry"]["coordinates"]
    leg2_coords = props["legs"]["waypoint_to_destination"]["geometry"]["coordinates"]
    joined_coords = route_c["route"]["geometry"]["coordinates"]
    # No duplicate seam point at the waypoint.
    assert len(joined_coords) == len(leg1_coords) + len(leg2_coords) - 1
    assert joined_coords[len(leg1_coords) - 1] == leg1_coords[-1]
    assert "feasibility" in route_c and route_c["feasibility"]["basis_route"] == "science_priority"
    assert "resource_assessment" in route_c

    # Route A/B are unaffected by requesting a science waypoint.
    plan_without_waypoint = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-06", eva_hours=72))
    assert plan["routes"]["A"]["route"]["properties"]["distance_m"] == plan_without_waypoint["routes"]["A"]["route"]["properties"]["distance_m"]
    assert plan["routes"]["B"]["route"]["properties"]["distance_m"] == plan_without_waypoint["routes"]["B"]["route"]["properties"]["distance_m"]

def test_plan_mission_feasibility_reflects_eva_limit():
    far_zone_plan = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-07", eva_hours=0.1))
    assert far_zone_plan["feasibility"]["feasible"] is False
    assert far_zone_plan["feasibility"]["remaining_eva_hours"] < 0

def test_plan_mission_rejects_unknown_zone():
    try:
        missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-99"))
    except ValueError:
        pass
    else:
        raise AssertionError("expected unknown zone id to raise")

def test_destination_change_recomputes_destination_and_route_metrics():
    first = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-06", eva_hours=72))
    second = missions.plan_mission(MissionPlanRequest(destination_zone_id="JZ-07", eva_hours=72))
    assert first["destination_zone_id"] != second["destination_zone_id"]
    assert first["destination_point"] != second["destination_point"]
    assert first["routes"]["B"]["route"]["properties"]["distance_m"] != second["routes"]["B"]["route"]["properties"]["distance_m"]

def test_emergency_return_reaches_base_from_nearby_point():
    base = zones.base_location()
    result = missions.emergency_return(EmergencyReturnRequest(
        current=Point(easting=base["easting"] - 2000, northing=base["northing"] - 1000),
    ))
    assert result["available"] is True
    assert result["route"]["properties"]["distance_m"] > 0

def test_emergency_return_reports_failure_outside_coverage_without_faking_a_route():
    result = missions.emergency_return(EmergencyReturnRequest(current=Point(easting=1, northing=1)))
    assert result["available"] is False
    assert "reason" in result

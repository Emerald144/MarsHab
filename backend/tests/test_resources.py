from app import missions, zones
from app.models import EmergencyReturnRequest, MissionPlanRequest, Point
from app.resources import assess_resource


def test_resource_model_reports_normal_use_and_reserve_margin():
    result = assess_resource(
        outbound_hours=2,
        return_hours=2,
        activity_hours=1,
        buffer_hours=0.5,
        budget_percent=80,
        reserve_percent=20,
        consumption_rate_percent_per_hour=2,
    )
    assert result["feasible"] is True
    assert result["estimated_use_percent"] == 11
    assert result["reserved_percent"] == 16
    assert result["remaining_after_reserve_percent"] == 53
    assert result["warning_level"] == "ok"
    assert "oxygen kilograms" in result["assumptions"][0]


def test_resource_model_flags_insufficient_budget():
    result = assess_resource(
        outbound_hours=10,
        return_hours=10,
        activity_hours=2,
        buffer_hours=1,
        budget_percent=20,
        reserve_percent=25,
        consumption_rate_percent_per_hour=2,
    )
    assert result["feasible"] is False
    assert result["warning_level"] == "insufficient"
    assert result["warnings"]


def test_mission_plan_combines_time_and_resource_feasibility():
    plan = missions.plan_mission(MissionPlanRequest(
        destination_zone_id="JZ-06",
        eva_hours=72,
        resource_budget_percent=20,
        resource_reserve_percent=20,
        resource_consumption_percent_per_hour=2,
    ))
    assert plan["feasibility"]["time_feasible"] is True
    assert plan["feasibility"]["resource_feasible"] is False
    assert plan["feasibility"]["feasible"] is False


def test_emergency_return_reports_resource_budget_and_unavailable_resource_data():
    base = zones.base_location()
    with_budget = missions.emergency_return(EmergencyReturnRequest(
        current=Point(easting=base["easting"] - 2000, northing=base["northing"] - 1000),
        resource_remaining_percent=50,
        resource_reserve_percent=20,
        resource_consumption_percent_per_hour=2,
    ))
    assert with_budget["available"] is True
    assert with_budget["resource_assessment"]["available"] is True

    without_budget = missions.emergency_return(EmergencyReturnRequest(
        current=Point(easting=base["easting"] - 2000, northing=base["northing"] - 1000),
    ))
    assert without_budget["available"] is True
    assert without_budget["resource_assessment"]["available"] is False


def test_emergency_return_unavailable_route_does_not_fake_resource_feasibility():
    result = missions.emergency_return(EmergencyReturnRequest(current=Point(easting=1, northing=1)))
    assert result["available"] is False
    assert result["resource_assessment"]["available"] is False

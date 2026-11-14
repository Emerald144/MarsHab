"""Mission planning: three route alternatives, feasibility, emergency return.

Route A (shortest distance) and Route B (terrain-aware) both run the real
A* engine in routing.py over the validated slope/terrain-cost rasters.
Route C (science priority) requires a verified science-target location for
the destination JZ zone; none exists in the current dataset, so it is
always reported as unavailable rather than invented.
"""
from typing import Any

from .models import EmergencyReturnRequest, MissionPlanRequest, Point, RouteRequest
from .resources import assess_resource, unavailable_resource_assessment
from .routing import route
from .zones import base_location, zone_centroid_projected

SCIENCE_PRIORITY_UNAVAILABLE_REASON = (
    "No verified science-target location data exists for JZ zones in the current dataset; "
    "Route C is not generated rather than using an invented waypoint."
)


def _route_or_failure(request: RouteRequest) -> dict[str, Any]:
    try:
        return {"available": True, "route": route(request)}
    except ValueError as error:
        return {"available": False, "reason": str(error)}


def plan_mission(req: MissionPlanRequest) -> dict[str, Any]:
    base = base_location()
    destination_easting, destination_northing = zone_centroid_projected(req.destination_zone_id)
    start = Point(easting=base["easting"], northing=base["northing"])
    destination = Point(easting=destination_easting, northing=destination_northing)

    common = dict(
        start=start,
        destination=destination,
        closures=req.closures,
        walking_speed_m_per_hour=req.walking_speed_m_per_hour,
        activity_hours=req.science_hours,
        contingency_hours=req.buffer_hours,
        eva_limit_hours=req.eva_hours,
    )
    route_a = _route_or_failure(RouteRequest(mode="shortest", **common))
    route_b = _route_or_failure(RouteRequest(mode="terrain_aware", **common))

    preferred = route_b if route_b["available"] else route_a
    feasibility: dict[str, Any] | None = None
    resource_assessment = unavailable_resource_assessment("No traversable route is available, so resource use cannot be estimated.")
    if preferred["available"]:
        props = preferred["route"]["properties"]
        resource_assessment = assess_resource(
            outbound_hours=props["estimated_one_way_hours"],
            return_hours=props["estimated_one_way_hours"],
            activity_hours=req.science_hours,
            buffer_hours=req.buffer_hours,
            budget_percent=req.resource_budget_percent,
            reserve_percent=req.resource_reserve_percent,
            consumption_rate_percent_per_hour=req.resource_consumption_percent_per_hour,
        )
        time_feasible = props["passes_demo_time_assumptions"]
        resource_feasible = resource_assessment["feasible"]
        feasibility = {
            "basis_route": "terrain_aware" if route_b["available"] else "shortest",
            "estimated_outbound_hours": props["estimated_one_way_hours"],
            "estimated_return_hours": props["estimated_one_way_hours"],
            "activity_hours": req.science_hours,
            "buffer_hours": req.buffer_hours,
            "estimated_total_hours": props["estimated_total_eva_hours"],
            "eva_limit_hours": req.eva_hours,
            "remaining_eva_hours": None if req.eva_hours is None else round(req.eva_hours - props["estimated_total_eva_hours"], 2),
            "time_feasible": time_feasible,
            "resource_feasible": resource_feasible,
            "warnings": resource_assessment["warnings"],
            "feasible": None if time_feasible is None else bool(time_feasible and resource_feasible),
        }

    return {
        "base": base,
        "destination_zone_id": req.destination_zone_id,
        "destination_point": {"easting": destination_easting, "northing": destination_northing},
        "routes": {
            "A": {"name": "Shortest Distance", **route_a},
            "B": {"name": "Terrain-Aware", **route_b},
            "C": {"name": "Science Priority", "available": False, "reason": SCIENCE_PRIORITY_UNAVAILABLE_REASON},
        },
        "feasibility": feasibility,
        "resource_assessment": resource_assessment,
    }


def emergency_return(req: EmergencyReturnRequest) -> dict[str, Any]:
    base = base_location()
    result = _route_or_failure(RouteRequest(
        start=req.current,
        destination=Point(easting=base["easting"], northing=base["northing"]),
        mode="terrain_aware",
        closures=req.closures,
        walking_speed_m_per_hour=req.walking_speed_m_per_hour,
        activity_hours=0,
        contingency_hours=0,
        eva_limit_hours=req.eva_hours,
    ))
    if result["available"] and req.resource_remaining_percent is not None:
        resource_assessment = assess_resource(
            outbound_hours=result["route"]["properties"]["estimated_one_way_hours"],
            return_hours=0,
            activity_hours=0,
            buffer_hours=0,
            budget_percent=req.resource_remaining_percent,
            reserve_percent=req.resource_reserve_percent,
            consumption_rate_percent_per_hour=req.resource_consumption_percent_per_hour,
        )
    elif result["available"]:
        resource_assessment = unavailable_resource_assessment(
            "Current resource budget was not supplied; return-route resource feasibility is unavailable."
        )
    else:
        resource_assessment = unavailable_resource_assessment(
            "No return route is available, so emergency resource use cannot be estimated."
        )
    return {
        "base": base,
        "current": {"easting": req.current.easting, "northing": req.current.northing},
        "resource_assessment": resource_assessment,
        **result,
    }

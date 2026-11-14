"""Mission planning: three route alternatives, feasibility, emergency return.

Route A (shortest distance) and Route B (terrain-aware) both run the real
A* engine in routing.py over the validated slope/terrain-cost rasters.
Route C (science priority) requires a verified science-target location for
the destination JZ zone; none exists in the current dataset, so it is
always reported as unavailable rather than invented.
"""
from typing import Any

from .models import EmergencyReturnRequest, MissionPlanRequest, Point, RouteRequest
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
    if preferred["available"]:
        props = preferred["route"]["properties"]
        feasibility = {
            "basis_route": "terrain_aware" if route_b["available"] else "shortest",
            "estimated_outbound_hours": props["estimated_one_way_hours"],
            "estimated_return_hours": props["estimated_one_way_hours"],
            "activity_hours": req.science_hours,
            "buffer_hours": req.buffer_hours,
            "estimated_total_hours": props["estimated_total_eva_hours"],
            "eva_limit_hours": req.eva_hours,
            "remaining_eva_hours": None if req.eva_hours is None else round(req.eva_hours - props["estimated_total_eva_hours"], 2),
            "feasible": props["passes_demo_time_assumptions"],
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
    }


def emergency_return(req: EmergencyReturnRequest) -> dict[str, Any]:
    base = base_location()
    result = _route_or_failure(RouteRequest(
        start=req.current,
        destination=Point(easting=base["easting"], northing=base["northing"]),
        mode="terrain_aware",
        closures=[],
        walking_speed_m_per_hour=req.walking_speed_m_per_hour,
        activity_hours=0,
        contingency_hours=0,
        eva_limit_hours=req.eva_hours,
    ))
    return {"base": base, "current": {"easting": req.current.easting, "northing": req.current.northing}, **result}

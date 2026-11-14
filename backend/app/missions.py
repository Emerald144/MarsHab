"""Mission planning: three route alternatives, feasibility, emergency return.

Route A (shortest distance) and Route B (terrain-aware) both run the real
A* engine in routing.py over the validated slope/terrain-cost rasters.
Route C (science priority) requires the caller to explicitly select a
verified, route-eligible science catalog waypoint (science_waypoint_id);
when selected, it runs the same A* engine twice (base -> waypoint ->
destination). With no waypoint, or an unverified/ineligible/unreachable
one, Route C is reported unavailable with an explicit reason rather than
falling back to a preset or invented waypoint.
"""
from typing import Any

from . import science_data
from .models import EmergencyReturnRequest, MissionPlanRequest, Point, RouteRequest
from .resources import assess_resource, unavailable_resource_assessment
from .routing import route, route_search_bounds
from .zones import base_location, zone_centroid_projected

SCIENCE_PRIORITY_UNAVAILABLE_REASON = (
    "No science waypoint was selected for this plan; Route C requires an explicit, "
    "verified, route-eligible science catalog id rather than a default/invented waypoint."
)


def _route_or_failure(
    request: RouteRequest,
    *,
    grid_bounds: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    try:
        return {"available": True, "route": route(request, grid_bounds=grid_bounds)}
    except ValueError as error:
        return {"available": False, "reason": str(error)}


def _science_priority_route(
    *,
    waypoint_id: str | None,
    start: Point,
    destination: Point,
    closures: list,
    walking_speed_m_per_hour: float,
    activity_hours: float,
    buffer_hours: float,
    eva_limit_hours: float | None,
) -> dict[str, Any]:
    """Route C: base -> verified science waypoint -> destination, via the real A* engine twice.

    Only ever returns available=True when the waypoint id resolves to a catalog record
    that is route_waypoint_eligible, has a verified location, and both legs are
    traversable on the current DEM/cost grid. Otherwise returns a structured,
    explicit unavailable reason -- never a fallback to a preset or fictional waypoint.
    """
    if not waypoint_id:
        return {"available": False, "reason": SCIENCE_PRIORITY_UNAVAILABLE_REASON}

    target = science_data.find_target(waypoint_id)
    if target is None:
        return {"available": False, "reason": f"Unknown science_waypoint_id: {waypoint_id!r}."}
    if not target.get("route_waypoint_eligible"):
        return {"available": False, "reason": f"Science catalog record {waypoint_id!r} is not route-eligible."}
    location = target.get("location") or {}
    if not location.get("location_verified") or location.get("x_m") is None or location.get("y_m") is None:
        return {"available": False, "reason": f"Science catalog record {waypoint_id!r} has no verified route-usable coordinates."}

    waypoint_point = Point(easting=location["x_m"], northing=location["y_m"])
    common = dict(
        mode="terrain_aware",
        closures=closures,
        walking_speed_m_per_hour=walking_speed_m_per_hour,
        eva_limit_hours=None,
    )
    # Both legs must share the same raster envelope. Otherwise each independent
    # resample can place the same waypoint in different cell centres, producing
    # a visible seam and a geometry length inconsistent with the two A* legs.
    common_grid_bounds = route_search_bounds([start, waypoint_point, destination], closures)
    leg1 = _route_or_failure(
        RouteRequest(start=start, destination=waypoint_point, activity_hours=0, contingency_hours=0, **common),
        grid_bounds=common_grid_bounds,
    )
    if not leg1["available"]:
        return {"available": False, "reason": f"No traversable route from the mission base to the science waypoint: {leg1['reason']}"}
    leg2 = _route_or_failure(
        RouteRequest(start=waypoint_point, destination=destination, activity_hours=0, contingency_hours=0, **common),
        grid_bounds=common_grid_bounds,
    )
    if not leg2["available"]:
        return {"available": False, "reason": f"No traversable route from the science waypoint to the destination: {leg2['reason']}"}

    leg1_props = leg1["route"]["properties"]
    leg2_props = leg2["route"]["properties"]
    leg1_coords = leg1["route"]["geometry"]["coordinates"]
    leg2_coords = leg2["route"]["geometry"]["coordinates"]
    # The waypoint is the shared seam point: leg2's path starts where leg1's ends.
    joined_coordinates = leg1_coords + leg2_coords[1:]

    distance_m = leg1_props["distance_m"] + leg2_props["distance_m"]
    elevation_gain_m = leg1_props["elevation_gain_m"] + leg2_props["elevation_gain_m"]
    elevation_loss_m = leg1_props["elevation_loss_m"] + leg2_props["elevation_loss_m"]
    cumulative_terrain_cost = leg1_props["cumulative_terrain_cost"] + leg2_props["cumulative_terrain_cost"]
    one_way_hours = leg1_props["estimated_one_way_hours"] + leg2_props["estimated_one_way_hours"]
    total_hours = one_way_hours * 2 + activity_hours + buffer_hours
    mean_slope_degrees = round(
        (leg1_props["mean_slope_degrees"] + leg2_props["mean_slope_degrees"]) / 2, 2
    )
    max_slope_degrees = round(max(leg1_props["max_slope_degrees"], leg2_props["max_slope_degrees"]), 2)

    assumptions = [
        *leg1_props["assumptions"],
        "Route C two-leg total assumes the return trip retraces the outbound base -> waypoint -> destination path "
        "(same round-trip symmetry assumption Routes A and B use), plus the requested activity and buffer hours.",
        "The science waypoint is a verified rover-localization position, not a certified safe stopping point or an "
        "exact rock/sample-target coordinate; see the waypoint's evidence_level and limitations.",
    ]

    route_feature = {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": joined_coordinates},
        "properties": {
            "mode": "science_priority",
            "algorithm": "Two-leg A* (8-connected grid, resampled 20 m DEM-derived cost raster) via a verified science waypoint",
            "assumptions": assumptions,
            "distance_m": round(distance_m, 1),
            "distance_km": round(distance_m / 1000, 3),
            "elevation_gain_m": round(elevation_gain_m, 1),
            "elevation_loss_m": round(elevation_loss_m, 1),
            "cumulative_terrain_cost": round(cumulative_terrain_cost, 1),
            "mean_slope_degrees": mean_slope_degrees,
            "max_slope_degrees": max_slope_degrees,
            "estimated_one_way_hours": round(one_way_hours, 2),
            "estimated_total_eva_hours": round(total_hours, 2),
            "eva_limit_hours": eva_limit_hours,
            "passes_demo_time_assumptions": None if eva_limit_hours is None else total_hours <= eva_limit_hours,
            "grid_resolution_m": leg1_props["grid_resolution_m"],
            "endpoint_snapped_to_traversable_cell": (
                leg1_props["endpoint_snapped_to_traversable_cell"] or leg2_props["endpoint_snapped_to_traversable_cell"]
            ),
            "legs": {
                "base_to_waypoint": leg1["route"],
                "waypoint_to_destination": leg2["route"],
            },
            "disclaimer": "Prototype terrain route using a resampled 20 m DEM. It is not a certified astronaut-safe route.",
        },
    }
    return {
        "available": True,
        "route": route_feature,
        "waypoint": {
            "id": target["id"],
            "name": target.get("name"),
            "kind": target.get("kind"),
            "evidence_level": target.get("evidence_level"),
            "location": location,
            "source_id": target.get("source_id"),
            "jz_zone_ids": target.get("jz_zone_ids", []),
            "limitations": target.get("limitations", []),
        },
    }


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
    route_c = _science_priority_route(
        waypoint_id=req.science_waypoint_id,
        start=start,
        destination=destination,
        closures=req.closures,
        walking_speed_m_per_hour=req.walking_speed_m_per_hour,
        activity_hours=req.science_hours,
        buffer_hours=req.buffer_hours,
        eva_limit_hours=req.eva_hours,
    )
    if route_c["available"]:
        c_props = route_c["route"]["properties"]
        route_c["resource_assessment"] = assess_resource(
            outbound_hours=c_props["estimated_one_way_hours"],
            return_hours=c_props["estimated_one_way_hours"],
            activity_hours=req.science_hours,
            buffer_hours=req.buffer_hours,
            budget_percent=req.resource_budget_percent,
            reserve_percent=req.resource_reserve_percent,
            consumption_rate_percent_per_hour=req.resource_consumption_percent_per_hour,
        )
        c_time_feasible = c_props["passes_demo_time_assumptions"]
        c_resource_feasible = route_c["resource_assessment"]["feasible"]
        route_c["feasibility"] = {
            "basis_route": "science_priority",
            "estimated_outbound_hours": c_props["estimated_one_way_hours"],
            "estimated_return_hours": c_props["estimated_one_way_hours"],
            "activity_hours": req.science_hours,
            "buffer_hours": req.buffer_hours,
            "estimated_total_hours": c_props["estimated_total_eva_hours"],
            "eva_limit_hours": req.eva_hours,
            "remaining_eva_hours": None if req.eva_hours is None else round(req.eva_hours - c_props["estimated_total_eva_hours"], 2),
            "time_feasible": c_time_feasible,
            "resource_feasible": c_resource_feasible,
            "warnings": route_c["resource_assessment"]["warnings"],
            "feasible": None if c_time_feasible is None else bool(c_time_feasible and c_resource_feasible),
        }

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
            "C": {"name": "Science Priority", **route_c},
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

"""Assumption-based EVA resource budgeting.

This module deliberately models abstract percentage points rather than oxygen
mass, battery energy, or physiological limits. The defaults are planning
assumptions supplied by the operator and are not NASA-validated values.
"""
from typing import Any

RESOURCE_MODEL = "abstract percentage budget"
RESOURCE_ASSUMPTIONS = [
    "Resource units are abstract percentage points, not oxygen kilograms or battery watt-hours.",
    "Consumption rate is a configurable planning assumption and is not a measured astronaut or rover value.",
    "Estimated use equals (outbound travel + return travel + activity + buffer) hours multiplied by the configured rate.",
    "The configured reserve is withheld before resource feasibility is evaluated.",
]


def unavailable_resource_assessment(reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "model": RESOURCE_MODEL,
        "budget_percent": None,
        "reserve_percent": None,
        "reserved_percent": None,
        "estimated_use_percent": None,
        "remaining_after_reserve_percent": None,
        "consumption_rate_percent_per_hour": None,
        "modeled_hours": None,
        "feasible": None,
        "warning_level": "unavailable",
        "warnings": [reason],
        "assumptions": RESOURCE_ASSUMPTIONS,
    }


def assess_resource(
    *,
    outbound_hours: float,
    return_hours: float,
    activity_hours: float,
    buffer_hours: float,
    budget_percent: float,
    reserve_percent: float,
    consumption_rate_percent_per_hour: float,
) -> dict[str, Any]:
    modeled_hours = outbound_hours + return_hours + activity_hours + buffer_hours
    estimated_use = modeled_hours * consumption_rate_percent_per_hour
    reserved = budget_percent * reserve_percent / 100
    remaining = budget_percent - reserved - estimated_use
    warning_level = "ok"
    warnings: list[str] = []
    if remaining < 0:
        warning_level = "insufficient"
        warnings.append("Estimated use exceeds the configurable resource budget after reserve.")
    elif remaining <= budget_percent * 0.1:
        warning_level = "low"
        warnings.append("Only a low resource margin remains after the configured reserve.")
    return {
        "available": True,
        "model": RESOURCE_MODEL,
        "budget_percent": round(budget_percent, 2),
        "reserve_percent": round(reserve_percent, 2),
        "reserved_percent": round(reserved, 2),
        "estimated_use_percent": round(estimated_use, 2),
        "remaining_after_reserve_percent": round(remaining, 2),
        "consumption_rate_percent_per_hour": round(consumption_rate_percent_per_hour, 2),
        "modeled_hours": round(modeled_hours, 2),
        "feasible": remaining >= 0,
        "warning_level": warning_level,
        "warnings": warnings,
        "assumptions": RESOURCE_ASSUMPTIONS,
    }

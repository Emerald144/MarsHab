import math
from typing import Literal
from pydantic import BaseModel, Field, field_validator

class Point(BaseModel):
    """Easting/northing in the Jezero Mars projected CRS (metres)."""
    easting: float
    northing: float

    @field_validator("easting", "northing")
    @classmethod
    def coordinates_must_be_finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("coordinates must be finite")
        return value

class Closure(BaseModel):
    """A simulated circular closure, never an observed NASA hazard."""
    center: Point
    radius_m: float = Field(gt=0, le=20_000)

class RouteRequest(BaseModel):
    start: Point
    destination: Point
    mode: Literal["shortest", "terrain_aware"] = "terrain_aware"
    closures: list[Closure] = Field(default_factory=list, max_length=20)
    walking_speed_m_per_hour: float = Field(default=1_000, gt=0, le=10_000)
    activity_hours: float = Field(default=0, ge=0, le=24)
    contingency_hours: float = Field(default=0.5, ge=0, le=24)
    eva_limit_hours: float | None = Field(default=None, gt=0, le=72)

    @field_validator("closures")
    @classmethod
    def closures_are_reasonable(cls, closures: list[Closure]):
        return validate_closures(closures)

class MissionPlanRequest(BaseModel):
    """Plan a mission from the verified base to a real JZ zone."""
    destination_zone_id: str
    eva_hours: float | None = Field(default=None, gt=0, le=72)
    science_hours: float = Field(default=0, ge=0, le=24)
    buffer_hours: float = Field(default=0.5, ge=0, le=24)
    walking_speed_m_per_hour: float = Field(default=1_000, gt=0, le=10_000)
    closures: list[Closure] = Field(default_factory=list, max_length=20)

    @field_validator("closures")
    @classmethod
    def closures_are_reasonable(cls, closures: list[Closure]):
        return validate_closures(closures)

class EmergencyReturnRequest(BaseModel):
    """Return route from a simulated current position back to the mission base."""
    current: Point
    eva_hours: float | None = Field(default=None, gt=0, le=72)
    walking_speed_m_per_hour: float = Field(default=1_000, gt=0, le=10_000)
    closures: list[Closure] = Field(default_factory=list, max_length=20)

    @field_validator("closures")
    @classmethod
    def closures_are_reasonable(cls, closures: list[Closure]):
        return validate_closures(closures)


def validate_closures(closures: list[Closure]) -> list[Closure]:
    """Keep simulated closures bounded so a request cannot mask the whole study area."""
    if sum(c.radius_m for c in closures) > 100_000:
        raise ValueError("combined closure size is too large")
    return closures

"""Read-only historical environment API (NASA Mars 2020 MEDA).

Mounted by ``app.main`` under ``/api/v1/environment``. Every response carries a
``data_label`` block identifying the data as *Historical Rover Observation*:
not live weather, not a forecast, not valid for every Jezero zone.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from . import environment_data
from .environment_data import EnvironmentDataError

router = APIRouter(prefix="/api/v1/environment", tags=["environment"])


def _data_error(error: EnvironmentDataError) -> HTTPException:
    return HTTPException(status_code=503, detail=f"Environment dataset unavailable: {error}")


@router.get("/observations")
def observations(
    metric: str | None = Query(None, description="Metric id or family, e.g. 'pressure' or 'air_temperature'"),
    start: str | None = Query(None, description="ISO-8601 UTC lower bound (timezone required)"),
    end: str | None = Query(None, description="ISO-8601 UTC upper bound (timezone required)"),
    sol: int | None = Query(None, ge=0, le=5000),
    limit: int = Query(environment_data.DEFAULT_LIMIT, ge=1, le=environment_data.MAX_LIMIT),
    offset: int = Query(0, ge=0, le=environment_data.MAX_OFFSET),
):
    try:
        return environment_data.query_observations(
            metric=metric, start=start, end=end, sol=sol, limit=limit, offset=offset
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except EnvironmentDataError as error:
        raise _data_error(error) from error


@router.get("/summary")
def summary(
    metric: str | None = Query(None),
    by: str = Query("sol"),
    sol: int | None = Query(None, ge=0, le=5000),
):
    if by != "sol":
        raise HTTPException(status_code=400, detail="Only by=sol is currently supported")
    try:
        return environment_data.summarize_by_sol(metric=metric, sol=sol)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except EnvironmentDataError as error:
        raise _data_error(error) from error


@router.get("/availability")
def availability():
    try:
        return environment_data.availability()
    except EnvironmentDataError as error:
        raise _data_error(error) from error


@router.get("/metadata")
def metadata():
    return environment_data.load_metadata()

"""Read-only access to normalized NASA MEDA (Mars 2020) historical environment data.

Data are produced offline by ``scripts/gis/prepare_meda.py`` from official PDS products.
This module never downloads anything, never interpolates and never invents values:
if the processed files are missing or empty every function returns an explicit
"unavailable" result carrying provenance.

Every observation is a *historical rover-local measurement* (``is_current`` is always
false). It is not live weather, not a forecast and not valid for any other location
unless a validated rover location says otherwise.
"""

from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import DATA_ROOT

ENVIRONMENT_DIR = DATA_ROOT / "processed" / "environment"
OBSERVATIONS_PATH = ENVIRONMENT_DIR / "meda_observations.csv"
SUMMARY_PATH = ENVIRONMENT_DIR / "meda_sol_summary.json"
METADATA_PATH = DATA_ROOT / "metadata" / "meda_sources.json"
PRODUCTS_PATH = DATA_ROOT / "metadata" / "meda_products.json"

OBSERVATION_FIELDS = [
    "source", "source_product_id", "processing_level", "observation_type", "sol", "sclk",
    "utc_time", "utc_basis", "lmst", "ltst", "metric", "value", "unit", "uncertainty",
    "quality", "quality_flag", "source_field", "location_status", "rover_easting_m",
    "rover_northing_m", "rover_site_x_north_m", "rover_site_y_west_m", "jz_zone_id", "is_current",
]

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000
MAX_OFFSET = 1_000_000
_METRIC_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_QUALITY_EXCLUDED = {"bad", "missing", "invalid"}

DATA_LABEL = {
    "label": "Historical Rover Observation",
    "observation_type": "historical_rover_measurement",
    "is_current": False,
    "caveat": (
        "Historical measurements taken at the Perseverance rover's location on the listed sols. "
        "Not live weather, not a forecast, and not valid for every Jezero zone."
    ),
}


class EnvironmentDataError(RuntimeError):
    """The processed environment files exist but cannot be read or are malformed."""


# One-entry caches keyed by (path, mtime, size) so a changed file is re-read but requests stay cheap.
_cache: dict[str, tuple[tuple[int, int], Any]] = {}


def _signature(path: Path) -> tuple[int, int] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size)


def _cached(path: Path, loader):
    signature = _signature(path)
    if signature is None:
        _cache.pop(str(path), None)
        return None
    hit = _cache.get(str(path))
    if hit and hit[0] == signature:
        return hit[1]
    value = loader(path)
    _cache[str(path)] = (signature, value)
    return value


def clear_cache() -> None:
    _cache.clear()


def _unavailable(reason: str) -> dict[str, Any]:
    return {
        "available": False,
        "source": "NASA/PDS Atmospheres MEDA",
        "reason": reason,
        "metadata_file": "data/metadata/meda_sources.json",
    }


def _read_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def load_metadata() -> dict[str, Any]:
    """Source manifest (official URLs, DOI, policies) plus product verification records."""

    if _signature(METADATA_PATH) is None:
        return _unavailable("MEDA source manifest is not present.")
    try:
        metadata = _cached(METADATA_PATH, _read_json_file)
    except (OSError, json.JSONDecodeError) as error:
        return _unavailable(f"MEDA metadata could not be read: {error}")
    if not isinstance(metadata, dict):
        return _unavailable("MEDA metadata must be a JSON object.")
    result = dict(metadata)
    products = None
    if _signature(PRODUCTS_PATH) is not None:
        try:
            products = _cached(PRODUCTS_PATH, _read_json_file)
        except (OSError, json.JSONDecodeError):
            products = None
    if isinstance(products, dict):
        result["verified_products"] = [
            {
                "product_id": p.get("product_id"),
                "instrument": p.get("instrument"),
                "processing_level": p.get("processing_level"),
                "sol": p.get("sol"),
                "version": p.get("version"),
                "official_csv_url": p.get("official_csv_url"),
                "official_label_url": p.get("official_label_url"),
                "official_sha256": p.get("official_sha256"),
                "verification": p.get("verification"),
            }
            for p in products.get("products", [])
        ]
        result["verified_products_checked_at_utc"] = products.get("checked_at_utc")
    summary = stored_summary()
    if summary is not None:
        result["import"] = {
            "available": summary.get("available", False),
            "observation_count": summary.get("observation_count", 0),
            "full_resolution_sample_count": summary.get("full_resolution_sample_count", 0),
            "coverage": summary.get("coverage"),
            "decimation": summary.get("decimation"),
            "time_conventions": summary.get("time_conventions"),
        }
    return result


def _parse_utc(value: str | None, field_name: str = "time") -> datetime | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field_name} must be an ISO-8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{field_name} must include a timezone; no local-time assumption is made")
    return parsed.astimezone(timezone.utc)


def _float(text: str | None) -> float | None:
    if text is None or not text.strip():
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _parse_row(row: dict[str, str]) -> dict[str, Any] | None:
    """Convert one normalized CSV row; non-observation rows (no metric/finite value) return None."""

    metric = (row.get("metric") or "").strip()
    value = _float(row.get("value"))
    if not metric or value is None:
        return None
    sol_text = (row.get("sol") or "").strip()
    try:
        sol = int(sol_text) if sol_text else None
    except ValueError:
        return None
    utc_text = (row.get("utc_time") or "").strip() or None
    utc_dt = _parse_utc(utc_text, "utc_time") if utc_text else None
    status = (row.get("location_status") or "unavailable").strip() or "unavailable"
    location: dict[str, Any] = {"status": status}
    if status == "validated":
        location.update({
            "easting_m": _float(row.get("rover_easting_m")),
            "northing_m": _float(row.get("rover_northing_m")),
            "site_x_north_m": _float(row.get("rover_site_x_north_m")),
            "site_y_west_m": _float(row.get("rover_site_y_west_m")),
            "crs": "Jezero_Crater_Projection (Mars projected metres; not Earth lon/lat)",
        })
    return {
        "source": (row.get("source") or "").strip() or None,
        "source_product_id": (row.get("source_product_id") or "").strip() or None,
        "processing_level": (row.get("processing_level") or "").strip() or None,
        "observation_type": (row.get("observation_type") or "").strip() or "historical_rover_measurement",
        "sol": sol,
        "sclk": _float(row.get("sclk")),
        "utc_time": utc_text,
        "utc_basis": (row.get("utc_basis") or "").strip() or None,
        "lmst": (row.get("lmst") or "").strip() or None,
        "ltst": (row.get("ltst") or "").strip() or None,
        "metric": metric,
        "value": value,
        "unit": (row.get("unit") or "").strip() or None,
        "uncertainty": _float(row.get("uncertainty")),
        "quality": ((row.get("quality") or "unknown").strip().lower() or "unknown"),
        "quality_flag": (row.get("quality_flag") or "").strip() or None,
        "source_field": (row.get("source_field") or "").strip() or None,
        "rover_location": location,
        "jz_zone_id": (row.get("jz_zone_id") or "").strip() or None,
        "is_current": False,  # historical data are never current, whatever the file says
        "_utc_dt": utc_dt,
    }


def _load_observations_file(path: Path) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or any(f not in reader.fieldnames for f in OBSERVATION_FIELDS):
                raise EnvironmentDataError("MEDA observation CSV is missing one or more normalized schema columns")
            for row in reader:
                parsed = _parse_row(row)
                if parsed is not None:
                    observations.append(parsed)
    except (OSError, ValueError, csv.Error) as error:
        if isinstance(error, EnvironmentDataError):
            raise
        raise EnvironmentDataError(f"MEDA observation CSV could not be read: {error}") from error
    observations.sort(key=_sort_key)
    return observations


def _sort_key(observation: dict[str, Any]) -> tuple[Any, ...]:
    return (
        observation["_utc_dt"] or datetime.max.replace(tzinfo=timezone.utc),
        observation["sclk"] if observation["sclk"] is not None else math.inf,
        observation["metric"],
        observation["source_product_id"] or "",
    )


def load_observations() -> list[dict[str, Any]]:
    """All normalized observations, read on demand and cached until the file changes."""

    loaded = _cached(OBSERVATIONS_PATH, _load_observations_file)
    return loaded or []


def _public(observation: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in observation.items() if not k.startswith("_")}


def _validate_metric(metric: str | None) -> str | None:
    if metric is None or not metric.strip():
        return None
    metric = metric.strip()
    if not _METRIC_RE.fullmatch(metric):
        raise ValueError("metric may contain only letters, numbers, '.', '-' and '_'")
    return metric


def _metric_matches(selected: str | None, candidate: str) -> bool:
    """``metric=air_temperature`` selects the whole family ``air_temperature.*``."""

    return selected is None or candidate == selected or candidate.startswith(selected + ".")


def query_observations(
    *,
    metric: str | None = None,
    start: str | None = None,
    end: str | None = None,
    sol: int | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Bounded, deterministically ordered observations with pagination and provenance."""

    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
    if not 0 <= offset <= MAX_OFFSET:
        raise ValueError(f"offset must be between 0 and {MAX_OFFSET}")
    metric = _validate_metric(metric)
    start_time = _parse_utc(start, "start")
    end_time = _parse_utc(end, "end")
    if start_time and end_time and start_time > end_time:
        raise ValueError("start must be earlier than or equal to end")

    matches = []
    for observation in load_observations():
        if not _metric_matches(metric, observation["metric"]):
            continue
        if sol is not None and observation["sol"] != sol:
            continue
        moment = observation["_utc_dt"]
        if start_time and (moment is None or moment < start_time):
            continue
        if end_time and (moment is None or moment > end_time):
            continue
        matches.append(observation)
    page = matches[offset: offset + limit]
    next_offset = offset + limit if offset + limit < len(matches) else None
    available = bool(load_observations())
    return {
        "data_label": DATA_LABEL,
        "observations": [_public(o) for o in page],
        "total": len(matches),
        "limit": limit,
        "offset": offset,
        "next_offset": next_offset,
        "data_available": available,
        "status": "ok" if matches else ("empty_selection" if available else "unavailable"),
        "filters": {"metric": metric, "start": start, "end": end, "sol": sol},
        "provenance": load_metadata(),
    }


def stored_summary() -> dict[str, Any] | None:
    """The importer's aggregate summary (derived from all valid native samples)."""

    if _signature(SUMMARY_PATH) is None:
        return None
    try:
        result = _cached(SUMMARY_PATH, _read_json_file)
    except (OSError, json.JSONDecodeError):
        return None
    return result if isinstance(result, dict) else None


def _groups_from_rows(metric: str | None, sol: int | None) -> list[dict[str, Any]]:
    """Fallback aggregation when no importer summary exists (uses the observation rows only)."""

    grouped: dict[tuple[int | None, str], list[dict[str, Any]]] = {}
    for row in load_observations():
        if not _metric_matches(metric, row["metric"]) or (sol is not None and row["sol"] != sol):
            continue
        grouped.setdefault((row["sol"], row["metric"]), []).append(row)
    groups = []
    for (group_sol, group_metric), rows in sorted(grouped.items(), key=lambda kv: (-1 if kv[0][0] is None else kv[0][0], kv[0][1])):
        usable = [r["value"] for r in rows if r["quality"] not in _QUALITY_EXCLUDED]
        units = sorted({r["unit"] for r in rows if r["unit"]})
        groups.append({
            "sol": group_sol, "metric": group_metric,
            "unit": units[0] if len(units) == 1 else ("mixed" if units else None),
            "sample_count": len(usable), "row_count": len(rows),
            "minimum": min(usable) if usable else None, "maximum": max(usable) if usable else None,
            "mean": math.fsum(usable) / len(usable) if usable else None,
        })
    return groups


def summarize_by_sol(metric: str | None = None, sol: int | None = None) -> dict[str, Any]:
    """Per-Sol, per-metric aggregates. Derived values: never mixed with observation rows."""

    metric = _validate_metric(metric)
    summary = stored_summary()
    if summary is not None and summary.get("groups_by_sol"):
        groups = [
            g for g in summary["groups_by_sol"]
            if _metric_matches(metric, g["metric"]) and (sol is None or g["sol"] == sol)
        ]
        basis = "all valid native samples (importer summary)"
    else:
        groups = _groups_from_rows(metric, sol)
        basis = "decimated observation rows (no importer summary present)"
    available = bool(groups)
    return {
        "data_label": DATA_LABEL,
        "record_type": "derived_aggregate",
        "available": available,
        "data_available": available,
        "status": "ok" if available else ("empty_selection" if load_observations() else "unavailable"),
        "metric": metric,
        "sol": sol,
        "by": "sol",
        "basis": basis,
        "total_groups": len(groups),
        "groups": groups,
        "provenance": load_metadata(),
    }


def availability() -> dict[str, Any]:
    """Coverage, quality and missing-data diagnostics for the processed MEDA dataset."""

    rows = load_observations()
    summary = stored_summary()
    if not rows:
        return {
            "data_label": DATA_LABEL,
            "available": False,
            "status": "unavailable",
            "reason": "No normalized MEDA observations are present. Run scripts/gis/prepare_meda.py.",
            "observation_count": 0,
            "metrics": [],
            "excluded_metrics": (summary or {}).get("excluded_metrics", []),
            "provenance": load_metadata(),
        }
    quality: dict[str, int] = {}
    location: dict[str, int] = {}
    metrics: dict[str, int] = {}
    sols: set[int] = set()
    for row in rows:
        quality[row["quality"]] = quality.get(row["quality"], 0) + 1
        status = row["rover_location"]["status"]
        location[status] = location.get(status, 0) + 1
        metrics[row["metric"]] = metrics.get(row["metric"], 0) + 1
        if row["sol"] is not None:
            sols.add(row["sol"])
    times = [r["_utc_dt"] for r in rows if r["_utc_dt"]]
    result: dict[str, Any] = {
        "data_label": DATA_LABEL,
        "available": True,
        "status": "ok",
        "observation_count": len(rows),
        "metrics": [
            {**({} if summary is None else {k: v for k, v in summary.get("metrics", {}).get(m, {}).items()}),
             "metric": m, "observation_rows": n}
            for m, n in sorted(metrics.items())
        ],
        "coverage": {
            "sols": sorted(sols),
            "utc_start": min(times).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if times else None,
            "utc_end": max(times).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if times else None,
        },
        "quality_counts": dict(sorted(quality.items())),
        "location_status_counts": dict(sorted(location.items())),
        "provenance": load_metadata(),
    }
    if summary is not None:
        result["missing_data"] = {
            "excluded_metrics": summary.get("excluded_metrics", []),
            "per_sol_metric": [
                {k: g[k] for k in ("sol", "metric", "sample_count", "excluded_count", "exclusion_counts",
                                    "covered_minutes", "coverage_fraction_of_sol") if k in g}
                for g in summary.get("groups_by_sol", [])
            ],
            "note": summary.get("coverage", {}).get("note"),
        }
        result["rover_location_by_sol"] = summary.get("rover_location_by_sol", [])
        result["full_resolution_sample_count"] = summary.get("full_resolution_sample_count")
        result["decimation"] = summary.get("decimation")
        result["time_conventions"] = summary.get("time_conventions")
        result["products"] = summary.get("products", [])
    return result

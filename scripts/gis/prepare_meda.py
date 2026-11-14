#!/usr/bin/env python3
"""Normalize official NASA PDS Mars 2020 MEDA products into TerraNexis environment datasets.

Inputs (all read-only)
  data/metadata/meda_products.json   verified product manifest (fetch_meda_products.py)
  data/metadata/meda_import_mapping.json  reviewed column/unit/range mapping
  data/raw/meda/labels/*.xml         PDS4 labels (start/stop UTC, units)
  PDS CSV products                   located through the manifest (data/raw/...)
  PLACES best_interp.csv             landing site + rover poses, used to validate rover location
  data/web/zones/jezero_zones.geojson  JZ zone polygons (projected metres)

Outputs (written deterministically; running twice yields byte-identical files)
  data/processed/environment/meda_observations.csv   decimated native samples (observations)
  data/processed/environment/meda_sol_summary.json   per-Sol / per-metric aggregates over ALL valid samples,
                                                     exclusion counts, location validation, provenance

Nothing is interpolated, converted or invented. Values flagged as invalid by the product (fill value),
empty values and values outside documented physical ranges are excluded and counted.

Usage
  python scripts/gis/prepare_meda.py            # write outputs
  python scripts/gis/prepare_meda.py --check    # fail if the committed outputs differ from a fresh run
"""

from __future__ import annotations

import argparse
import bisect
import csv
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
_env_root = os.environ.get("TERRANEXIS_DATA_ROOT", "").strip()
DEFAULT_DATA_ROOT = (ROOT / _env_root).resolve() if _env_root else ROOT / "data"

OBSERVATION_FIELDS = [
    "source",
    "source_product_id",
    "processing_level",
    "observation_type",
    "sol",
    "sclk",
    "utc_time",
    "utc_basis",
    "lmst",
    "ltst",
    "metric",
    "value",
    "unit",
    "uncertainty",
    "quality",
    "quality_flag",
    "source_field",
    "location_status",
    "rover_easting_m",
    "rover_northing_m",
    "rover_site_x_north_m",
    "rover_site_y_west_m",
    "jz_zone_id",
    "is_current",
]

SOURCE_NAME = "NASA/PDS Atmospheres Node - Mars 2020 MEDA"
OBSERVATION_TYPE = "historical_rover_measurement"
UTC_BASIS = "derived_from_pds_label_linear"
LMST_RE = re.compile(r"^(\d{5})M(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$")
SOL_SECONDS = 88775.244  # mean Mars solar day in SI seconds (PDS readme: 24 h 39 min 35.244 s)
INSTRUMENT_ORDER = ["ATS", "PS", "WS", "RHS", "ANCILLARY"]


class ImportError_(Exception):
    """Raised for unrecoverable input problems (missing columns, unreadable files)."""


# --------------------------------------------------------------------------- helpers
def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise ImportError_(f"cannot read JSON {path}: {error}") from error


def _parse_utc(text: str) -> datetime:
    return datetime.fromisoformat(text.strip().replace("Z", "+00:00")).astimezone(timezone.utc)


def _fmt_utc(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def _num(value: float, digits: int = 6) -> str:
    text = repr(round(value, digits))
    return text[:-2] if text.endswith(".0") else text


def _label_times(label_path: Path) -> tuple[datetime, datetime]:
    try:
        root = ET.parse(label_path).getroot()
    except (OSError, ET.ParseError) as error:
        raise ImportError_(f"cannot parse PDS label {label_path}: {error}") from error
    found: dict[str, str] = {}
    for element in root.iter():
        tag = element.tag.split("}")[-1]
        if tag in ("start_date_time", "stop_date_time") and tag not in found and element.text:
            found[tag] = element.text.strip()
    if len(found) != 2:
        raise ImportError_(f"label {label_path} has no start/stop time")
    return _parse_utc(found["start_date_time"]), _parse_utc(found["stop_date_time"])


class TimeMap:
    """Two-point SCLK -> UTC mapping from one product's label start/stop and first/last SCLK."""

    def __init__(self, sclk_first: float, sclk_last: float, start: datetime, stop: datetime):
        self.sclk_first = sclk_first
        span = sclk_last - sclk_first
        self.scale = (stop - start).total_seconds() / span if span > 0 else 1.0
        self.start = start

    def utc(self, sclk: float) -> datetime:
        return self.start + timedelta(seconds=(sclk - self.sclk_first) * self.scale)


def _read_csv_rows(path: Path, required: list[str]) -> tuple[list[str], list[list[str]]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            header = [h.strip() for h in next(reader)]
            missing = [c for c in required if c not in header]
            if missing:
                raise ImportError_(f"{path.name} is missing mapped columns: {', '.join(missing)}")
            return header, [row for row in reader if row]
    except StopIteration as error:
        raise ImportError_(f"{path.name} is empty") from error
    except OSError as error:
        raise ImportError_(f"cannot read {path}: {error}") from error


def _to_float(text: str | None) -> float | None:
    if text is None:
        return None
    text = text.strip()
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _point_in_polygon(x: float, y: float, rings: list[list[list[float]]]) -> bool:
    inside = False
    for ring in rings:
        count = len(ring)
        for i in range(count):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % count][0], ring[(i + 1) % count][1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def _zone_for(easting: float, northing: float, zones: list[dict[str, Any]]) -> str | None:
    for zone in zones:
        geometry = zone["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        if any(_point_in_polygon(easting, northing, polygon) for polygon in polygons):
            return str(zone["id"])
    return None


# ----------------------------------------------------------------- PLACES reference
def _load_places(path: Path) -> dict[str, Any]:
    landing: dict[str, float] | None = None
    poses: list[tuple[float, int, float, float]] = []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("frame") == "SITE" and row.get("site") == "1" and landing is None:
                    landing = {"easting": float(row["easting"]), "northing": float(row["northing"])}
                if row.get("frame") == "ROVER" and row.get("sol", "").lstrip("-").isdigit() and int(row["sol"]) >= 0:
                    poses.append((float(row["sclk"]), int(row["sol"]), float(row["easting"]), float(row["northing"])))
    except OSError as error:
        raise ImportError_(f"cannot read PLACES table {path}: {error}") from error
    if landing is None or not poses:
        raise ImportError_("PLACES table has no SITE 1 landing row or no rover poses")
    poses.sort()
    return {"landing": landing, "poses": poses, "sclks": [p[0] for p in poses]}


# ------------------------------------------------------------------ main importer
def run_import(
    data_root: Path,
    output_dir: Path,
    *,
    manifest_path: Path | None = None,
    mapping_path: Path | None = None,
    places_path: Path | None = None,
    zones_path: Path | None = None,
) -> dict[str, Any]:
    manifest_path = manifest_path or data_root / "metadata" / "meda_products.json"
    mapping_path = mapping_path or data_root / "metadata" / "meda_import_mapping.json"
    places_path = places_path or (
        data_root / "raw" / "jezero" / "Martian_Map_Rover_Files" / "Martian_Map_Rover_Files" / "best_interp.csv"
    )
    zones_path = zones_path or data_root / "web" / "zones" / "jezero_zones.geojson"

    manifest = _read_json(manifest_path)
    mapping = _read_json(mapping_path)
    sentinel_min = float(mapping["sentinel_min_value"])
    decimation = int(mapping["decimation_seconds"])
    tolerance_m = float(mapping["ancillary"]["validation_tolerance_m"])
    max_gap = float(mapping["ancillary"]["max_sclk_gap_seconds"])
    places = _load_places(places_path)
    zones = _read_json(zones_path)["features"] if zones_path.exists() else []

    products = sorted(
        manifest["products"],
        key=lambda p: (p["sol"], INSTRUMENT_ORDER.index(p["instrument"]) if p["instrument"] in INSTRUMENT_ORDER else 99),
    )
    by_sol: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)
    for product in products:
        by_sol[int(product["sol"])][product["instrument"]] = product

    def product_paths(product: dict[str, Any]) -> tuple[Path, Path]:
        local = product.get("local_path")
        label = product.get("label_file")
        if not local or not label:
            raise ImportError_(f"manifest entry {product.get('product_id')} has no local_path/label_file")
        csv_path, label_path = data_root / local, data_root / label
        if not csv_path.exists():
            raise ImportError_(f"product file is missing: {csv_path}")
        return csv_path, label_path

    # ---- rover location per Sol, validated against PLACES -----------------
    anc_map = mapping["ancillary"]
    locations: dict[int, dict[str, Any]] = {}
    location_tables: dict[int, tuple[list[float], list[tuple[float, float]]]] = {}
    for sol in sorted(by_sol):
        product = by_sol[sol].get("ANCILLARY")
        info: dict[str, Any] = {"sol": sol, "status": "unavailable", "reason": "no ancillary geometry product"}
        if product is not None:
            path, _ = product_paths(product)
            cols = anc_map["columns"]
            header, rows = _read_csv_rows(path, ["SCLK", cols["x"], cols["y"]])
            xi, yi, si = header.index(cols["x"]), header.index(cols["y"]), header.index("SCLK")
            sclks: list[float] = []
            xy: list[tuple[float, float]] = []
            for row in rows:
                sclk, x, y = _to_float(row[si]), _to_float(row[xi]), _to_float(row[yi])
                if sclk is None or x is None or y is None or abs(x) >= sentinel_min or abs(y) >= sentinel_min:
                    continue
                sclks.append(sclk)
                xy.append((x, y))
            if not sclks:
                info["reason"] = "ancillary product has no valid rover position rows"
            else:
                xs, ys = sorted(p[0] for p in xy), sorted(p[1] for p in xy)
                mx, my = xs[len(xs) // 2], ys[len(ys) // 2]
                landing = places["landing"]
                easting, northing = landing["easting"] - my, landing["northing"] + mx
                idx = bisect.bisect_right(places["sclks"], sclks[0]) - 1
                prior = places["poses"][idx] if idx >= 0 else None
                in_sol = sum(1 for s in places["sclks"] if sclks[0] <= s <= sclks[-1])
                if prior is None:
                    info["reason"] = "no PLACES rover pose precedes this sol"
                else:
                    distance = math.hypot(easting - prior[2], northing - prior[3])
                    info = {
                        "sol": sol,
                        "status": "validated" if distance <= tolerance_m else "unvalidated",
                        "easting_m": round(easting, 3),
                        "northing_m": round(northing, 3),
                        "site_x_north_m_median": round(mx, 3),
                        "site_y_west_m_median": round(my, 3),
                        "position_changes_in_sol": bool(max(xs) - min(xs) > 0.5 or max(ys) - min(ys) > 0.5),
                        "places_reference": {
                            "sol": prior[1], "sclk": prior[0], "easting_m": prior[2], "northing_m": prior[3],
                        },
                        "distance_to_places_m": round(distance, 3),
                        "places_poses_within_sol": in_sol,
                        "tolerance_m": tolerance_m,
                        "jz_zone_id": _zone_for(easting, northing, zones) if distance <= tolerance_m else None,
                    }
                    if distance > tolerance_m:
                        info["reason"] = "MEDA-derived position disagrees with PLACES by more than the tolerance; location withheld"
                    location_tables[sol] = (sclks, xy)
        locations[sol] = info

    def locate(sol: int, sclk: float) -> dict[str, Any]:
        info = locations.get(sol, {})
        table = location_tables.get(sol)
        if table is None or info.get("status") != "validated":
            return {"location_status": info.get("status", "unavailable")}
        sclks, xy = table
        i = bisect.bisect_left(sclks, sclk)
        candidates = [j for j in (i - 1, i) if 0 <= j < len(sclks)]
        j = min(candidates, key=lambda k: abs(sclks[k] - sclk))
        if abs(sclks[j] - sclk) > max_gap:
            return {"location_status": "unavailable"}
        x, y = xy[j]
        landing = places["landing"]
        return {
            "location_status": "validated",
            "rover_easting_m": _num(landing["easting"] - y, 3),
            "rover_northing_m": _num(landing["northing"] + x, 3),
            "rover_site_x_north_m": _num(x, 3),
            "rover_site_y_west_m": _num(y, 3),
            "jz_zone_id": info.get("jz_zone_id") or "",
        }

    # ---- observations ------------------------------------------------------
    rows_out: list[dict[str, str]] = []
    stats: dict[tuple[int, str], dict[str, Any]] = {}
    exclusions: dict[tuple[int, str], Counter] = defaultdict(Counter)
    product_report: list[dict[str, Any]] = []
    metric_catalog: dict[str, dict[str, Any]] = {}
    last_bin: dict[tuple[int, str], int] = {}

    for product in products:
        instrument = product["instrument"]
        spec = mapping["instruments"].get(instrument)
        if spec is None and instrument != "RHS":
            continue
        csv_path, label_path = product_paths(product)
        start, stop = _label_times(label_path)
        if instrument == "RHS":
            # Excluded by policy; count the published values so the diagnostics are honest.
            excluded = next(m for m in mapping["excluded_metrics"] if m["instrument"] == "RHS")
            header, rows = _read_csv_rows(csv_path, ["SCLK", excluded["column"]])
            ci = header.index(excluded["column"])
            published = sum(1 for r in rows if (v := _to_float(r[ci])) is not None and abs(v) < sentinel_min)
            product_report.append({
                "product_id": product["product_id"], "sol": product["sol"], "instrument": instrument,
                "rows_read": len(rows), "rows_published": 0, "status": "excluded_by_policy",
                "excluded_reason": excluded["reason"], "valid_native_values_not_published": published,
            })
            continue

        required = ["SCLK", "LMST", "LTST"] + [m["column"] for m in spec["metrics"]]
        for m in spec["metrics"]:
            required += [c for c in (m.get("uncertainty_column"),) if c]
        header, rows = _read_csv_rows(csv_path, required)
        index = {name: header.index(name) for name in header}
        first, last = _to_float(rows[0][index["SCLK"]]), _to_float(rows[-1][index["SCLK"]])
        if first is None or last is None:
            raise ImportError_(f"{csv_path.name}: first/last SCLK are not numeric")
        timemap = TimeMap(first, last, start, stop)
        written = 0
        for metric in spec["metrics"]:
            metric_catalog.setdefault(metric["metric"], {
                "metric": metric["metric"], "instrument": instrument, "instrument_label": spec["label"],
                "unit": metric["unit"], "label_unit": metric["label_unit"], "description": metric["description"],
                "valid_range": metric["valid_range"], "uncertainty_unit": metric.get("uncertainty_unit"),
                "uncertainty_unit_note": metric.get("uncertainty_unit_note"),
                "source_field": metric["column"], "processing_level": product["processing_level"],
            })
        for raw in rows:
            sclk = _to_float(raw[index["SCLK"]])
            lmst = raw[index["LMST"]].strip()
            match = LMST_RE.match(lmst)
            if sclk is None or match is None:
                for metric in spec["metrics"]:
                    exclusions[(int(product["sol"]), metric["metric"])]["bad_time"] += 1
                continue
            sol = int(match.group(1))
            ltst = raw[index["LTST"]].strip()
            for metric in spec["metrics"]:
                key = (sol, metric["metric"])
                value = _to_float(raw[index[metric["column"]]])
                if value is None:
                    exclusions[key]["empty_or_non_numeric"] += 1
                    continue
                if abs(value) >= sentinel_min:
                    exclusions[key]["invalid_fill_value"] += 1
                    continue
                lo, hi = metric["valid_range"]
                if not lo <= value <= hi:
                    exclusions[key]["outside_valid_range"] += 1
                    continue
                utc = timemap.utc(sclk)
                entry = stats.setdefault(key, {"values": [], "first": None, "last": None, "minutes": set()})
                entry["values"].append(value)
                entry["minutes"].add(int(sclk // 60))
                point = (sclk, lmst, _fmt_utc(utc))
                if entry["first"] is None:
                    entry["first"] = point
                entry["last"] = point
                bin_index = int(sclk // decimation)
                if last_bin.get(key) == bin_index:
                    continue
                last_bin[key] = bin_index
                uncertainty = _to_float(raw[index[metric["uncertainty_column"]]]) if metric.get("uncertainty_column") else None
                if uncertainty is not None and abs(uncertainty) >= sentinel_min:
                    uncertainty = None
                flag_template = metric.get("quality_flag_template")
                flag = ""
                if flag_template:
                    flag = re.sub(r"\{([A-Z_]+)\}", lambda m_: raw[index[m_.group(1)]].strip() if m_.group(1) in index else "", flag_template)
                record = {
                    "source": SOURCE_NAME, "source_product_id": product["product_id"],
                    "processing_level": product["processing_level"], "observation_type": OBSERVATION_TYPE,
                    "sol": str(sol), "sclk": _num(sclk, 3), "utc_time": _fmt_utc(utc), "utc_basis": UTC_BASIS,
                    "lmst": lmst, "ltst": ltst, "metric": metric["metric"], "value": _num(value),
                    "unit": metric["unit"], "uncertainty": "" if uncertainty is None else _num(uncertainty),
                    "quality": "unflagged", "quality_flag": flag, "source_field": metric["column"],
                    "location_status": "unavailable", "rover_easting_m": "", "rover_northing_m": "",
                    "rover_site_x_north_m": "", "rover_site_y_west_m": "", "jz_zone_id": "", "is_current": "false",
                }
                record.update(locate(sol, sclk))
                rows_out.append(record)
                written += 1
        product_report.append({
            "product_id": product["product_id"], "sol": product["sol"], "instrument": instrument,
            "processing_level": product["processing_level"], "version": product["version"],
            "rows_read": len(rows), "observation_rows_written": written, "status": "imported",
            "label_start_utc": _fmt_utc(start), "label_stop_utc": _fmt_utc(stop),
            "sclk_first": first, "sclk_last": last, "sclk_drift_ppm": round((timemap.scale - 1) * 1e6, 3),
            "sha256": product.get("official_sha256"),
        })

    rows_out.sort(key=lambda r: (float(r["sclk"]), r["metric"]))

    # ---- summary ------------------------------------------------------------------
    groups = []
    for (sol, metric), entry in sorted(stats.items()):
        values = entry["values"]
        catalog = metric_catalog[metric]
        excl = dict(sorted(exclusions[(sol, metric)].items()))
        groups.append({
            "sol": sol, "metric": metric, "unit": catalog["unit"],
            "sample_count": len(values),
            "covered_minutes": len(entry["minutes"]),
            "coverage_fraction_of_sol": round(len(entry["minutes"]) * 60 / SOL_SECONDS, 4),
            "excluded_count": sum(excl.values()), "exclusion_counts": excl,
            "minimum": round(min(values), 6), "maximum": round(max(values), 6),
            "mean": round(math.fsum(values) / len(values), 6),
            "first_sclk": entry["first"][0], "first_lmst": entry["first"][1], "first_utc": entry["first"][2],
            "last_sclk": entry["last"][0], "last_lmst": entry["last"][1], "last_utc": entry["last"][2],
        })
    metrics_summary = {}
    for metric, catalog in sorted(metric_catalog.items()):
        mine = [g for g in groups if g["metric"] == metric]
        metrics_summary[metric] = {
            **catalog,
            "sols": [g["sol"] for g in mine],
            "full_resolution_sample_count": sum(g["sample_count"] for g in mine),
            "observation_rows": sum(1 for r in rows_out if r["metric"] == metric),
        }
    sols = sorted({g["sol"] for g in groups})
    summary = {
        "schema_version": "1.0",
        "available": bool(rows_out),
        "observation_type": OBSERVATION_TYPE,
        "is_current": False,
        "observation_count": len(rows_out),
        "full_resolution_sample_count": sum(g["sample_count"] for g in groups),
        "decimation": {"interval_seconds": decimation, "rule": mapping["decimation_rule"]},
        "coverage": {
            "sol_start": sols[0] if sols else None,
            "sol_end": sols[-1] if sols else None,
            "sols": sols,
            "utc_start": min((g["first_utc"] for g in groups), default=None),
            "utc_end": max((g["last_utc"] for g in groups), default=None),
            "note": "Measurements follow the MEDA duty cycle (about 12 hours per sol, even hours on even sols and odd hours on odd sols); gaps are real, not interpolated.",
        },
        "time_conventions": mapping["time"],
        "metrics": metrics_summary,
        "excluded_metrics": mapping["excluded_metrics"],
        "groups_by_sol": groups,
        "rover_location_by_sol": [locations[s] for s in sorted(locations)],
        "products": product_report,
        "provenance_ref": "data/metadata/meda_sources.json",
        "notes": [
            "Observations are historical rover-local measurements, not live weather and not valid for every JZ zone.",
            "Aggregates (groups_by_sol) are derived from all valid native samples; observation rows are a decimated subset of native samples.",
        ],
    }

    # ---- write -----------------------------------------------------------------------
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "meda_observations.csv"
    summary_path = output_dir / "meda_sol_summary.json"
    csv_text = _render_csv(rows_out)
    summary_text = json.dumps(summary, indent=2, allow_nan=False) + "\n"
    return {"csv_path": csv_path, "csv_text": csv_text, "summary_path": summary_path,
            "summary_text": summary_text, "summary": summary}


def _render_csv(rows: list[dict[str, str]]) -> str:
    import io

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=OBSERVATION_FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA_ROOT)
    parser.add_argument("--output-dir", type=Path, default=None, help="default: <data-root>/processed/environment")
    parser.add_argument("--check", action="store_true", help="do not write; fail if existing outputs differ from a fresh run")
    args = parser.parse_args(argv)
    output_dir = args.output_dir or args.data_root / "processed" / "environment"
    try:
        result = run_import(args.data_root, output_dir)
    except ImportError_ as error:
        print(f"MEDA import failed: {error}", file=sys.stderr)
        return 2
    if args.check:
        same = (
            result["csv_path"].exists() and result["summary_path"].exists()
            and result["csv_path"].read_text(encoding="utf-8") == result["csv_text"]
            and result["summary_path"].read_text(encoding="utf-8") == result["summary_text"]
        )
        print("outputs are up to date" if same else "outputs DIFFER from a fresh import")
        return 0 if same else 1
    result["csv_path"].write_text(result["csv_text"], encoding="utf-8", newline="")
    result["summary_path"].write_text(result["summary_text"], encoding="utf-8", newline="")
    summary = result["summary"]
    print(json.dumps({
        "observation_rows": summary["observation_count"],
        "full_resolution_samples": summary["full_resolution_sample_count"],
        "sols": summary["coverage"]["sols"],
        "utc_range": [summary["coverage"]["utc_start"], summary["coverage"]["utc_end"]],
        "metrics": {k: v["full_resolution_sample_count"] for k, v in summary["metrics"].items()},
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

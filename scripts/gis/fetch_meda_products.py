#!/usr/bin/env python3
"""Verify and fetch the NASA PDS MEDA products used by TerraNexis.

For every product listed in PRODUCTS this script
  1. downloads the official PDS4 XML label (small) into data/raw/meda/labels/,
  2. streams the official CSV from the PDS Atmospheres archive and records its SHA-256,
  3. compares that hash with the local copies already in data/raw/jezero/Jezero_Weather_/
     (matching by CONTENT, not by file name or folder, because some local files are
     mis-filed or carry a "(1)" suffix),
  4. saves the official CSV into data/raw/meda/products/ only when no identical local copy exists.

Result: data/metadata/meda_products.json (deterministic apart from the check timestamp,
which is excluded when the output is unchanged).

Run:  python scripts/gis/fetch_meda_products.py            (needs network)
      python scripts/gis/fetch_meda_products.py --offline  (re-index local files only)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import os

_env_root = os.environ.get("TERRANEXIS_DATA_ROOT", "").strip()
DATA_ROOT = (ROOT / _env_root).resolve() if _env_root else ROOT / "data"
LOCAL_DIR = DATA_ROOT / "raw" / "jezero" / "Jezero_Weather_"
RAW_DIR = DATA_ROOT / "raw" / "meda"
LABEL_DIR = RAW_DIR / "labels"
PRODUCT_DIR = RAW_DIR / "products"
MANIFEST = DATA_ROOT / "metadata" / "meda_products.json"

BASE = "https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda"
SOLS = (36, 37, 38, 39)

# (collection, sensor-level token, instrument, processing level, version)
PRODUCT_TYPES = [
    ("data_calibrated_env", "CAL_ATS", "ATS", "calibrated", "P01"),
    ("data_derived_env", "DER_PS", "PS", "derived", "P01"),
    ("data_derived_env", "DER_WS", "WS", "derived", "P02"),
    ("data_derived_env", "DER_RHS", "RHS", "derived", "P03"),
    ("data_derived_env", "DER_ANCILLARY", "ANCILLARY", "derived", "P03"),
]


def _stem(sol: int, token: str, version: str) -> str:
    """PDS file stem, e.g. WE__0036___________DER_PS__________________P01.

    The sensor token is padded with underscores to 43 characters before the version.
    """
    base = f"WE__{sol:04d}___________{token}"
    return base + "_" * (43 - len(base)) + version


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(url: str) -> tuple[bytes | None, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": "TerraNexis-MEDA-verify/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read(), None
    except (urllib.error.URLError, TimeoutError) as error:
        return None, str(error)


def stream_hash(url: str, save_to: Path | None) -> tuple[str | None, int, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": "TerraNexis-MEDA-verify/1.0"})
    digest = hashlib.sha256()
    size = 0
    handle = None
    try:
        if save_to is not None:
            save_to.parent.mkdir(parents=True, exist_ok=True)
            handle = save_to.open("wb")
        with urllib.request.urlopen(request, timeout=180) as response:
            for block in iter(lambda: response.read(1 << 20), b""):
                digest.update(block)
                size += len(block)
                if handle:
                    handle.write(block)
        return digest.hexdigest(), size, None
    except (urllib.error.URLError, TimeoutError) as error:
        return None, size, str(error)
    finally:
        if handle:
            handle.close()


def index_local() -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    if LOCAL_DIR.exists():
        for path in sorted(LOCAL_DIR.rglob("*.csv")):
            index.setdefault(sha256_file(path), []).append(path.relative_to(DATA_ROOT).as_posix())
    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="do not contact PDS; only re-index local files")
    args = parser.parse_args(argv)

    previous = {}
    if MANIFEST.exists():
        previous = {p["product_id"]: p for p in json.loads(MANIFEST.read_text(encoding="utf-8")).get("products", [])}
    local_index = index_local()
    products = []
    problems = 0
    for collection, token, instrument, level, version in PRODUCT_TYPES:
        for sol in SOLS:
            stem = _stem(sol, token, version)
            folder = f"{BASE}/{collection}/sol_0000_0089/sol_{sol:04d}"
            csv_url, label_url = f"{folder}/{stem}.CSV", f"{folder}/{stem}.xml"
            entry = {
                "product_id": stem,
                "instrument": instrument,
                "processing_level": level,
                "sol": sol,
                "version": version,
                "official_csv_url": csv_url,
                "official_label_url": label_url,
            }
            if args.offline:
                entry.update(previous.get(stem, {}))
                products.append(entry)
                continue
            label_bytes, error = fetch(label_url)
            if label_bytes is None:
                entry["verification"] = f"label download failed: {error}"
                problems += 1
                products.append(entry)
                continue
            LABEL_DIR.mkdir(parents=True, exist_ok=True)
            (LABEL_DIR / f"{stem}.xml").write_bytes(label_bytes)
            entry["label_file"] = (LABEL_DIR / f"{stem}.xml").relative_to(DATA_ROOT).as_posix()
            entry["label_sha256"] = hashlib.sha256(label_bytes).hexdigest()
            digest, size, error = stream_hash(csv_url, None)
            if digest is None:
                entry["verification"] = f"csv download failed: {error}"
                problems += 1
                products.append(entry)
                continue
            entry["official_sha256"] = digest
            entry["official_size_bytes"] = size
            if digest in local_index:
                entry["local_files"] = local_index[digest]
                entry["local_path"] = local_index[digest][0]
                entry["verification"] = "local copy is byte-identical to the official PDS product"
            else:
                target = PRODUCT_DIR / f"{stem}.csv"
                digest2, _, error = stream_hash(csv_url, target)
                entry["local_path"] = target.relative_to(DATA_ROOT).as_posix()
                entry["local_files"] = [entry["local_path"]]
                entry["verification"] = (
                    "no identical local copy existed; official product downloaded into data/raw/meda/products/"
                    if digest2 == digest
                    else f"download hash mismatch: {error}"
                )
                if digest2 != digest:
                    problems += 1
            print(f"{stem}: {entry['verification']}")
            products.append(entry)

    document = {
        "schema_version": "1.0",
        "archive": "urn:nasa:pds:mars2020_meda",
        "archive_base_url": BASE,
        "products": products,
    }
    if not args.offline:
        document["checked_at_utc"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST} ({len(products)} products, {problems} problems)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

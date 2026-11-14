"""Step 3: lightweight, browser-ready layers + vectors + provenance metadata.

Outputs
  web_layers/elevation_preview.png, slope_preview.png, terrain_preview.png, layer_manifest.json
  vectors/jezero_zones.geojson               (projected metres, source CRS - authoritative)
  vectors/jezero_zones_mars_lonlat.geojson   (Mars 2000 sphere degrees, planetocentric, east-positive)
  vectors/jezero_zones_preview_pixels.json   (pixel coords in the preview PNGs + SVG points strings)
  metadata/spatial_reference.json, metadata/data_sources.json
"""
from __future__ import annotations

import numpy as np
from matplotlib import colormaps
from osgeo import gdal
from PIL import Image
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

from common import (MARS_GEOG_PROJ4, MARS_RADIUS_M, META, OUT, RAST, ROOT, SRC_COST, SRC_DEM,
                    SRC_QGZ, SRC_SLOPE, SRC_ZONE_META, SRC_ZONES, STATS, VECT, WEB, load_config,
                    now_iso, read_json, rel, resolve_recorded, write_json)

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_PAM_ENABLED", "NO")  # keep source rasters untouched
CFG = load_config()
F = int(CFG["preview_downsample_factor"])
SLOPE_COLORS = {"gentle": (46, 160, 67), "moderate": (240, 180, 40), "steep": (210, 50, 50)}
ELEV_CMAP = "terrain"


def resample(path, w, h, alg, out_type=gdal.GDT_Float32):
    ds = gdal.Translate("", str(path), format="MEM", width=w, height=h, resampleAlg=alg,
                        outputType=out_type)
    b = ds.GetRasterBand(1)
    a = b.ReadAsArray().astype(np.float64)
    nd = b.GetNoDataValue()
    valid = np.isfinite(a) if nd is None else (np.isfinite(a) & (a != np.float64(np.float32(nd))))
    return a, valid


def main():
    proc = read_json(META / "processing_metadata.json")
    slope_path = resolve_recorded(proc["slope_used"])
    hill_path = RAST / "hillshade.tif"
    src = gdal.Open(str(SRC_DEM))
    gt = src.GetGeoTransform(); W, H = src.RasterXSize, src.RasterYSize
    xmin, ymax = gt[0], gt[3]; xmax, ymin = xmin + W * gt[1], ymax + H * gt[5]
    pw, ph = -(-W // F), -(-H // F)
    proj = CRS.from_wkt(src.GetProjection())
    geog = CRS.from_proj4(MARS_GEOG_PROJ4)
    to_ll = Transformer.from_crs(proj, geog, always_xy=True)
    lon_min, lat_min = to_ll.transform(xmin, ymin); lon_max, lat_max = to_ll.transform(xmax, ymax)

    # ---- elevation --------------------------------------------------------
    dem, dv = resample(SRC_DEM, pw, ph, "average")
    stats = read_json(STATS / "zone_terrain_statistics.json")
    e_lo, e_hi = np.percentile(dem[dv], [1, 99])
    norm = np.clip((dem - e_lo) / (e_hi - e_lo), 0, 1)
    rgba = (colormaps[ELEV_CMAP](norm) * 255).astype(np.uint8)
    rgba[~dv, 3] = 0
    Image.fromarray(rgba, "RGBA").save(WEB / "elevation_preview.png", optimize=True)

    # ---- terrain (hillshade x elevation tint) -----------------------------
    hs, hv = resample(hill_path, pw, ph, "average")
    shade = np.clip(hs / 255.0, 0, 1)[..., None]
    terr = rgba.astype(np.float64)
    terr[..., :3] = terr[..., :3] * (0.35 + 0.65 * shade)
    terr[..., 3] = np.where(dv & hv, 255, 0)
    Image.fromarray(terr.astype(np.uint8), "RGBA").save(WEB / "terrain_preview.png", optimize=True)
    gray = np.dstack([np.clip(hs, 0, 255)] * 3 + [np.where(hv, 255, 0)]).astype(np.uint8)
    Image.fromarray(gray, "RGBA").save(WEB / "hillshade_preview.png", optimize=True)

    # ---- slope classes: classify at full 20 m resolution, then MODE downsample
    sds = gdal.Open(str(slope_path)); sb = sds.GetRasterBand(1)
    s = sb.ReadAsArray().astype(np.float64); snd = sb.GetNoDataValue()
    sv = np.isfinite(s) & (s != np.float64(np.float32(snd)) if snd is not None else True)
    cls = np.zeros(s.shape, np.uint8)
    classes = CFG["slope_classes_degrees"]
    for i, c in enumerate(classes, start=1):
        m = sv.copy()
        if c["min_exclusive"] is not None: m &= s > c["min_exclusive"]
        if c["max_inclusive"] is not None: m &= s <= c["max_inclusive"]
        cls[m] = i
    mem = gdal.GetDriverByName("MEM").Create("", W, H, 1, gdal.GDT_Byte)
    mem.SetGeoTransform(gt); mem.SetProjection(src.GetProjection())
    mem.GetRasterBand(1).WriteArray(cls); mem.GetRasterBand(1).SetNoDataValue(0)
    small = gdal.Translate("", mem, format="MEM", width=pw, height=ph, resampleAlg="mode").ReadAsArray()
    srgba = np.zeros((ph, pw, 4), np.uint8)
    for i, c in enumerate(classes, start=1):
        srgba[small == i] = (*SLOPE_COLORS.get(c["name"], (128, 128, 128)), 255)
    Image.fromarray(srgba, "RGBA").save(WEB / "slope_preview.png", optimize=True)
    del s, cls, mem

    # ---- vectors ------------------------------------------------------------
    zsrc = read_json(SRC_ZONES)
    crs_note = ("Coordinates are Mars projected metres in Jezero_Crater_Projection "
                "(+proj=eqc +lat_ts=18.4663 +lon_0=0 +R=3396190). NOT Earth lon/lat; do not load as EPSG:4326.")
    proj_feats, ll_feats, px_zones = [], [], []
    def to_px(x, y, z=None):
        return ((x - xmin) / (xmax - xmin) * pw, (ymax - y) / (ymax - ymin) * ph)
    for f in zsrc["features"]:
        zid = f["properties"]["area_id"]; g = shape(f["geometry"])
        props = dict(zone_id=zid, statistics_ref=f"data/web/statistics/zone_terrain_statistics.json#{zid}")
        proj_feats.append(dict(type="Feature", id=zid, properties=props, geometry=mapping(g)))
        gll = shp_transform(lambda x, y, z=None: to_ll.transform(x, y), g)
        ll_feats.append(dict(type="Feature", id=zid, properties=props, geometry=mapping(gll)))
        gpx = shp_transform(to_px, g)
        rings = [[[round(x, 2), round(y, 2)] for x, y in poly.exterior.coords]
                 for poly in getattr(gpx, "geoms", [gpx])]
        c = gpx.centroid
        px_zones.append(dict(zone_id=zid, rings=rings,
                             svg_points=[" ".join(f"{x},{y}" for x, y in r[:-1]) for r in rings],
                             center=[round(c.x, 2), round(c.y, 2)]))

    def fc(feats, name, crs_name, note):
        return dict(type="FeatureCollection", name=name,
                    crs=dict(type="name", properties=dict(name=crs_name)),
                    coordinate_note=note, features=feats)
    write_json(VECT / "jezero_zones.geojson",
               fc(proj_feats, "jezero_zones_projected", "Jezero_Crater_Projection (Mars 2000 sphere, eqc lat_ts=18.4663)", crs_note))
    write_json(VECT / "jezero_zones_mars_lonlat.geojson",
               fc(ll_feats, "jezero_zones_mars_lonlat", "Mars 2000 sphere geographic (IAU_2015:49900 equivalent)",
                  "Mars longitude/latitude in degrees: planetocentric latitude, east-positive longitude (-180..180), "
                  "sphere R=3396190 m. Mars coordinates, NOT Earth WGS84."))
    write_json(VECT / "jezero_zones_preview_pixels.json", dict(
        coordinate_space=f"Pixel coordinates of the {pw}x{ph} preview PNGs in data/web/layers/ (origin top-left, y down)",
        width=pw, height=ph,
        transform="px = (x - xmin) / (xmax - xmin) * width ; py = (ymax - y) / (ymax - ymin) * height (x,y in projected metres)",
        projected_bounds=dict(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax), zones=px_zones))

    # ---- manifest -----------------------------------------------------------
    bounds = dict(projected_m=dict(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax),
                  mars_lon_lat_deg=dict(west=round(lon_min, 6), south=round(lat_min, 6),
                                        east=round(lon_max, 6), north=round(lat_max, 6)))
    common = dict(bounds=bounds, crs="Jezero_Crater_Projection", width_px=pw, height_px=ph,
                  display_pixel_size_m=gt[1] * F, source_pixel_size_m=gt[1],
                  note="Display-only RGBA PNG; transparent = NoData. Equidistant cylindrical, so the image is also a "
                       "plain equirectangular image in Mars lon/lat between the given bounds.")
    layers = [
        dict(id="terrain", name="Terrain (hillshade + elevation tint)", path="data/web/layers/terrain_preview.png",
             source=[rel(SRC_DEM), rel(hill_path)], legend=dict(type="continuous", colormap=ELEV_CMAP,
             unit="m", min=round(float(e_lo), 1), max=round(float(e_hi), 1), note="1st-99th percentile stretch"), **common),
        dict(id="elevation", name="Elevation (CTX DEM)", path="data/web/layers/elevation_preview.png", source=[rel(SRC_DEM)],
             legend=dict(type="continuous", colormap=ELEV_CMAP, unit="m", min=round(float(e_lo), 1), max=round(float(e_hi), 1),
                         stops=[dict(value=round(float(e_lo + t * (e_hi - e_lo)), 1),
                                     color="#%02x%02x%02x" % tuple(int(255 * v) for v in colormaps[ELEV_CMAP](t)[:3]))
                                for t in (0, .25, .5, .75, 1)]),
             resampling="average of 4x4 source pixels", **common),
        dict(id="slope", name="Slope classes", path="data/web/layers/slope_preview.png", source=[rel(slope_path)],
             legend=dict(type="categorical", unit="degree",
                         classes=[dict(name=c["name"], min_exclusive=c["min_exclusive"], max_inclusive=c["max_inclusive"],
                                       color="#%02x%02x%02x" % SLOPE_COLORS[c["name"]]) for c in classes],
                         note="Analysis categories, not validated safety thresholds"),
             resampling="classified at 20 m, then majority (mode) of 4x4 pixels", **common),
        dict(id="hillshade", name="Hillshade", path="data/web/layers/hillshade_preview.png", source=[rel(hill_path)],
             legend=dict(type="continuous", colormap="gray", unit="relative illumination 0-255",
                         note="Azimuth 315, altitude 45"), **common),
    ]
    vectors = [dict(id="zones_projected", path="data/web/zones/jezero_zones.geojson", crs="Jezero_Crater_Projection", units="m"),
               dict(id="zones_mars_lonlat", path="data/web/zones/jezero_zones_mars_lonlat.geojson",
                    crs="Mars 2000 sphere geographic", units="degree"),
               dict(id="zones_preview_pixels", path="data/web/zones/jezero_zones_preview_pixels.json",
                    crs="preview image pixels", units="px")]
    write_json(WEB / "layer_manifest.json", dict(generated=now_iso(), raster_layers=layers, vector_layers=vectors,
                                                 statistics=["data/web/statistics/zone_terrain_statistics.json",
                                                             "data/web/statistics/zone_terrain_statistics.csv"]))

    # ---- spatial reference ----------------------------------------------------
    write_json(META / "spatial_reference.json", dict(
        body="Mars", reference_surface="Mars 2000 sphere (IAU 2000), radius 3396190 m (ESRI 106971 / IAU_2015:49900)",
        projection="Equidistant Cylindrical (Plate Carree), standard parallel 18.4663 N, central meridian 0",
        name="Jezero_Crater_Projection", wkt=proj.to_wkt(),
        proj4="+proj=eqc +lat_ts=18.4663 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
        longitude_convention="East-positive, -180..180 (study area ~77.0E-78.6E)",
        latitude_type="Planetocentric (identical to planetographic on a sphere)",
        horizontal_units="metre", vertical_units="metre",
        vertical_reference="DEM heights relative to the Mars 2000 sphere / areoid convention used by the USGS product "
                           "(USGS states the CTX DEMs were vertically tied to MOLA). Not independently re-verified here.",
        scale_note="In eqc, east-west scale is exact only at 18.4663 N; within this DEM (17.58-19.29 N) the E-W scale "
                   "factor is within about +/-1%. Slope uses the nominal 20 m spacing (error < ~1% in gradient). Areas "
                   "are given both planar-projected and on the sphere (geodesic).",
        dem_extent=bounds, dem_size_px=[W, H], dem_pixel_size_m=[gt[1], gt[5]],
        zones_crs="Same as DEM (verified: identical WKT in jezero_dataset_metadata.json; coordinates fall within DEM extent)",
        earth_crs_used=False))

    # ---- data sources / provenance -------------------------------------------
    write_json(META / "data_sources.json", dict(generated=now_iso(), datasets=[
        dict(id="ctx_dem", role="original", file=rel(SRC_DEM), source_agency="USGS Astrogeology Science Center / NASA",
             product_name="Mars 2020 Science Investigation CTX DEM Mosaic (M20_JezeroCrater_CTXDEM_20m)",
             source_url="https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic",
             catalog_url="https://catalog.data.gov/dataset/context-camera-digital-terrain-model-mosaic-for-mars-2020-terrain-relative-navigation",
             publication_date="2021-10-14 (USGS product page)", instrument="MRO Context Camera (CTX)",
             resolution_m=20, crs="Jezero_Crater_Projection", processing="Original, unmodified",
             limitations="20 m posting; cannot resolve boulders or sub-pixel roughness; stereo artefacts possible near steep walls",
             usage="USGS/NASA planetary data, public domain; cite USGS Astrogeology and the CTX team (Malin et al. 2007)",
             verification="Filename, extent (Jezero), size and CRS match the USGS product; checksum vs. USGS server not compared"),
        dict(id="slope", role="derived (existing, validated)", file=rel(slope_path), source_agency="TerraNexis team (derived)",
             product_name="Jezero_Slope", processing=proc["slope_validation"]["method"] + "; bit-identical to independent recomputation",
             resolution_m=20, crs="Jezero_Crater_Projection", units="degree"),
        dict(id="hillshade", role="derived (new)", file=rel(hill_path), source_agency="TerraNexis Phase 1 (derived)",
             processing=proc["hillshade"]["method"], resolution_m=20, crs="Jezero_Crater_Projection", usage="display only"),
        dict(id="terrain_cost", role="derived (prototype, not used)", file=rel(SRC_COST),
             processing="Slope reclassified to costs 1/2/4/8/100 (see jezero_dataset_metadata.json)",
             limitations="Heuristic prototype; not a measurement"),
        dict(id="zones", role="derived (project-defined study zones)", file=rel(SRC_ZONES),
             source_agency="TerraNexis team", product_name="Jezero final repaired zones JZ-01..JZ-08",
             origin="Exported from Jezero_Final_Terrain_Stats.gpkg (not present in this workspace)",
             limitations="Prototype study regions, not NASA hazard zones; geometry was reconstructed/repaired per original metadata"),
        dict(id="ctx_orthomosaic", role="NOT DOWNLOADED (recommended)", source_agency="USGS Astrogeology",
             product_name="M20_JezeroCrater_CTXortho_mosaic_5m.tif (companion orthomosaic to the CTX DEM)",
             source_url="https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic",
             resolution_m=5, note="Large file; download only after confirming need. Hillshade used as basemap meanwhile."),
        dict(id="geologic_map", role="NOT PREPARED (optional)", source_agency="USGS",
             product_name="SIM 3464 Geologic Map of Jezero Crater and the Nili Planum Region, Mars (Sun & Stack 2020)",
             source_url="https://pubs.usgs.gov/publication/sim3464", usage="Public domain",
             note="Distributed as ~349 MB Esri file geodatabase in a different projection; needs reprojection to Jezero_Crater_Projection"),
        dict(id="m20_places", role="present, not used in Phase 1", source_agency="NASA PDS (Mars 2020 PLACES)",
             files=["data/raw/jezero/Martian_Map_Rover_Files/*", "data/raw/jezero/Perseverance_Places/*", "data/raw/jezero/NASADataSearch/*"],
             product_name="urn:nasa:pds:mars2020_rover_places (best_interp, best_tactical, m20_orbital_dem/map labels)",
             note="Rover localization tables; the m20_orbital_dem.img/m20_orbital_map.img data files referenced by the labels are not present"),
    ]))
    print(f"previews {pw}x{ph}; zones exported: {len(proj_feats)}")


if __name__ == "__main__":
    main()

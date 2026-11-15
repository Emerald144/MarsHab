// Real Jezero Crater Phase 1 data (NASA/USGS-derived). Loaded at runtime from
// /jezero/* (public/jezero/, copied from data/web/ and data/metadata/ by
// scripts/gis — see docs/team/INTEGRATION_GUIDE.md). Completely separate from
// the illustrative demo zones (A-12..A-19) in mission-data.ts: never mix a
// JZ-xx id with an A-xx id or vice versa.
import { useQuery } from "@tanstack/react-query";

export type JezeroZoneId = `JZ-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export type RealTerrainLayerId = "terrain" | "elevation" | "slope" | "hillshade" | "ctx" | "constraints";

export type RasterLayerManifestEntry = {
  id: RealTerrainLayerId;
  name: string;
  path: string;
  source: string[];
  legend: Record<string, unknown>;
  bounds: {
    projected_m: { xmin: number; ymin: number; xmax: number; ymax: number };
    mars_lon_lat_deg: { west: number; south: number; east: number; north: number };
  };
  crs: string;
  width_px: number;
  height_px: number;
  display_pixel_size_m: number;
  source_pixel_size_m: number;
  note?: string;
  resampling?: string;
  source_crs?: string;
  source_transform?: number[];
  source_sha256?: string;
  coverage_preview_px?: { x: number; y: number; width: number; height: number };
  coverage_fraction?: number;
};

type LayerManifest = {
  generated: string;
  raster_layers: RasterLayerManifestEntry[];
};

type PreviewPixelsFile = {
  width: number;
  height: number;
  coordinate_space: string;
  zones: { zone_id: JezeroZoneId; svg_points: string[]; center: [number, number] }[];
};

type ElevationStats = {
  coverage_percent: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  range: number;
};

type SlopeStats = {
  coverage_percent: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p90: number;
  p99: number;
};

type SlopeClassPercent = { gentle: number; moderate: number; steep: number };

type TerrainScreening = {
  dominant_slope_class: "gentle" | "moderate" | "steep";
  /** HEURISTIC, not validated: 100*(f_gentle + 0.5*f_moderate); null if coverage < 90%. */
  heuristic_terrain_index: number | null;
  heuristic_terrain_index_note: string;
};

type StatisticsFile = {
  generated: string;
  zonal_method: string;
  disclaimer: string;
  zones: {
    zone_id: JezeroZoneId;
    area_km2_spherical: number;
    centroid_lon_lat_deg: [number, number];
    elevation_m: ElevationStats;
    slope_deg: SlopeStats;
    slope_class_percent: SlopeClassPercent;
    terrain_screening: TerrainScreening;
    data_quality_flags: string[];
    sources: Record<string, string>;
  }[];
};

/** Real-data terrain "factor" — the only factor with an actual measurement for JZ zones. */
export type RealZoneFactors = {
  terrain: number | null; // heuristic_terrain_index; null if not available
  resource: null;
  access: null;
  env: null;
  science: null;
};

export const REAL_FACTOR_LABELS: Record<keyof RealZoneFactors, string> = {
  terrain: "Terrain (heuristic, from real slope data)",
  resource: "Resource Access",
  access: "Accessibility",
  env: "Environmental Risk",
  science: "Science Value",
};

export type RealZone = {
  kind: "real";
  id: JezeroZoneId;
  svgPoints: string[];
  center: [number, number];
  areaKm2: number;
  centroidLonLat: [number, number];
  elevation: ElevationStats;
  slope: SlopeStats;
  slopeClassPercent: SlopeClassPercent;
  terrainScreening: TerrainScreening;
  dataQualityFlags: string[];
  sources: Record<string, string>;
  factors: RealZoneFactors;
};

export type RealTerrainDataset = {
  roverTrack?: { points: { easting: number; northing: number; sol: number }[]; crs: string; source: string } | undefined;
  width: number;
  height: number;
  zones: RealZone[];
  layers: RasterLayerManifestEntry[];
};

/**
 * Terrain-only, partial score: renormalized average of the *available* factors.
 * For JZ zones today that is only `terrain`. Never a full survival score —
 * callers must label results "Terrain-only / Partial / Not a validated safety
 * classification" and must not compare it to the demo score() output.
 */
export function partialTerrainScore(factors: RealZoneFactors): number | null {
  const entries = Object.entries(factors) as [keyof RealZoneFactors, number | null][];
  const available = entries.filter(([, v]) => v !== null) as [keyof RealZoneFactors, number][];
  if (available.length === 0) return null;
  const sum = available.reduce((acc, [, v]) => acc + v, 0);
  return Math.round(sum / available.length);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function loadRealTerrainDataset(): Promise<RealTerrainDataset> {
  const [pixels, stats, manifest, roverTrack] = await Promise.all([
    fetchJson<PreviewPixelsFile>("/jezero/zones_preview_pixels.json"),
    fetchJson<StatisticsFile>("/jezero/zone_terrain_statistics.json"),
    fetchJson<LayerManifest>("/jezero/layer_manifest.json"),
    fetchJson<NonNullable<RealTerrainDataset["roverTrack"]>>("/jezero/rover_track.json").catch(() => undefined),
  ]);

  const statsByZone = new Map(stats.zones.map((z) => [z.zone_id, z]));

  const zones: RealZone[] = pixels.zones.map((geom) => {
    const s = statsByZone.get(geom.zone_id);
    if (!s) throw new Error(`No statistics for zone ${geom.zone_id}`);
    const terrainIndex = s.terrain_screening.heuristic_terrain_index;
    return {
      kind: "real",
      id: geom.zone_id,
      svgPoints: geom.svg_points,
      center: geom.center,
      areaKm2: s.area_km2_spherical,
      centroidLonLat: s.centroid_lon_lat_deg,
      elevation: s.elevation_m,
      slope: s.slope_deg,
      slopeClassPercent: s.slope_class_percent,
      terrainScreening: s.terrain_screening,
      dataQualityFlags: s.data_quality_flags,
      sources: s.sources,
      factors: {
        terrain: terrainIndex,
        resource: null,
        access: null,
        env: null,
        science: null,
      },
    };
  });

  const basis = manifest.raster_layers.find((layer) => layer.id === "terrain");
  const validTrack = roverTrack?.crs === basis?.crs && roverTrack?.points?.every(
    (point) => [point.easting, point.northing, point.sol].every(Number.isFinite),
  ) ? roverTrack : undefined;
  return { width: pixels.width, height: pixels.height, zones, layers: manifest.raster_layers, roverTrack: validTrack };
}

export function useRealTerrainDataset() {
  return useQuery({
    queryKey: ["jezero-real-terrain"],
    queryFn: loadRealTerrainDataset,
    staleTime: Infinity,
  });
}

export function layerImageUrl(layer: RasterLayerManifestEntry): string {
  // data/web/layers/<file>.png -> /jezero/layers/<file>.png
  const file = layer.path.split("/").pop();
  return `/jezero/layers/${file}`;
}

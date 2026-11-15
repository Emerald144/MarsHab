import type { RasterLayerManifestEntry, RealZone } from "./jezero-real-data";

export type RealBasemap = "terrain" | "elevation" | "hillshade" | "ctx";
export type RealMapLayers = {
  basemap: RealBasemap;
  zones: boolean;
  slope: boolean;
  suitability: boolean;
  constraints: boolean;
  rover: boolean;
  slopeOpacity?: number;
  constraintsOpacity?: number;
};
export const DEFAULT_REAL_MAP_LAYERS: RealMapLayers = {
  basemap: "terrain",
  zones: true,
  slope: false,
  suitability: false,
  constraints: false,
  rover: false,
  slopeOpacity: 0.55,
  constraintsOpacity: 0.85,
};

/** Whitelist current preferences: old resources/science keys cannot revive controls. */
export function normalizeRealMapLayers(value: Partial<RealMapLayers>): RealMapLayers {
  const opacity = (v: number | undefined, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  return {
    basemap: ["terrain", "elevation", "hillshade", "ctx"].includes(value.basemap ?? "")
      ? value.basemap!
      : "terrain",
    zones: value.zones ?? true,
    slope: value.slope ?? false,
    suitability: value.suitability ?? false,
    constraints: value.constraints ?? false,
    rover: value.rover ?? false,
    slopeOpacity: opacity(value.slopeOpacity, 0.55),
    constraintsOpacity: opacity(value.constraintsOpacity, 0.85),
  };
}

/** Only render a registered preview on this canvas, never a guessed image fit. */
export function alignedLayer(
  layer: RasterLayerManifestEntry,
  basis: RasterLayerManifestEntry,
  width: number,
  height: number,
) {
  return (
    layer.crs === basis.crs &&
    layer.width_px === width &&
    layer.height_px === height &&
    (["xmin", "xmax", "ymin", "ymax"] as const).every((key) => {
      const a = layer.bounds.projected_m[key],
        b = basis.bounds.projected_m[key];
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6;
    })
  );
}

/** Current documented slope-only index, already calculated in zone statistics. */
export function terrainIndex(zone: RealZone): number | null {
  const index = zone.terrainScreening.heuristic_terrain_index;
  return typeof index === "number" && Number.isFinite(index) ? index : null;
}
export function terrainIndexColor(index: number | null) {
  // Continuous display ramp only, no invented high/moderate/safety thresholds.
  return index === null ? "#94a3b8" : `hsl(${Math.max(0, Math.min(100, index)) * 1.2} 65% 45%)`;
}

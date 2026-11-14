// Client for the real FastAPI terrain-routing backend (backend/app/missions.py).
// All numbers here are computed server-side from the validated DEM/slope
// rasters and the Perseverance rover's verified Sol 0 landing telemetry —
// nothing in this file invents a measurement. See docs/team/INTEGRATION_GUIDE.md.
import { useMutation, useQuery } from "@tanstack/react-query";
import type { JezeroZoneId } from "./jezero-real-data";

const API_BASE = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:8000";

export type MarsPoint = { easting: number; northing: number };

export type RouteFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: {
    mode: "shortest" | "terrain_aware";
    algorithm: string;
    assumptions: string[];
    distance_m: number;
    distance_km: number;
    elevation_gain_m: number;
    elevation_loss_m: number;
    cumulative_terrain_cost: number;
    mean_slope_degrees: number;
    max_slope_degrees: number;
    slope_exposure_fraction_above_10deg: number;
    estimated_one_way_hours: number;
    estimated_total_eva_hours: number;
    eva_limit_hours: number | null;
    passes_demo_time_assumptions: boolean | null;
    grid_resolution_m: [number, number];
    simulated_closure_count: number;
    endpoint_snapped_to_traversable_cell: boolean;
    disclaimer: string;
  };
};

export type RouteOutcome = { available: true; route: RouteFeature } | { available: false; reason: string };

export type MissionBase = {
  easting: number;
  northing: number;
  longitude_deg: number;
  latitude_deg: number;
  label: string;
  source: string;
  note: string;
};

export type Feasibility = {
  basis_route: "shortest" | "terrain_aware";
  estimated_outbound_hours: number;
  estimated_return_hours: number;
  activity_hours: number;
  buffer_hours: number;
  estimated_total_hours: number;
  eva_limit_hours: number | null;
  remaining_eva_hours: number | null;
  feasible: boolean | null;
};

export type MissionPlan = {
  base: MissionBase;
  destination_zone_id: JezeroZoneId;
  destination_point: MarsPoint;
  routes: {
    A: { name: "Shortest Distance" } & RouteOutcome;
    B: { name: "Terrain-Aware" } & RouteOutcome;
    C: { name: "Science Priority"; available: false; reason: string };
  };
  feasibility: Feasibility | null;
};

export type SimulatedClosure = { center: MarsPoint; radius_m: number };

export type MissionPlanInput = {
  destinationZoneId: JezeroZoneId;
  evaHours?: number;
  scienceHours?: number;
  bufferHours?: number;
  walkingSpeedMPerHour?: number;
  closures?: SimulatedClosure[];
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed: HTTP ${res.status} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function planMission(input: MissionPlanInput): Promise<MissionPlan> {
  return postJson<MissionPlan>("/api/v1/missions/plan", {
    destination_zone_id: input.destinationZoneId,
    eva_hours: input.evaHours ?? null,
    science_hours: input.scienceHours ?? 0,
    buffer_hours: input.bufferHours ?? 0.5,
    walking_speed_m_per_hour: input.walkingSpeedMPerHour ?? 1000,
    closures: (input.closures ?? []).map((c) => ({ center: c.center, radius_m: c.radius_m })),
  });
}

export function emergencyReturn(current: MarsPoint, evaHours?: number): Promise<{ base: MissionBase; current: MarsPoint } & RouteOutcome> {
  return postJson("/api/v1/missions/emergency-return", {
    current,
    eva_hours: evaHours ?? null,
  });
}

export function useMissionBase() {
  return useQuery({ queryKey: ["mission-base"], queryFn: () => getJson<MissionBase>("/api/v1/jezero/base"), staleTime: Infinity });
}

export function useMissionPlanMutation() {
  return useMutation({ mutationFn: planMission });
}

export function useMissionPlanQuery(input: MissionPlanInput, enabled = true) {
  return useQuery({
    queryKey: [
      "mission-plan",
      input.destinationZoneId,
      input.evaHours,
      input.scienceHours,
      input.bufferHours,
      input.walkingSpeedMPerHour,
      input.closures,
    ],
    queryFn: () => planMission(input),
    enabled,
  });
}

export function useEmergencyReturnMutation() {
  return useMutation({ mutationFn: ({ current, evaHours }: { current: MarsPoint; evaHours?: number }) => emergencyReturn(current, evaHours) });
}

/** Linear Mars-projected-metres -> preview-pixel transform, per docs/team/INTEGRATION_GUIDE.md #Map-space transform. */
export function projectedToPixel(
  point: MarsPoint,
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number },
  width: number,
  height: number,
): [number, number] {
  const px = ((point.easting - bounds.xmin) / (bounds.xmax - bounds.xmin)) * width;
  const py = ((bounds.ymax - point.northing) / (bounds.ymax - bounds.ymin)) * height;
  return [px, py];
}

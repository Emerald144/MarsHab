// Client for the real FastAPI terrain-routing backend (backend/app/missions.py).
// All numbers here are computed server-side from the validated DEM/slope
// rasters and the Perseverance rover's verified Sol 0 landing telemetry —
// nothing in this file invents a measurement. See docs/team/INTEGRATION_GUIDE.md.
import { useMutation, useQuery } from "@tanstack/react-query";
import type { JezeroZoneId } from "./jezero-real-data";
import { terrainJson } from "./terrain-http";
import { validBase, validEmergency, validPlan } from "./terrain-contract";

const queryOptions = { retry: false, refetchOnWindowFocus: false } as const;

export type MarsPoint = { easting: number; northing: number };

export type RouteFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: {
    mode: "shortest" | "terrain_aware" | "science_priority";
    algorithm: string;
    assumptions: string[];
    distance_m: number;
    distance_km: number;
    elevation_gain_m: number;
    elevation_loss_m: number;
    cumulative_terrain_cost: number;
    mean_slope_degrees: number;
    max_slope_degrees: number;
    slope_exposure_fraction_above_10deg?: number;
    estimated_one_way_hours: number;
    estimated_total_eva_hours: number;
    eva_limit_hours: number | null;
    passes_demo_time_assumptions: boolean | null;
    grid_resolution_m: [number, number];
    simulated_closure_count?: number;
    endpoint_snapped_to_traversable_cell: boolean;
    disclaimer: string;
    /** Only present on Route C: the two legs (base→waypoint, waypoint→destination) that were joined. */
    legs?: { base_to_waypoint: RouteFeature; waypoint_to_destination: RouteFeature };
  };
};

export type RouteOutcome = { available: true; route: RouteFeature } | { available: false; reason: string };

export type ScienceWaypointLocation = {
  x_m: number | null;
  y_m: number | null;
  crs: string | null;
  mars_lon_deg: number | null;
  mars_lat_deg: number | null;
  location_verified: boolean;
};

/** A verified science catalog waypoint, as attached to an available Route C. */
export type ScienceRouteWaypoint = {
  id: string;
  name: string;
  kind: string;
  evidence_level: string;
  location: ScienceWaypointLocation;
  source_id: string;
  jz_zone_ids: string[];
  limitations: string[];
};

export type ScienceRouteOutcome =
  | { available: true; route: RouteFeature; waypoint: ScienceRouteWaypoint; feasibility: Feasibility; resource_assessment: ResourceAssessment }
  | { available: false; reason: string };

/** Full science catalog record from GET /api/science/targets (not every record is route-eligible). */
export type ScienceCatalogTarget = {
  id: string;
  name: string;
  kind: string;
  location: ScienceWaypointLocation;
  geologic_unit_id: string | null;
  jz_zone_ids: string[];
  description: string;
  source_id: string;
  evidence_level: string;
  route_waypoint_eligible: boolean;
  is_historical: boolean;
  limitations?: string[];
};

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
  basis_route: "shortest" | "terrain_aware" | "science_priority";
  estimated_outbound_hours: number;
  estimated_return_hours: number;
  activity_hours: number;
  buffer_hours: number;
  estimated_total_hours: number;
  eva_limit_hours: number | null;
  remaining_eva_hours: number | null;
  time_feasible: boolean | null;
  resource_feasible: boolean | null;
  warnings: string[];
  feasible: boolean | null;
};

export type ResourceAssessment = {
  available: boolean;
  model: string;
  budget_percent: number | null;
  reserve_percent: number | null;
  reserved_percent: number | null;
  estimated_use_percent: number | null;
  remaining_after_reserve_percent: number | null;
  consumption_rate_percent_per_hour: number | null;
  modeled_hours: number | null;
  feasible: boolean | null;
  warning_level: "ok" | "low" | "insufficient" | "unavailable";
  warnings: string[];
  assumptions: string[];
};

export type MissionPlan = {
  base: MissionBase;
  destination_zone_id: JezeroZoneId;
  destination_point: MarsPoint;
  routes: {
    A: { name: "Shortest Distance" } & RouteOutcome;
    B: { name: "Terrain-Aware" } & RouteOutcome;
    C: { name: "Science Priority" } & ScienceRouteOutcome;
  };
  feasibility: Feasibility | null;
  resource_assessment: ResourceAssessment;
};

export type SimulatedClosure = { center: MarsPoint; radius_m: number };

export type MissionPlanInput = {
  destinationZoneId: JezeroZoneId;
  /** Optional verified, route-eligible science catalog id (see GET /api/science/targets). Routes A/B are unaffected. */
  scienceWaypointId?: string | null;
  evaHours?: number;
  scienceHours?: number;
  bufferHours?: number;
  walkingSpeedMPerHour?: number;
  resourceBudgetPercent?: number;
  resourceReservePercent?: number;
  resourceConsumptionPercentPerHour?: number;
  closures?: SimulatedClosure[];
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return terrainJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, path.endsWith("/emergency-return") ? validEmergency : validPlan);
}

async function getJson<T>(path: string): Promise<T> {
  return terrainJson<T>(path, {}, path.endsWith("/base") ? validBase :
    (value) => !!value && typeof value === "object" && "items" in value && Array.isArray(value.items));
}

export function planMission(input: MissionPlanInput): Promise<MissionPlan> {
  return postJson<MissionPlan>("/api/v1/missions/plan", {
    destination_zone_id: input.destinationZoneId,
    science_waypoint_id: input.scienceWaypointId ?? null,
    eva_hours: input.evaHours ?? null,
    science_hours: input.scienceHours ?? 0,
    buffer_hours: input.bufferHours ?? 0.5,
    walking_speed_m_per_hour: input.walkingSpeedMPerHour ?? 1000,
    resource_budget_percent: input.resourceBudgetPercent ?? 80,
    resource_reserve_percent: input.resourceReservePercent ?? 20,
    resource_consumption_percent_per_hour: input.resourceConsumptionPercentPerHour ?? 2,
    closures: (input.closures ?? []).map((c) => ({ center: c.center, radius_m: c.radius_m })),
  });
}

export function emergencyReturn(input: {
  current: MarsPoint;
  evaHours?: number;
  resourceRemainingPercent?: number;
  resourceReservePercent?: number;
  resourceConsumptionPercentPerHour?: number;
}): Promise<{ base: MissionBase; current: MarsPoint; resource_assessment: ResourceAssessment } & RouteOutcome> {
  return postJson("/api/v1/missions/emergency-return", {
    current: input.current,
    eva_hours: input.evaHours ?? null,
    resource_remaining_percent: input.resourceRemainingPercent ?? null,
    resource_reserve_percent: input.resourceReservePercent ?? 20,
    resource_consumption_percent_per_hour: input.resourceConsumptionPercentPerHour ?? 2,
  });
}

export function useMissionBase() {
  return useQuery({ queryKey: ["mission-base"], queryFn: () => getJson<MissionBase>("/api/v1/jezero/base"), staleTime: Infinity, ...queryOptions });
}

export function useMissionPlanMutation() {
  return useMutation({ mutationFn: planMission });
}

export function useMissionPlanQuery(input: MissionPlanInput, enabled = true) {
  return useQuery({
    queryKey: [
      "mission-plan",
      input.destinationZoneId,
      input.scienceWaypointId,
      input.evaHours,
      input.scienceHours,
      input.bufferHours,
      input.walkingSpeedMPerHour,
      input.resourceBudgetPercent,
      input.resourceReservePercent,
      input.resourceConsumptionPercentPerHour,
      input.closures,
    ],
    queryFn: () => planMission(input),
    enabled,
    ...queryOptions,
  });
}

export function useEmergencyReturnMutation() {
  return useMutation({ mutationFn: emergencyReturn });
}

/** Route-eligible science waypoints only (GET /api/science/targets?verified_route_eligible=true). */
export function useScienceWaypoints() {
  return useQuery({
    ...queryOptions,
    queryKey: ["science-waypoints"],
    queryFn: () =>
      getJson<{ items: ScienceCatalogTarget[]; total: number }>(
        "/api/science/targets?verified_route_eligible=true",
      ),
    staleTime: Infinity,
  });
}

/** Full science catalog, including non-route-eligible / unlocated records, for the read-only catalog view. */
export function useScienceCatalog() {
  return useQuery({
    ...queryOptions,
    queryKey: ["science-catalog"],
    queryFn: () => getJson<{ items: ScienceCatalogTarget[]; total: number }>("/api/science/targets"),
    staleTime: Infinity,
  });
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

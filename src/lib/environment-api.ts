// Client for the read-only historical environment API (backend/app/environment_api.py).
// Every value comes from NASA PDS Mars 2020 MEDA products imported by scripts/gis/prepare_meda.py.
// These are HISTORICAL ROVER OBSERVATIONS: not live weather, not a forecast, and never used
// to change A* terrain cost, routes, feasibility or the simulated closure events.
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:8000";

export type EnvironmentDataLabel = {
  label: string;
  observation_type: "historical_rover_measurement";
  is_current: false;
  caveat: string;
};

export type EnvironmentGroup = {
  sol: number;
  metric: string;
  unit: string | null;
  sample_count: number;
  covered_minutes?: number;
  coverage_fraction_of_sol?: number;
  excluded_count?: number;
  exclusion_counts?: Record<string, number>;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  first_lmst?: string;
  last_lmst?: string;
  first_utc?: string;
  last_utc?: string;
};

export type EnvironmentSummary = {
  data_label: EnvironmentDataLabel;
  record_type: "derived_aggregate";
  available: boolean;
  status: "ok" | "empty_selection" | "unavailable";
  basis: string;
  groups: EnvironmentGroup[];
};

export type RoverLocationBySol = {
  sol: number;
  status: "validated" | "unvalidated" | "unavailable";
  easting_m?: number;
  northing_m?: number;
  jz_zone_id?: string | null;
  distance_to_places_m?: number;
  reason?: string;
};

export type ExcludedMetric = { metric: string; instrument: string; reason: string };

export type EnvironmentAvailability = {
  data_label: EnvironmentDataLabel;
  available: boolean;
  status: "ok" | "unavailable";
  reason?: string;
  observation_count: number;
  coverage?: { sols: number[]; utc_start: string | null; utc_end: string | null };
  rover_location_by_sol?: RoverLocationBySol[];
  missing_data?: { excluded_metrics: ExcludedMetric[] };
  provenance?: { doi?: string; archive_identifier?: string; citation?: string };
};

export type EnvironmentObservation = {
  sol: number | null;
  sclk: number | null;
  utc_time: string | null;
  lmst: string | null;
  metric: string;
  value: number;
  unit: string | null;
  is_current: false;
};

export type EnvironmentObservations = {
  data_label: EnvironmentDataLabel;
  observations: EnvironmentObservation[];
  total: number;
  status: "ok" | "empty_selection" | "unavailable";
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const queryOptions = { staleTime: Infinity, retry: 1, retryDelay: 800 } as const;

/** Availability + coverage + location diagnostics. */
export function useMedaAvailability() {
  return useQuery({
    queryKey: ["environment", "availability"],
    queryFn: () => getJson<EnvironmentAvailability>("/api/v1/environment/availability"),
    ...queryOptions,
  });
}

/** Per-sol, per-metric aggregates (derived from all valid native samples). */
export function useMedaSummary(enabled = true) {
  return useQuery({
    queryKey: ["environment", "summary"],
    queryFn: () => getJson<EnvironmentSummary>("/api/v1/environment/summary"),
    enabled,
    ...queryOptions,
  });
}

/** Observation rows for one metric and sol (used for the within-sol profile). */
export function useMedaSeries(metric: string, sol: number | null, enabled = true) {
  return useQuery({
    queryKey: ["environment", "series", metric, sol],
    queryFn: () =>
      getJson<EnvironmentObservations>(
        `/api/v1/environment/observations?metric=${encodeURIComponent(metric)}&sol=${sol}&limit=1000`,
      ),
    enabled: enabled && sol !== null,
    ...queryOptions,
  });
}

/** "00036M09:30:15.123" -> "09:30" (local mean solar time as published). */
export function lmstClock(lmst: string | undefined | null): string | null {
  const match = lmst ? /^\d{5}M(\d{2}:\d{2})/.exec(lmst) : null;
  return match ? (match[1] ?? null) : null;
}

/** Split a series wherever data are missing, so gaps are drawn as gaps and never interpolated. */
export function splitAtGaps<T extends { sclk: number | null }>(rows: T[], maxGapSeconds = 600): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  let previous: number | null = null;
  for (const row of rows) {
    if (row.sclk === null) continue;
    if (previous !== null && row.sclk - previous > maxGapSeconds && current.length) {
      segments.push(current);
      current = [];
    }
    current.push(row);
    previous = row.sclk;
  }
  if (current.length) segments.push(current);
  return segments;
}

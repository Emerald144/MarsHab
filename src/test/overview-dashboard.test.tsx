import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Overview } from "@/components/mars/Views";
import { MissionProvider, useMission } from "@/lib/mission-store";

const pixelsFixture = {
  width: 1114,
  height: 1267,
  coordinate_space: "preview_px",
  zones: [{ zone_id: "JZ-06", svg_points: ["0,0 10,0 10,10 0,10"], center: [5, 5] }],
};

const statsFixture = {
  generated: "2026-01-01",
  zonal_method: "zonal",
  disclaimer: "test fixture",
  zones: [
    {
      zone_id: "JZ-06",
      area_km2_spherical: 123.4,
      centroid_lon_lat_deg: [77.5, 18.4],
      centroid_projected_m: [4348000, 1091000],
      elevation_m: { coverage_percent: 100, min: -2600, max: -2000, mean: -2300, median: -2290, std: 50, range: 600 },
      slope_deg: { coverage_percent: 100, mean: 5.1, median: 4.2, std: 3.1, min: 0, max: 60, p90: 10.5, p99: 20.1 },
      slope_class_percent: { gentle: 70, moderate: 25, steep: 5 },
      terrain_screening: {
        dominant_slope_class: "gentle",
        heuristic_terrain_index: 82.5,
        heuristic_terrain_index_note: "test",
      },
      data_quality_flags: [],
      sources: { elevation: "test.tif" },
    },
  ],
};

const manifestFixture = {
  generated: "2026-01-01",
  raster_layers: [
    {
      id: "terrain",
      name: "Terrain",
      path: "layers/terrain_preview.png",
      source: ["test"],
      legend: { unit: "—" },
      bounds: {
        projected_m: { xmin: 4328999, ymin: 1042080, xmax: 4418120, ymax: 1143420 },
        mars_lon_lat_deg: { west: 77, south: 18, east: 78, north: 19 },
      },
      crs: "Jezero_Crater_Projection",
      width_px: 1114,
      height_px: 1267,
      display_pixel_size_m: 80,
      source_pixel_size_m: 20,
    },
  ],
};

const missionPlanFixture = {
  base: {
    easting: 4354494.086,
    northing: 1093299.695,
    longitude_deg: 77.450885729,
    latitude_deg: 18.444627146,
    label: "Perseverance rover landing site (Sol 0)",
    source: "test",
    note: "test",
  },
  destination_zone_id: "JZ-06",
  destination_point: { easting: 4348000, northing: 1091000 },
  routes: {
    A: {
      name: "Shortest Distance",
      available: true,
      route: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[4354494, 1093299], [4348000, 1091000]] },
        properties: {
          mode: "shortest",
          algorithm: "A* test",
          assumptions: ["test assumption"],
          distance_m: 14000,
          distance_km: 14,
          elevation_gain_m: 50,
          elevation_loss_m: 20,
          cumulative_terrain_cost: 10,
          mean_slope_degrees: 4.5,
          max_slope_degrees: 12,
          slope_exposure_fraction_above_10deg: 0.05,
          estimated_one_way_hours: 14,
          estimated_total_eva_hours: 29.5,
          eva_limit_hours: 8,
          passes_demo_time_assumptions: false,
          grid_resolution_m: [80, 80],
          simulated_closure_count: 0,
          endpoint_snapped_to_traversable_cell: false,
          disclaimer: "test",
        },
      },
    },
    B: {
      name: "Terrain-Aware",
      available: true,
      route: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[4354494, 1093299], [4348000, 1091000]] },
        properties: {
          mode: "terrain_aware",
          algorithm: "A* test",
          assumptions: ["test assumption"],
          distance_m: 14500,
          distance_km: 14.5,
          elevation_gain_m: 60,
          elevation_loss_m: 25,
          cumulative_terrain_cost: 12,
          mean_slope_degrees: 3.8,
          max_slope_degrees: 11,
          slope_exposure_fraction_above_10deg: 0.03,
          estimated_one_way_hours: 14.5,
          estimated_total_eva_hours: 30.45,
          eva_limit_hours: 8,
          passes_demo_time_assumptions: false,
          grid_resolution_m: [80, 80],
          simulated_closure_count: 0,
          endpoint_snapped_to_traversable_cell: false,
          disclaimer: "test",
        },
      },
    },
    C: { name: "Science Priority", available: false, reason: "No verified science-target location data." },
  },
  feasibility: {
    basis_route: "terrain_aware",
    estimated_outbound_hours: 14.5,
    estimated_return_hours: 14.5,
    activity_hours: 1.2,
    buffer_hours: 0.5,
    estimated_total_hours: 30.45,
    eva_limit_hours: 8,
    remaining_eva_hours: -22.45,
    feasible: false,
  },
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

function Fixture() {
  const mission = useMission();
  return (
    <>
      <output aria-label="Current view">{mission.view}</output>
      <button
        onClick={() => {
          mission.setMode("science");
          mission.setSetup({ ...mission.setup, name: "Crater Rim Survey", eva: 3 });
          mission.setFeasibilityChecked(true);
          mission.setRoutesGenerated(true);
        }}
      >
        Update mission
      </button>
      <Overview />
    </>
  );
}

function renderOverview() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MissionProvider>
        <Fixture />
      </MissionProvider>
    </QueryClientProvider>,
  );
}

describe("Overview mission-control presentation (real Jezero data)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("zones_preview_pixels")) return jsonResponse(pixelsFixture);
        if (url.includes("zone_terrain_statistics")) return jsonResponse(statsFixture);
        if (url.includes("layer_manifest")) return jsonResponse(manifestFixture);
        if (url.includes("/api/v1/missions/plan")) return jsonResponse(missionPlanFixture);
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows real terrain-derived values and distinguishes them from unmeasured factors", async () => {
    renderOverview();
    expect(screen.getByRole("heading", { name: /Martian Survival Mission/ })).toBeInTheDocument();
    expect(screen.getByText("Jezero Geological Survey")).toBeInTheDocument();

    expect(await screen.findByText("83%")).toBeInTheDocument(); // rounded heuristic_terrain_index
    expect(await screen.findByText("NOT FEASIBLE")).toBeInTheDocument();
    expect(screen.getByText("30.5 h")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("Not run")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    const intelligence = screen.getByRole("region", { name: "03 / ENVIRONMENTAL INTELLIGENCE" });
    expect(await within(intelligence).findByText("82.5")).toBeInTheDocument();
    expect(within(intelligence).getAllByText("Not available").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Update mission" }));
    expect(screen.getByText("Crater Rim Survey")).toBeInTheDocument();
    expect(screen.getByText("ROUTES GENERATED")).toBeInTheDocument();
  });

  it("rounds the decimal boundary for overview display without changing mission calculations", async () => {
    renderOverview();
    expect(await screen.findByText("30.5 h")).toBeInTheDocument();
    expect(missionPlanFixture.feasibility.estimated_total_hours).toBe(30.45);
  });

  it("keeps the briefing, planning action and setup metrics in one hero without duplicate badges", () => {
    renderOverview();
    const hero = screen.getByRole("region", { name: "Martian Survival Mission" });
    expect(within(hero).getByRole("button", { name: "Plan Mission" })).toBeInTheDocument();
    expect(within(hero).getByText("Feasibility check")).toBeInTheDocument();
    expect(within(hero).getByText("Route generation")).toBeInTheDocument();
    expect(within(hero).getByText("AWAITING MISSION SETUP")).toBeInTheDocument();
    expect(screen.queryByText("DEMO SIM")).not.toBeInTheDocument();
    expect(screen.queryByText("MARS-026")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "OPERATIONS STATUS" })).not.toBeInTheDocument();
  });

  it("exposes a reversible motion preference without altering mission values", () => {
    renderOverview();
    const pause = screen.getByRole("button", { name: "Pause effects" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    const resume = screen.getByRole("button", { name: "Resume effects" });
    expect(resume).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Current view")).toHaveTextContent("overview");
    fireEvent.click(resume);
    expect(screen.getByRole("button", { name: "Pause effects" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each(["Plan Mission", "Open Survival Map"])("preserves the %s action", (name) => {
    renderOverview();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByLabelText("Current view")).toHaveTextContent("map");
  });
});

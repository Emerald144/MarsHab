import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Planner, Report, RouteAnalysis } from "@/components/mars/Views";
import { MissionProvider, useMission } from "@/lib/mission-store";
import type { MissionPlan } from "@/lib/mission-api";

// Lifecycle and failure behavior are covered by animated-content.test.tsx.
// This suite verifies that selected wrappers preserve mission controls and state.
vi.mock("@/components/animations/AnimatedContent", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-animated-content="">{children}</div>
  ),
}));
vi.mock("@/components/mars/RealTerrainMap", () => ({
  RealTerrainMap: () => <div data-testid="interactive-map" />,
}));

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
      terrain_screening: { dominant_slope_class: "gentle", heuristic_terrain_index: 82.5, heuristic_terrain_index_note: "test" },
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

// A fixed 2 km route; feasibility is computed from it the same way the real backend does,
// so changing EVA time in the UI genuinely flips feasible/not-feasible.
function routeFeature(evaHours: number, scienceHours: number, bufferHours: number, speed: number) {
  const distanceKm = 2;
  const oneWay = (distanceKm * 1000) / speed;
  const total = oneWay * 2 + scienceHours + bufferHours;
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: [[4354494, 1093299], [4348000, 1091000]] as [number, number][] },
    properties: {
      mode: "terrain_aware" as const,
      algorithm: "A* test",
      assumptions: ["test assumption"],
      distance_m: distanceKm * 1000,
      distance_km: distanceKm,
      elevation_gain_m: 10,
      elevation_loss_m: 5,
      cumulative_terrain_cost: 2,
      mean_slope_degrees: 2.1,
      max_slope_degrees: 6,
      slope_exposure_fraction_above_10deg: 0,
      estimated_one_way_hours: oneWay,
      estimated_total_eva_hours: total,
      eva_limit_hours: evaHours,
      passes_demo_time_assumptions: total <= evaHours,
      grid_resolution_m: [80, 80] as [number, number],
      simulated_closure_count: 0,
      endpoint_snapped_to_traversable_cell: false,
      disclaimer: "test",
    },
  };
}
function planResponse(evaHours: number, scienceHours: number, bufferHours: number, speed: number): MissionPlan {
  const route = routeFeature(evaHours, scienceHours, bufferHours, speed);
  return {
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
      A: { name: "Shortest Distance", available: true, route },
      B: { name: "Terrain-Aware", available: true, route },
      C: { name: "Science Priority", available: false, reason: "No verified science-target location data." },
    },
    feasibility: {
      basis_route: "terrain_aware",
      estimated_outbound_hours: route.properties.estimated_one_way_hours,
      estimated_return_hours: route.properties.estimated_one_way_hours,
      activity_hours: scienceHours,
      buffer_hours: bufferHours,
      estimated_total_hours: route.properties.estimated_total_eva_hours,
      eva_limit_hours: evaHours,
      remaining_eva_hours: evaHours - route.properties.estimated_total_eva_hours,
      time_feasible: route.properties.estimated_total_eva_hours <= evaHours,
      resource_feasible: true,
      warnings: [],
      feasible: route.properties.estimated_total_eva_hours <= evaHours,
    },
    resource_assessment: {
      available: true,
      model: "abstract percentage budget",
      budget_percent: 80,
      reserve_percent: 20,
      reserved_percent: 16,
      estimated_use_percent: 6,
      remaining_after_reserve_percent: 58,
      consumption_rate_percent_per_hour: 2,
      modeled_hours: 3,
      feasible: true,
      warning_level: "ok",
      warnings: [],
      assumptions: ["test assumption"],
    },
  };
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

vi.stubGlobal(
  "fetch",
  vi.fn((url: string, init?: { body?: string }) => {
    if (url.includes("zones_preview_pixels")) return jsonResponse(pixelsFixture);
    if (url.includes("zone_terrain_statistics")) return jsonResponse(statsFixture);
    if (url.includes("layer_manifest")) return jsonResponse(manifestFixture);
    if (url.includes("/api/v1/missions/plan")) {
      const req = JSON.parse(init?.body ?? "{}");
      return jsonResponse(planResponse(req.eva_hours ?? 8, req.science_hours ?? 0, req.buffer_hours ?? 0.5, req.walking_speed_m_per_hour ?? 1000));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }),
);

// A single-route canned plan (only Route A available) for the "rerouted" fixture below,
// so the Report's recommendation text deterministically names Route A.
const reroutedPlan: MissionPlan = {
  ...planResponse(8, 1, 0.5, 1000),
  routes: {
    A: { name: "Shortest Distance", available: true, route: routeFeature(8, 1, 0.5, 1000) },
    B: { name: "Terrain-Aware", available: false, reason: "test: B unavailable" },
    C: { name: "Science Priority", available: false, reason: "No verified science-target location data." },
  },
};

function MissionControls() {
  const mission = useMission();
  return (
    <>
      <button
        onClick={() => {
          mission.setRoutesGenerated(true);
          mission.setMissionPlan(reroutedPlan);
        }}
      >
        Load route fixtures
      </button>
      <button
        onClick={() => {
          mission.setEnvChanged(true);
          mission.setRerouted(true);
          mission.setActiveRoute("A");
        }}
      >
        Load rerouted fixture
      </button>
      <output aria-label="Mission state">
        {mission.view}|{mission.activeRoute}
      </output>
    </>
  );
}
function withMission(children: ReactNode) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MissionProvider>
        <MissionControls />
        {children}
      </MissionProvider>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);

describe("selective mission-section entrances", () => {
  it("animates Planner results while preserving input changes and feasibility checks", async () => {
    const { container } = withMission(<Planner />);
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(0);
    const eva = screen.getByLabelText(/Available EVA Time/i);
    expect(eva.closest("[data-animated-content]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check Mission Feasibility" }));
    expect(await screen.findByText("MISSION FEASIBLE")).toBeInTheDocument();
    expect(screen.getByText(/Remaining time:/)).toHaveTextContent("2.3 h");
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Compare Routes" })).toBeEnabled();
    fireEvent.change(eva, { target: { value: "3" } });
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Check Mission Feasibility" }));
    expect(await screen.findByText("MISSION NOT FEASIBLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare Routes" })).toBeEnabled();
  });

  it("limits Route Analysis animation to the explanation and preserves the start action", () => {
    const { container } = withMission(<RouteAnalysis />);
    fireEvent.click(screen.getByRole("button", { name: "Load route fixtures" }));
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Why this route?" }).closest("[data-animated-content]"),
    ).not.toBeNull();
    expect(screen.getByTestId("interactive-map").closest("[data-animated-content]")).toBeNull();
    const start = screen.getByRole("button", { name: "Start Simulated Mission" });
    expect(start.closest("[data-animated-content]")).toBeNull();
    fireEvent.click(start);
    expect(screen.getByLabelText("Mission state")).toHaveTextContent("execution|A");
  });

  it("keeps Report export responsive and summary facts connected to mission state", () => {
    const { container } = withMission(<Report />);
    fireEvent.click(screen.getByRole("button", { name: "Load route fixtures" }));
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(2);
    expect(
      screen
        .getByRole("heading", { name: "Final Recommendation" })
        .closest("[data-animated-content]"),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Real Terrain Assessment" }).closest("[data-animated-content]"),
    ).toBeNull();
    const exportButton = screen.getByRole("button", { name: "Export Mission Report" });
    expect(exportButton.closest("[data-animated-content]")).toBeNull();
    fireEvent.click(exportButton);
    expect(screen.getByRole("button", { name: "Report Prepared (demo export)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load rerouted fixture" }));
    expect(screen.getByText("Revised route (post-closure)")).toBeInTheDocument();
    expect(screen.getByText(/Proceed with Route A/)).toBeInTheDocument();
  });
});

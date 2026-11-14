import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useLanguage } from "@/i18n/useLanguage";
import { LANGUAGE_STORAGE_KEY, myanmar, translate } from "@/i18n/translations";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { Overview, Planner, Report, RouteAnalysis } from "@/components/mars/Views";
import { SurvivalMapView } from "@/features/survival-map/SurvivalMapView";
import { FACTOR_LABELS, HAZARDS, MODE_WEIGHTS, RESOURCES, ROUTES, ZONES } from "@/lib/mission-data";
import { renderErrorPage } from "@/lib/error-page";

// Real-data fixtures: Overview/Planner/RouteAnalysis/Report/SurvivalMapView all read
// the real Jezero dataset (via react-query), so every render in this file needs a
// QueryClientProvider ancestor and a stubbed fetch for /jezero/*.json + the mission-plan API.
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
function feasibleRouteFeature(overrides: Partial<Record<string, number>> = {}) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[4354494, 1093299], [4348000, 1091000]] },
    properties: {
      mode: "terrain_aware",
      algorithm: "A* test",
      assumptions: ["test assumption"],
      distance_m: 2000,
      distance_km: 2,
      elevation_gain_m: 10,
      elevation_loss_m: 5,
      cumulative_terrain_cost: 2,
      mean_slope_degrees: 2.1,
      max_slope_degrees: 6,
      slope_exposure_fraction_above_10deg: 0,
      estimated_one_way_hours: 2,
      estimated_total_eva_hours: 5.2,
      eva_limit_hours: 8,
      passes_demo_time_assumptions: true,
      grid_resolution_m: [80, 80],
      simulated_closure_count: 0,
      endpoint_snapped_to_traversable_cell: false,
      disclaimer: "test",
      ...overrides,
    },
  };
}
const feasibleMissionPlanFixture = {
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
    A: { name: "Shortest Distance", available: true, route: feasibleRouteFeature({ mode: "shortest" as unknown as number }) },
    B: { name: "Terrain-Aware", available: true, route: feasibleRouteFeature() },
    C: { name: "Science Priority", available: false, reason: "No verified science-target location data." },
  },
  feasibility: {
    basis_route: "terrain_aware",
    estimated_outbound_hours: 2,
    estimated_return_hours: 2,
    activity_hours: 1,
    buffer_hours: 0.2,
    estimated_total_hours: 5.2,
    eva_limit_hours: 8,
    remaining_eva_hours: 2.8,
    feasible: true,
  },
};
function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function withQuery(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function Probe() {
  const { language, t } = useLanguage();
  return (
    <>
      <LanguageSwitcher />
      <output data-testid="language">{language}</output>
      <p>{t("Plan Mission")}</p>
    </>
  );
}
function MissionProbe() {
  const m = useMission();
  return (
    <>
      <LanguageSwitcher />
      <output data-testid="mission-state">
        {JSON.stringify({ destination: m.destination, mode: m.mode, setup: m.setup, view: m.view })}
      </output>
    </>
  );
}
const switchTo = (language: "en" | "my") =>
  fireEvent.click(screen.getByRole("button", { name: language === "my" ? /မြန်မာ/ : /EN/ }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("zones_preview_pixels")) return jsonResponse(pixelsFixture);
      if (url.includes("zone_terrain_statistics")) return jsonResponse(statsFixture);
      if (url.includes("layer_manifest")) return jsonResponse(manifestFixture);
      if (url.includes("/api/v1/missions/plan")) return jsonResponse(feasibleMissionPlanFixture);
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "en";
});

describe("bilingual language layer", () => {
  it("defaults to English on the server and first visit, persists selection and restores it", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "my");
    expect(
      renderToString(
        <LanguageProvider>
          <Probe />
        </LanguageProvider>,
      ),
    ).toContain("Plan Mission");
    localStorage.clear();
    const first = render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    switchTo("my");
    expect(document.documentElement.lang).toBe("my");
    expect(screen.getByText(myanmar["Plan Mission"])).toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("my");
    first.unmount();
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("language")).toHaveTextContent("my"));
    switchTo("en");
    expect(screen.getByText("Plan Mission")).toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("ignores invalid saved languages and works when browser storage is blocked", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "invalid");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("blocked");
    });
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    switchTo("my");
    expect(screen.getByText(myanmar["Plan Mission"])).toBeInTheDocument();
  });

  it("interpolates sentences and falls back to original English for unknown display strings", () => {
    expect(translate("my", "Area {id}", { id: "A-17" })).toBe("ဧရိယာ A-17");
    expect(translate("my", "Unknown {id}", { id: "A-17" })).toBe("Unknown A-17");
    expect(translate("en", "Area {id}", { id: "A-17" })).toBe("Area A-17");
    expect(translate("my", "{hours} h remaining", { hours: "0.8" })).toContain("0.8 h");
    expect(translate("my", "18.38°N 77.58°E")).toBe("18.38°N 77.58°E");
  });

  it("covers every modeled factor, reason, hazard, resource and route label without mutating data", () => {
    const data = { FACTOR_LABELS, HAZARDS, MODE_WEIGHTS, RESOURCES, ROUTES, ZONES };
    const original = JSON.stringify(data);
    const labels = [
      ...Object.values(FACTOR_LABELS),
      ...Object.values(MODE_WEIGHTS).map((x) => x.label),
      ...ZONES.flatMap((x) => x.reasons),
      ...HAZARDS.map((x) => x.name),
      ...RESOURCES.map((x) => x.name),
      ...Object.values(ROUTES).flatMap((x) => [x.name, x.terrain, x.resource, x.science]),
    ];
    labels.forEach((label) => expect(translate("my", label), label).not.toBe(label));
    expect(JSON.stringify(data)).toBe(original);
  });

  it("preserves Overview nodes, paused effects, card keys and mission state across both switches", () => {
    const { container } = render(
      withQuery(
        <LanguageProvider>
          <MissionProvider>
            <MissionProbe />
            <Overview />
          </MissionProvider>
        </LanguageProvider>,
      ),
    );
    const globe = container.querySelector("[data-mars-renderer]");
    const wrappers = [...container.querySelectorAll("[data-animated-content]")];
    const cards = [...container.querySelectorAll("article")];
    const originalState = screen.getByTestId("mission-state").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Pause effects" }));
    switchTo("my");
    expect(
      screen.getByRole("heading", { name: myanmar["Martian Survival Mission"] }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: myanmar["Resume effects"] })).toBeInTheDocument();
    expect(container.querySelector("[data-mars-renderer]")).toBe(globe);
    expect([...container.querySelectorAll("[data-animated-content]")]).toEqual(wrappers);
    expect([...container.querySelectorAll("article")]).toEqual(cards);
    expect(screen.getByTestId("mission-state").textContent).toBe(originalState);
    switchTo("en");
    expect(container.querySelector("[data-mars-renderer]")).toBe(globe);
    expect(screen.getByRole("button", { name: "Resume effects" })).toBeInTheDocument();
  });

  it("preserves selected demo-map zones, toggled layers and SVG nodes when language changes", () => {
    const { container } = render(
      withQuery(
        <LanguageProvider>
          <MissionProvider>
            <MissionProbe />
            <SurvivalMapView />
          </MissionProvider>
        </LanguageProvider>,
      ),
    );
    // SurvivalMapView now defaults to the real terrain map; switch to the legacy demo map first.
    fireEvent.click(screen.getByRole("button", { name: "Demo Mission Map" }));
    fireEvent.click(screen.getByLabelText("Hazards"));
    const map = screen.getByRole("img", { name: "JEZERO REGIONAL MAP" });
    const zone = container.querySelector("g.cursor-pointer")!;
    fireEvent.click(zone);
    expect(screen.getByText("Smooth crater-floor plains")).toBeInTheDocument();
    switchTo("my");
    expect(screen.getByRole("img", { name: myanmar["JEZERO REGIONAL MAP"] })).toBe(map);
    expect(container.querySelector("g.cursor-pointer")).toBe(zone);
    expect(screen.getByLabelText(myanmar["Hazards"])).toBeChecked();
    expect(screen.getByText(myanmar["Smooth crater-floor plains"])).toBeInTheDocument();
    expect(screen.getByText(`⚠ ${myanmar["Rim slopes"]}`)).toBeInTheDocument();
  });

  it("keeps user-entered mission names and numbers unchanged in Planner", async () => {
    render(
      withQuery(
        <LanguageProvider>
          <MissionProvider>
            <MissionProbe />
            <Planner />
          </MissionProvider>
        </LanguageProvider>,
      ),
    );
    fireEvent.change(screen.getByLabelText("Mission Name"), { target: { value: "My Survey 026" } });
    fireEvent.change(screen.getByLabelText("Available EVA Time"), { target: { value: "8" } });
    switchTo("my");
    expect(screen.getByLabelText(myanmar["Mission Name"])).toHaveValue("My Survey 026");
    expect(screen.getByLabelText(myanmar["Available EVA Time"])).toHaveValue(8);
    fireEvent.click(screen.getByRole("button", { name: myanmar["Check Mission Feasibility"] }));
    expect(await screen.findByText(myanmar["MISSION FEASIBLE"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: myanmar["Compare Routes"] })).toBeEnabled();
  });

  it("translates empty route states, reports and the standalone error fallback", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "my");
    const route = render(
      withQuery(
        <LanguageProvider>
          <MissionProvider>
            <RouteAnalysis />
          </MissionProvider>
        </LanguageProvider>,
      ),
    );
    expect(
      screen.getByText(
        myanmar["No routes yet. Select a destination and pass the feasibility check first."],
      ),
    ).toBeInTheDocument();
    route.unmount();
    render(
      withQuery(
        <LanguageProvider>
          <MissionProvider>
            <Report />
          </MissionProvider>
        </LanguageProvider>,
      ),
    );
    expect(screen.getByRole("heading", { name: myanmar["Mission Summary"] })).toBeInTheDocument();
    expect(await screen.findByText("JZ-06")).toBeInTheDocument();
    expect(screen.getAllByText(myanmar["Not available"]).length).toBeGreaterThan(0);
    expect(renderErrorPage()).toContain(myanmar["This page didn't load"]);
    expect(renderErrorPage()).toContain(LANGUAGE_STORAGE_KEY);
  });
});

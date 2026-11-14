import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HistoricalObservationPanel } from "@/components/mars/HistoricalObservationPanel";
import { ValueCategoryBadge, ValueCategoryLegend, VALUE_CATEGORIES } from "@/components/mars/ValueCategory";
import { Report } from "@/components/mars/Views";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useLanguage } from "@/i18n/useLanguage";
import { myanmar } from "@/i18n/translations";
import { MissionProvider } from "@/lib/mission-store";
import { lmstClock, splitAtGaps } from "@/lib/environment-api";

vi.mock("@/components/animations/AnimatedContent", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Synthetic UI fixtures (clearly fake numbers). They exercise rendering only and are not NASA data.
const label = {
  label: "Historical Rover Observation",
  observation_type: "historical_rover_measurement",
  is_current: false,
  caveat: "test",
};
const availability = {
  data_label: label,
  available: true,
  status: "ok",
  observation_count: 6,
  coverage: { sols: [36, 37], utc_start: "2021-03-27T04:09:24.994Z", utc_end: "2021-03-28T05:28:34.894Z" },
  rover_location_by_sol: [
    { sol: 36, status: "validated", jz_zone_id: "JZ-06", distance_to_places_m: 0.025 },
    { sol: 37, status: "unvalidated", reason: "position withheld" },
  ],
  missing_data: { excluded_metrics: [{ metric: "relative_humidity", instrument: "RHS", reason: "unreliable before sol 63" }] },
};
const group = (sol: number, metric: string, unit: string, min: number, mean: number, max: number, coverage: number) => ({
  sol, metric, unit, sample_count: 1000, minimum: min, mean, maximum: max, coverage_fraction_of_sol: coverage,
  first_lmst: `000${sol}M00:00:00.393`, last_lmst: `000${sol}M23:05:32.170`,
  first_utc: "2021-03-27T04:09:24.994Z", last_utc: "2021-03-28T03:53:02.167Z",
});
const summary = {
  data_label: label,
  record_type: "derived_aggregate",
  available: true,
  status: "ok",
  basis: "all valid native samples (importer summary)",
  groups: [
    group(36, "pressure", "Pa", 700, 710, 720, 0.6272),
    group(36, "air_temperature.ats1", "K", 190, 210, 250, 0.5),
    group(36, "wind_speed.horizontal", "m/s", 0.1, 5.2, 16, 0.2318),
    group(37, "pressure", "Pa", 701, 711, 721, 0.65),
    group(37, "air_temperature.ats1", "K", 191, 211, 251, 0.5),
    // sol 37 has no wind group: must be shown as unavailable, not as zero
  ],
};
const series = {
  data_label: label,
  status: "ok",
  total: 4,
  observations: [
    { sol: 36, sclk: 1000, utc_time: "2021-03-27T04:09:25.000Z", lmst: "00036M00:00:00.393", metric: "air_temperature.ats1", value: 200, unit: "K", is_current: false },
    { sol: 36, sclk: 1300, utc_time: "2021-03-27T04:14:25.000Z", lmst: "00036M00:05:00.000", metric: "air_temperature.ats1", value: 205, unit: "K", is_current: false },
    { sol: 36, sclk: 9000, utc_time: "2021-03-27T06:39:25.000Z", lmst: "00036M02:30:00.000", metric: "air_temperature.ats1", value: 220, unit: "K", is_current: false },
    { sol: 36, sclk: 9300, utc_time: "2021-03-27T06:44:25.000Z", lmst: "00036M02:35:00.000", metric: "air_temperature.ats1", value: 221, unit: "K", is_current: false },
  ],
};

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
function stubFetch(handler: (url: string) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((url: string) => handler(String(url))));
}
function serveEnvironment(url: string) {
  if (url.includes("/environment/availability")) return ok(availability);
  if (url.includes("/environment/summary")) return ok(summary);
  if (url.includes("/environment/observations")) return ok(series);
  return Promise.reject(new Error(`unexpected fetch: ${url}`));
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </LanguageProvider>
  );
}
function UseMyanmar() {
  const { setLanguage } = useLanguage();
  return <button onClick={() => setLanguage("my")}>use-my</button>;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HistoricalObservationPanel", () => {
  it("shows a loading state and the historical label while data are pending", () => {
    stubFetch(() => new Promise(() => {}));
    render(<Providers><HistoricalObservationPanel /></Providers>);
    expect(screen.getByRole("heading", { name: /Historical Rover Observation/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading historical MEDA observations…");
  });

  it("renders real-shaped data with units, sol times, coverage and the not-live caveat", async () => {
    stubFetch(serveEnvironment);
    render(<Providers><HistoricalObservationPanel /></Providers>);
    const panel = await screen.findByTestId("historical-observation-panel");
    await waitFor(() => expect(within(panel).getByRole("table")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /Historical Rover Observation/ })).toBeInTheDocument();
    expect(panel).toHaveTextContent("Not live weather, not a forecast, and not valid for every Jezero zone.");
    expect(panel).toHaveTextContent("NASA PDS · Mars 2020 MEDA · Sols 36–37");
    const pressure = within(panel).getByRole("row", { name: /Pressure/ });
    expect(pressure).toHaveTextContent("700.0");
    expect(pressure).toHaveTextContent("710.0 Pa");
    expect(pressure).toHaveTextContent("63%"); // coverage 0.6272 of the sol
    expect(within(panel).getByRole("row", { name: /Horizontal wind speed/ })).toHaveTextContent("5.2 m/s");
    expect(panel).toHaveTextContent("Local mean solar time 00:00 to 23:05");
    expect(panel).toHaveTextContent("UTC (derived, about ±1 s): 2021-03-27 04:09 to 2021-03-28 03:53");
    expect(panel).toHaveTextContent("Rover was inside JZ-06 during these sols");
    expect(panel).toHaveTextContent("0.03 m difference");
    // nothing claims to be current/live apart from the explicit negation
    expect(panel.textContent ?? "").not.toMatch(/current (weather|conditions)|live (weather|data|telemetry)(?!,)/i);
    expect(await within(panel).findByTestId("meda-temperature-profile")).toBeInTheDocument();
    // the profile is drawn in two pieces because the series has a gap; it is never interpolated across it
    expect(panel.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("switches sol, shows missing metrics as unavailable and withholds unvalidated locations", async () => {
    stubFetch(serveEnvironment);
    render(<Providers><HistoricalObservationPanel /></Providers>);
    const panel = await screen.findByTestId("historical-observation-panel");
    await within(panel).findByRole("table");
    fireEvent.click(within(panel).getByRole("button", { name: "37" }));
    expect(within(panel).getByRole("button", { name: "37" })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("row", { name: /Pressure/ })).toHaveTextContent("711.0 Pa");
    expect(within(panel).getByRole("row", { name: /Horizontal wind speed/ })).toHaveTextContent("Not available");
    expect(panel).toHaveTextContent("Rover position could not be validated, so no location is shown.");
    expect(panel).not.toHaveTextContent("Rover was inside");
  });

  it("explains data limitations in the notes, including excluded humidity", async () => {
    stubFetch(serveEnvironment);
    render(<Providers><HistoricalObservationPanel /></Providers>);
    const panel = await screen.findByTestId("historical-observation-panel");
    await within(panel).findByRole("table");
    expect(panel).toHaveTextContent("Relative humidity is not shown: NASA considers humidity data before sol 63 unreliable.");
    expect(panel).toHaveTextContent("Terrain costs and routes are not changed by historical weather.");
    expect(panel).toHaveTextContent("never filled in or interpolated");
  });

  it("shows an explicit unavailable state when the dataset is empty", async () => {
    stubFetch((url) =>
      url.includes("/availability")
        ? ok({ data_label: label, available: false, status: "unavailable", reason: "No normalized MEDA observations are present.", observation_count: 0 })
        : Promise.reject(new Error("summary must not be requested when nothing is available")),
    );
    render(<Providers><HistoricalObservationPanel /></Providers>);
    expect(await screen.findByText("No historical MEDA observations are available.")).toBeInTheDocument();
    expect(screen.getByText("No normalized MEDA observations are present.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a recoverable error state and a retry button when the API fails", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    render(<Providers><HistoricalObservationPanel /></Providers>);
    const alert = await screen.findByRole("alert", {}, { timeout: 6000 });
    expect(alert).toHaveTextContent("Historical MEDA observations could not be loaded.");
    expect(alert).toHaveTextContent("The mission planner and simulation still work without them.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeEnabled();
  }, 10000);

  it("is available in Myanmar", async () => {
    stubFetch(serveEnvironment);
    render(<Providers><UseMyanmar /><HistoricalObservationPanel /></Providers>);
    const panel = await screen.findByTestId("historical-observation-panel");
    await within(panel).findByRole("table");
    fireEvent.click(screen.getByText("use-my"));
    expect(screen.getByRole("heading", { name: new RegExp(myanmar["Historical Rover Observation"]) })).toBeInTheDocument();
    expect(panel).toHaveTextContent(myanmar["Pressure"]);
    expect(panel).toHaveTextContent(myanmar["Data notes"]);
    expect(panel).toHaveTextContent(
      myanmar["Measured at the Perseverance rover's location in the past. Not live weather, not a forecast, and not valid for every Jezero zone."],
    );
  });
});

describe("value categories", () => {
  it("renders all five categories with accessible hints", () => {
    render(<Providers><ValueCategoryLegend /></Providers>);
    expect(VALUE_CATEGORIES).toEqual(["observed", "derived", "estimated", "simulated", "unavailable"]);
    for (const text of ["OBSERVED", "DERIVED", "ESTIMATED", "SIMULATED", "UNAVAILABLE"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it("exposes the category as a data attribute for assertions", () => {
    const { container } = render(<Providers><ValueCategoryBadge category="estimated" /></Providers>);
    expect(container.querySelector('[data-value-category="estimated"]')).not.toBeNull();
  });
});

describe("mission report integration", () => {
  it("tags every summary fact with a category, lists the MEDA panel and keeps science unavailable", async () => {
    stubFetch(serveEnvironment);
    const { container } = render(
      <Providers>
        <MissionProvider>
          <Report />
        </MissionProvider>
      </Providers>,
    );
    const facts = container.querySelectorAll(".sm\\:grid-cols-2 > div");
    expect(facts.length).toBe(8);
    facts.forEach((fact) => expect(fact.querySelector("[data-value-category]")).not.toBeNull());
    // no route plan has been generated, so these are honestly unavailable rather than estimated
    for (const name of ["Final Mission Status", "Total Mission Time", "Resource Status"]) {
      const cell = screen.getByText(name).parentElement as HTMLElement;
      expect(cell.querySelector('[data-value-category="unavailable"]')).not.toBeNull();
    }
    expect(screen.getByRole("heading", { name: /Historical Rover Observation/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Science targets/ })).toBeInTheDocument();
    expect(screen.getByText(/No science waypoint was selected, or Route C is unavailable for this plan/)).toBeInTheDocument();
    expect(await screen.findByTestId("historical-observation-panel")).toBeInTheDocument();
    const events = screen.getByRole("heading", { name: /Simulated Events/ }).closest("section") as HTMLElement;
    expect(events.querySelector('[data-value-category="simulated"]')).not.toBeNull();
  });
});

describe("environment-api helpers", () => {
  it("extracts the published local mean solar time without recomputing it", () => {
    expect(lmstClock("00036M09:30:15.123")).toBe("09:30");
    expect(lmstClock("garbage")).toBeNull();
    expect(lmstClock(undefined)).toBeNull();
  });

  it("splits series at data gaps so gaps are never interpolated", () => {
    const rows = [{ sclk: 0 }, { sclk: 300 }, { sclk: 5000 }, { sclk: 5300 }, { sclk: null }];
    expect(splitAtGaps(rows).map((segment) => segment.length)).toEqual([2, 2]);
    expect(splitAtGaps([])).toEqual([]);
  });
});

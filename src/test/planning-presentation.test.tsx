import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanningFields, RouteAssessment, planningInputs } from "@/components/mars/RouteAssessment";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { myanmar } from "@/i18n/translations";
import { assessMissionRoute } from "@/lib/mission-evaluation";
import type { RouteFeature } from "@/lib/mission-api";

const route: RouteFeature = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [14410, 0],
    ],
  },
  properties: {
    mode: "shortest", distance_m: 14410, distance_km: 14.41,
    mean_slope_degrees: 5, algorithm: "A*", assumptions: [],
    elevation_gain_m: 0, elevation_loss_m: 0, cumulative_terrain_cost: 0,
    max_slope_degrees: 5, slope_exposure_fraction_above_10deg: 0,
    estimated_one_way_hours: 14.41, estimated_total_eva_hours: 30.52,
    eva_limit_hours: 8, passes_demo_time_assumptions: false,
    grid_resolution_m: [20, 20], simulated_closure_count: 0,
    endpoint_snapped_to_traversable_cell: false, disclaimer: "Test fixture",
  },
};
function Presentation({ result = false }: { result?: boolean }) {
  const { setup, setSetup } = useMission();
  return (
    <>
      <LanguageSwitcher />
      <PlanningFields setup={setup} onChange={setSetup} />
      {result && <RouteAssessment setup={setup} route={route} />}
      <output aria-label="Planning inputs">{JSON.stringify(setup.planning)}</output>
      <output aria-label="Evaluator total">
        {assessMissionRoute(route, planningInputs(setup)).totalHours}
      </output>
    </>
  );
}
function renderFields(result = false) {
  return render(
    <LanguageProvider>
      <MissionProvider>
        <Presentation result={result} />
      </MissionProvider>
    </LanguageProvider>,
  );
}
function openCrew() {
  fireEvent.click(screen.getByText("Astronaut & Equipment"));
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("compact mission presentation", () => {
  it("starts with one neutral optional prompt and collapsed technical details", () => {
    renderFields();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("Astronaut & Equipment").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(
      screen.getAllByText("Add crew and suit details to calculate the load estimate."),
    ).toHaveLength(1);
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByText(/Required for the optional load comparison/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select loaded mass to calculate the estimate."),
    ).not.toBeInTheDocument();
    const details = screen.getByText("Model details").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Model details"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText(/ICES-2026-127/)).toBeVisible();
    expect(screen.getByText(/101.02 kg allowance/)).toBeVisible();
    expect(screen.getByText(/Equipment excludes anything/)).toBeVisible();
  });
  it("shows actionable validation after interaction and accepts 2 N pressure support", () => {
    renderFields();
    openCrew();
    const fitness = screen.getByLabelText("Fitness — VO₂max (mL/kg/min)");
    fireEvent.change(fitness, { target: { value: "4" } });
    expect(fitness).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(fitness.getAttribute("aria-describedby")!)).toHaveTextContent(
      "Enter a value above 14 for this model.",
    );
    fireEvent.change(fitness, { target: { value: "36" } });
    expect(fitness).not.toHaveAttribute("aria-invalid");
    fireEvent.blur(screen.getByLabelText("Suit mass type"));
    expect(screen.getByText("Select loaded mass to calculate the estimate.")).toBeInTheDocument();
    const equipment = screen.getByLabelText("Equipment mass (kg)");
    fireEvent.change(equipment, { target: { value: "-1" } });
    expect(equipment).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter zero or a positive value.")).toBeInTheDocument();
    fireEvent.change(equipment, { target: { value: "0" } });
    expect(equipment).not.toHaveAttribute("aria-invalid");
    const pressure = screen.getByLabelText("Pressure support (N)");
    fireEvent.change(pressure, { target: { value: "2" } });
    expect(pressure).toHaveValue(2);
    expect(pressure).not.toHaveAttribute("aria-invalid");
  });
  it("applies exactly the existing research example without changing mission assumptions", async () => {
    renderFields();
    openCrew();
    fireEvent.change(screen.getByLabelText("Nominal return speed (km/h)"), {
      target: { value: "2.5" },
    });
    fireEvent.focus(screen.getByRole("button", { name: "About pressure support" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Suit-specific pressure offload");
    fireEvent.click(screen.getByRole("button", { name: "Use example values" }));
    const values = JSON.parse(screen.getByLabelText("Planning inputs").textContent!);
    expect(values).toMatchObject({
      crewMassKg: 49,
      evaVo2Max: 36,
      suitMassKg: 104,
      suitMassBasis: "loaded",
      equipmentMassKg: 23,
      sampleMassKg: 0,
      pressureOffloadN: 213,
      returnSpeedKmh: 2.5,
    });
    expect(screen.getByText("Example values applied")).toBeInTheDocument();
  });
  it("shows unchanged exceeded results and keeps provenance in collapsed calculation details", () => {
    renderFields(true);
    expect(screen.getByLabelText("Evaluator total")).toHaveTextContent("30.52");
    expect(screen.getByRole("group", { name: "Mission time" })).toHaveTextContent("30.52 / 8.00 h");
    expect(screen.getByRole("group", { name: "Mission time" })).toHaveTextContent("Over budget");
    expect(screen.getByRole("group", { name: "Mission time" })).toHaveTextContent(
      "Exceeds budget by 22.52 h.",
    );
    expect(screen.getByRole("group", { name: "Emergency return" })).toHaveTextContent(
      "Over budget",
    );
    const details = screen.getByText("Calculation details").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Calculation details"));
    expect(screen.getByText(/Distance provenance/)).toBeVisible();
    expect(screen.getByText(/distance is one-way/)).toBeVisible();
  });
  it("localizes new labels, disclosure names, example status and validation", () => {
    renderFields();
    openCrew();
    fireEvent.change(screen.getByLabelText("Fitness — VO₂max (mL/kg/min)"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "မြန်မာ" }));
    expect(screen.getByText(myanmar["Astronaut & Equipment"])).toBeInTheDocument();
    expect(screen.getByText(myanmar["Enter a value above 14 for this model."])).toBeInTheDocument();
    expect(screen.getByText(myanmar["Model details"])).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: myanmar["Use example values"] }));
    expect(screen.getByText(myanmar["Example values applied"])).toBeInTheDocument();
  });
});

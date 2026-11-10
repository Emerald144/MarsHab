import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Overview } from "@/components/mars/Views";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { ZONES, score } from "@/lib/mission-data";

function Fixture() {
  const mission = useMission();
  return (
    <>
      <output aria-label="Current view">{mission.view}</output>
      <button
        onClick={() => {
          mission.setDestination("A-14");
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

afterEach(cleanup);

describe("Overview mission-control presentation", () => {
  it("shows existing modeled values and distinguishes indicators from operational status", () => {
    render(
      <MissionProvider>
        <Fixture />
      </MissionProvider>,
    );
    expect(screen.getByRole("heading", { name: /Martian Survival Mission/ })).toBeInTheDocument();
    expect(screen.getByText("Jezero Geological Survey")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("5.2 h")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("Illustrative indicator · not calculated")).toBeInTheDocument();
    expect(screen.getByText("Not run")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update mission" }));
    const zone = ZONES.find((item) => item.id === "A-14")!;
    expect(screen.getByText(`${score(zone.factors, "science")}%`)).toBeInTheDocument();
    expect(screen.getByText("Crater Rim Survey")).toBeInTheDocument();
    expect(screen.queryByText("SCIENCE MODE")).not.toBeInTheDocument();
    expect(screen.getByText("6.4 h")).toBeInTheDocument();
    expect(screen.getByText("3.4 h over budget")).toBeInTheDocument();
    expect(screen.getByText("AT RISK")).toBeInTheDocument();
    expect(screen.getByText("ROUTES GENERATED")).toBeInTheDocument();
    const intelligence = screen.getByRole("region", { name: "03 / ENVIRONMENTAL INTELLIGENCE" });
    expect(within(intelligence).getByText("40")).toBeInTheDocument();
    expect(within(intelligence).getByText("Steep crater-rim slopes")).toBeInTheDocument();
  });

  it("keeps the briefing, planning action and setup metrics in one hero without duplicate badges", () => {
    render(
      <MissionProvider>
        <Fixture />
      </MissionProvider>,
    );
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
    render(
      <MissionProvider>
        <Fixture />
      </MissionProvider>,
    );
    const pause = screen.getByRole("button", { name: "Pause effects" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    const resume = screen.getByRole("button", { name: "Resume effects" });
    expect(resume).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByLabelText("Current view")).toHaveTextContent("overview");
    fireEvent.click(resume);
    expect(screen.getByRole("button", { name: "Pause effects" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each(["Plan Mission", "Open Survival Map"])("preserves the %s action", (name) => {
    render(
      <MissionProvider>
        <Fixture />
      </MissionProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByLabelText("Current view")).toHaveTextContent("map");
  });
});

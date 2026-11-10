import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Planner, Report, RouteAnalysis } from "@/components/mars/Views";
import { MissionProvider, useMission } from "@/lib/mission-store";

// Lifecycle and failure behavior are covered by animated-content.test.tsx.
// This suite verifies that selected wrappers preserve mission controls and state.
vi.mock("@/components/animations/AnimatedContent", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-animated-content="">{children}</div>
  ),
}));
vi.mock("@/components/mars/MarsMap", () => ({
  MarsMap: () => <div data-testid="interactive-map" />,
}));

function MissionControls() {
  const mission = useMission();
  return (
    <>
      <button onClick={() => mission.setRoutesGenerated(true)}>Load route fixtures</button>
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
  return render(
    <MissionProvider>
      <MissionControls />
      {children}
    </MissionProvider>,
  );
}
afterEach(cleanup);

describe("selective mission-section entrances", () => {
  it("animates Planner results while preserving input changes and feasibility checks", () => {
    const { container } = withMission(<Planner />);
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(0);
    const eva = screen.getByLabelText(/Available EVA Time/i);
    expect(eva.closest("[data-animated-content]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check Mission Feasibility" }));
    expect(screen.getByText("MISSION FEASIBLE")).toBeInTheDocument();
    expect(screen.getByText(/Remaining time:/)).toHaveTextContent("0.8 h");
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Generate Routes" })).toBeEnabled();
    fireEvent.change(eva, { target: { value: "3" } });
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Check Mission Feasibility" }));
    expect(screen.getByText("MISSION NOT FEASIBLE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Routes" })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Mission state")).toHaveTextContent("execution|B");
  });

  it("keeps Report export responsive and summary facts connected to mission state", () => {
    const { container } = withMission(<Report />);
    expect(container.querySelectorAll("[data-animated-content]")).toHaveLength(2);
    expect(
      screen
        .getByRole("heading", { name: "Final Recommendation" })
        .closest("[data-animated-content]"),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Survival Analysis" }).closest("[data-animated-content]"),
    ).toBeNull();
    const exportButton = screen.getByRole("button", { name: "Export Mission Report" });
    expect(exportButton.closest("[data-animated-content]")).toBeNull();
    fireEvent.click(exportButton);
    expect(screen.getByRole("button", { name: "Report Prepared (demo)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load rerouted fixture" }));
    expect(screen.getByText("Route A (rerouted from B)")).toBeInTheDocument();
    expect(screen.getByText(/Proceed with Route A/)).toBeInTheDocument();
  });
});

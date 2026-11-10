import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { StepIndicator } from "@/components/mars/StepIndicator";

function NavigationFixture() {
  const { setRoutesGenerated } = useMission();
  return (
    <>
      <StepIndicator />
      <button onClick={() => setRoutesGenerated(true)}>Generate test routes</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mission navigation", () => {
  it("keeps later stages locked until routes exist, then permits navigation", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(
      <MissionProvider>
        <NavigationFixture />
      </MissionProvider>,
    );
    const lockedRoutes = screen.getByRole("button", { name: "Routes: generate routes first" });
    expect(lockedRoutes).toBeDisabled();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.click(screen.getByRole("button", { name: "Survival Map" }));
    expect(screen.getByRole("button", { name: "Survival Map" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate test routes" }));
    const routes = screen.getByRole("button", { name: "Routes" });
    expect(routes).toBeEnabled();
    fireEvent.click(routes);
    expect(routes).toHaveAttribute("aria-current", "step");
  });
});

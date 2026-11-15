import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { StepIndicator } from "@/components/mars/StepIndicator";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { translate } from "@/i18n/translations";

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
  it("keeps navigation nodes, selection and route locks through EN → MM → EN", () => {
    localStorage.clear();
    render(
      <LanguageProvider>
        <MissionProvider>
          <LanguageSwitcher />
          <NavigationFixture />
        </MissionProvider>
      </LanguageProvider>,
    );
    const map = screen.getByRole("button", { name: "Survival Map" });
    fireEvent.click(map);
    const classes = map.className;
    fireEvent.click(screen.getByRole("button", { name: /မြန်မာ/ }));
    expect(screen.getByRole("button", { name: translate("my", "Survival Map") })).toBe(map);
    expect(map).toHaveAttribute("aria-current", "step");
    expect(map.className).toBe(classes);
    expect(
      screen.getByRole("button", {
        name: translate("my", "{step}: generate routes first", { step: translate("my", "Routes") }),
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /EN/ }));
    expect(screen.getByRole("button", { name: "Survival Map" })).toBe(map);
    expect(map).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Routes: generate routes first" })).toBeDisabled();
    localStorage.clear();
  });
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

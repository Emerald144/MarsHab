import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useLanguage } from "@/i18n/useLanguage";
import { LANGUAGE_STORAGE_KEY, myanmar, translate } from "@/i18n/translations";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { Overview, Planner, Report, RouteAnalysis } from "@/components/mars/Views";
import { SurvivalMapView } from "@/features/survival-map/SurvivalMapView";
import { FACTOR_LABELS, HAZARDS, MODE_WEIGHTS, RESOURCES, ROUTES, ZONES } from "@/lib/mission-data";
import { renderErrorPage } from "@/lib/error-page";

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
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
      <LanguageProvider>
        <MissionProvider>
          <MissionProbe />
          <Overview />
        </MissionProvider>
      </LanguageProvider>,
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

  it("preserves selected map zones, toggled layers and SVG nodes when language changes", () => {
    const { container } = render(
      <LanguageProvider>
        <MissionProvider>
          <MissionProbe />
          <SurvivalMapView />
        </MissionProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByLabelText("Hazards"));
    const map = screen.getByRole("img", { name: "JEZERO REGIONAL MAP" });
    const zone = container.querySelector("g.cursor-pointer")!;
    fireEvent.click(zone);
    const panel = screen.getByRole("button", { name: "Select as Destination" }).parentElement!;
    switchTo("my");
    expect(screen.getByRole("img", { name: myanmar["JEZERO REGIONAL MAP"] })).toBe(map);
    expect(container.querySelector("g.cursor-pointer")).toBe(zone);
    expect(screen.getByLabelText(myanmar["Hazards"])).toBeChecked();
    expect(
      screen.getByRole("button", { name: myanmar["Select as Destination"] }).parentElement,
    ).toBe(panel);
    expect(within(panel).getByText(myanmar["Smooth crater-floor plains"])).toBeInTheDocument();
    expect(screen.getByText(`⚠ ${myanmar["Rim slopes"]}`)).toBeInTheDocument();
  });

  it("keeps user-entered mission names and numbers unchanged in Planner", () => {
    render(
      <LanguageProvider>
        <MissionProvider>
          <MissionProbe />
          <Planner />
        </MissionProvider>
      </LanguageProvider>,
    );
    fireEvent.change(screen.getByLabelText("Mission Name"), { target: { value: "My Survey 026" } });
    fireEvent.change(screen.getByLabelText("Available EVA Time"), { target: { value: "8" } });
    switchTo("my");
    expect(screen.getByLabelText(myanmar["Mission Name"])).toHaveValue("My Survey 026");
    expect(screen.getByLabelText(myanmar["Available EVA Time"])).toHaveValue(8);
    fireEvent.click(screen.getByRole("button", { name: myanmar["Check Mission Feasibility"] }));
    expect(screen.getByText(myanmar["MISSION FEASIBLE"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: myanmar["Generate Routes"] })).toBeEnabled();
  });

  it("translates empty route states, reports and the standalone error fallback", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "my");
    const route = render(
      <LanguageProvider>
        <MissionProvider>
          <RouteAnalysis />
        </MissionProvider>
      </LanguageProvider>,
    );
    expect(
      screen.getByText(
        myanmar["No routes yet. Select a destination and pass the feasibility check first."],
      ),
    ).toBeInTheDocument();
    route.unmount();
    render(
      <LanguageProvider>
        <MissionProvider>
          <Report />
        </MissionProvider>
      </LanguageProvider>,
    );
    expect(screen.getByRole("heading", { name: myanmar["Mission Summary"] })).toBeInTheDocument();
    expect(screen.getByText("ဧရိယာ A-17")).toBeInTheDocument();
    expect(screen.getByText(/စုစုပေါင်း 5.2 h/)).toBeInTheDocument();
    expect(renderErrorPage()).toContain(myanmar["This page didn't load"]);
    expect(renderErrorPage()).toContain(LANGUAGE_STORAGE_KEY);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RealTerrainMap } from "@/components/mars/RealTerrainMap";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { myanmar } from "@/i18n/translations";
import { alignedLayer } from "@/lib/real-map-layers";
import type { RasterLayerManifestEntry } from "@/lib/jezero-real-data";
import { projectedToPixel } from "@/lib/mission-api";

const read = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "public/jezero", path), "utf8"));
const manifest = read("layer_manifest.json");
const statistics = read("zone_terrain_statistics.json");
const pixels = read("zones_preview_pixels.json");
const rover = read("rover_track.json");
let currentManifest = manifest;
let currentStats = statistics;
let roverFails = false;
let explorerMode = false;
let wideViewport = false;
function Harness() {
  const m = useMission();
  const [visible, setVisible] = useState(true);
  const [execution, setExecution] = useState(false);
  const [progress, setProgress] = useState(0.25);
  const base = rover.points[0];
  return (
    <>
      <LanguageSwitcher />
      <button onClick={() => setVisible((value) => !value)}>Toggle map view</button>
      <button onClick={() => setExecution((value) => !value)}>Toggle execution presentation</button>
      <button onClick={() => setProgress(0.5)}>Advance map progress</button>
      <output aria-label="Mission state">
        {JSON.stringify({ destination: m.destination, setup: m.setup, plan: m.missionPlan })}
      </output>
      {visible && (
        <RealTerrainMap
          mode={execution ? "execution" : "configuration"}
          basePoint={base}
          markerPoint={base}
          destinationPoint={{ easting: base.easting + 1000, northing: base.northing + 1000 }}
          waypointPoint={{ easting: base.easting + 500, northing: base.northing + 500 }}
          progress={progress}
          explorer={explorerMode}
          className="h-[70vh]"
          layerState={m.realMapLayers}
          onLayerStateChange={m.setRealMapLayers}
          routes={[
            {
              id: "test-route",
              color: "red",
              coordinates: [
                [base.easting, base.northing],
                [base.easting + 1000, base.northing + 1000],
              ],
            },
          ]}
          onSelectAsDestination={(id) => m.setDestination(id as typeof m.destination)}
        />
      )}
    </>
  );
}
async function renderMap() {
  const view = render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LanguageProvider>
        <MissionProvider>
          <Harness />
        </MissionProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("img", { name: "Real Jezero Crater terrain map" });
  if (!explorerMode) fireEvent.click(screen.getByRole("button", { name: "Show layers" }));
  return view;
}
beforeEach(() => {
  currentManifest = manifest;
  currentStats = statistics;
  roverFails = false;
  explorerMode = false;
  wideViewport = false;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: wideViewport && query.includes("1280"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => true,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("rover_track.json") && roverFails)
        throw new Error("optional track disconnected");
      const data = url.endsWith("layer_manifest.json")
        ? currentManifest
        : url.endsWith("zone_terrain_statistics.json")
          ? currentStats
          : url.endsWith("rover_track.json")
            ? rover
            : pixels;
      return { ok: true, json: async () => data } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("real map layer controls", () => {
  it("isolates execution presentation while preserving Survival Map layer preferences", async () => {
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole("radio", { name: "Hillshade" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Slope classes" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle execution presentation" }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inspect terrain zone/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Layer details")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Zone Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Map controls" })).not.toBeInTheDocument();
    expect([...container.querySelectorAll("image")].map((node) => node.getAttribute("data-layer"))).toEqual(["terrain"]);
    for (const marker of ["BASE", "Destination", "position", "SCIENCE"])
      expect(container.querySelector(`[data-marker="${marker}"]`)).toBeInTheDocument();
    const route = container.querySelector('[data-route="test-route"]')!;
    const progress = container.querySelector('[data-route-progress="test-route"]')!;
    expect(progress).toHaveAttribute("points", route.getAttribute("points"));
    expect(progress).toHaveAttribute("stroke-dasharray", "0.25 1");
    fireEvent.click(screen.getByRole("button", { name: "Advance map progress" }));
    expect(progress).toHaveAttribute("stroke-dasharray", "0.5 1");
    fireEvent.click(screen.getByRole("button", { name: "Toggle execution presentation" }));
    expect(screen.getByRole("radio", { name: "Hillshade" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Slope classes" })).toBeChecked();
  });
  it("uses one camera for all geographic content, fits actual imagery, and restores the full map", async () => {
    explorerMode = true;
    wideViewport = true;
    const { container } = await renderMap();
    const svg = screen.getByRole("img", { name: "Real Jezero Crater terrain map" });
    const initial = svg.getAttribute("viewBox")!;
    const route = container.querySelector('[data-route="test-route"]')!;
    const coordinates = route.getAttribute("points");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeLessThan(
      Number(initial.split(" ")[2]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeCloseTo(
      Number(initial.split(" ")[2]),
    );
    expect(route).toHaveAttribute("points", coordinates);
    expect(route.closest("[data-geography]")).toContainElement(
      container.querySelector('image[data-layer="terrain"]'),
    );
    expect(screen.getByRole("button", { name: "Fit map" }).closest("svg")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "CTX + hillshade" }));
    const images = [...container.querySelectorAll("[data-geography] > image")].map((node) =>
      node.getAttribute("data-layer"),
    );
    expect(images).toEqual(["hillshade", "ctx"]);
    expect(screen.getAllByText("Partial imagery coverage").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0\.0–255\.0/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fit imagery" }));
    const [x, y, width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(x! + width! / 2).toBeCloseTo(304);
    expect(y! + height! / 2).toBeCloseTo(611);
    expect(width!).toBeLessThan(Number(initial.split(" ")[2]));
    fireEvent.click(screen.getByRole("button", { name: "Fit map" }));
    expect(svg).toHaveAttribute("viewBox", initial);
  });
  it("supports pointer pan and focused wheel zoom without selecting zones after a drag", async () => {
    explorerMode = true;
    wideViewport = true;
    class Pointer extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    vi.stubGlobal("PointerEvent", Pointer);
    const { container } = await renderMap();
    const svg = screen.getByRole("img", {
      name: "Real Jezero Crater terrain map",
    }) as unknown as SVGSVGElement;
    Object.defineProperty(svg, "getScreenCTM", {
      configurable: true,
      value: () => {
        const [x, y, width, height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
        return { inverse: () => ({ a: width! / 1000, b: 0, c: 0, d: height! / 700, e: x, f: y }) };
      },
    });
    const zone = screen.getByRole("button", { name: "Inspect terrain zone JZ-01" });
    const initial = svg.getAttribute("viewBox");
    fireEvent.wheel(svg, { deltaY: -100, clientX: 500, clientY: 350 });
    expect(svg).toHaveAttribute("viewBox", initial);
    fireEvent.pointerDown(zone, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 260, clientY: 240 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 260, clientY: 240 });
    fireEvent.click(zone);
    expect(zone).toHaveAttribute("aria-pressed", "false");
    expect(svg.getAttribute("viewBox")).not.toBe(initial);
    const panned = svg.getAttribute("viewBox");
    svg.focus();
    fireEvent.wheel(svg, { deltaY: -100, clientX: 500, clientY: 350 });
    expect(svg.getAttribute("viewBox")).not.toBe(panned);
    fireEvent.pointerDown(zone, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(zone, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.click(zone);
    expect(zone).toHaveAttribute("aria-pressed", "true");
    const details = screen.getByRole("region", { name: "Zone Details" });
    expect(svg.contains(details)).toBe(false);
    expect(screen.queryByRole("button", { name: "Collapse zone details" })).not.toBeInTheDocument();
    expect(details).toBeVisible();
    expect(zone).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Inspect terrain zone JZ-02" }));
    expect(within(details).getByRole("heading", { name: "JZ-02" })).toBeInTheDocument();
    fireEvent.click(zone);
    expect(within(details).getByRole("heading", { name: "JZ-01" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select destination" }));
    expect(screen.getByLabelText("Mission state")).toHaveTextContent('"destination":"JZ-01"');
    expect(container.querySelector('[data-route="test-route"]')).toBeInTheDocument();
    const beforePinch = Number(svg.getAttribute("viewBox")!.split(" ")[3]);
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: "touch", clientX: 300, clientY: 300 });
    fireEvent.pointerDown(svg, { pointerId: 2, pointerType: "touch", clientX: 500, clientY: 300 });
    fireEvent.pointerMove(svg, { pointerId: 2, pointerType: "touch", clientX: 700, clientY: 300 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.pointerUp(svg, { pointerId: 2 });
    expect(Number(svg.getAttribute("viewBox")!.split(" ")[3])).toBeLessThan(beforePinch);
  });
  it("provides a narrow-screen Layers drawer and localizes the explorer controls", async () => {
    explorerMode = true;
    await renderMap();
    expect(screen.queryByRole("radio", { name: "Terrain" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("dialog", { name: "Layers" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Resources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Science targets" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close layers" }));
    fireEvent.click(screen.getByRole("button", { name: "မြန်မာ" }));
    expect(screen.getByRole("heading", { name: myanmar["Jezero Explorer"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: myanmar["Zoom in"] })).toBeInTheDocument();
  });
  it("switches exclusive basemaps without changing mission state or routes", async () => {
    const { container } = await renderMap();
    const state = screen.getByLabelText("Mission state").textContent;
    const route = container.querySelector('[data-route="test-route"]')!;
    const routePoints = route.getAttribute("points");
    for (const [label, id] of [
      ["Elevation", "elevation"],
      ["Hillshade", "hillshade"],
      ["CTX + hillshade", "ctx"],
      ["Terrain", "terrain"],
    ] as const) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      expect(screen.getByRole("radio", { name: label })).toBeChecked();
      expect(
        screen.getAllByRole("radio").filter((node) => (node as HTMLInputElement).checked),
      ).toHaveLength(1);
      expect(container.querySelector(`image[data-layer="${id}"]`)).toHaveAttribute(
        "href",
        expect.stringContaining(`${id}_preview.png`),
      );
    }
    expect(screen.getByLabelText("Mission state").textContent).toBe(state);
    expect(route).toHaveAttribute("points", routePoints);
  });
  it("composes actual independent overlays without changing mission state or routes", async () => {
    const { container } = await renderMap();
    const state = screen.getByLabelText("Mission state").textContent;
    const route = container.querySelector('[data-route="test-route"]')!;
    const routePoints = route.getAttribute("points");
    const fetchCount = vi.mocked(fetch).mock.calls.length;
    const controls = within(screen.getByRole("complementary", { name: "Map Layers" }));
    for (const [label, id] of [
      ["Slope classes", "slope"],
      ["Terrain constraints", "constraints"],
      ["Terrain suitability", "suitability"],
      ["Historical rover observations", "rover"],
    ] as const) {
      fireEvent.click(controls.getByRole("checkbox", { name: label }));
      expect(container.querySelector(`[data-layer="${id}"]`)).toBeInTheDocument();
    }
    expect(container.querySelector('image[data-layer="slope"]')).toBeInTheDocument();
    expect(container.querySelector('image[data-layer="constraints"]')).toBeInTheDocument();
    expect(screen.getByLabelText("Mission state").textContent).toBe(state);
    expect(route).toHaveAttribute("points", routePoints);
    expect(route).toHaveAttribute("pointer-events", "none");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(fetchCount);
    for (const label of ["Resources", "Science targets"])
      expect(controls.queryByRole("checkbox", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByText("Boulder field")).not.toBeInTheDocument();
    expect(screen.queryByText("Ice signature R1")).not.toBeInTheDocument();
    fireEvent.click(controls.getByRole("checkbox", { name: "Slope classes" }));
    expect(container.querySelector('image[data-layer="slope"]')).toBeNull();
  });
  it("uses one exact full-extent canvas for previews, vectors and projected routes through resize", async () => {
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole("checkbox", { name: "Slope classes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Terrain constraints" }));
    const svg = screen.getByRole("img", { name: "Real Jezero Crater terrain map" });
    expect(svg).toHaveAttribute("viewBox", `0 0 ${pixels.width} ${pixels.height}`);
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    for (const image of container.querySelectorAll("image")) {
      expect(image).toHaveAttribute("width", String(pixels.width));
      expect(image).toHaveAttribute("height", String(pixels.height));
      expect(image).toHaveAttribute("pointer-events", "none");
    }
    const basis = manifest.raster_layers[0];
    for (const layer of manifest.raster_layers)
      expect(alignedLayer(layer, basis, pixels.width, pixels.height)).toBe(true);
    const first = projectedToPixel(
      rover.points[0],
      basis.bounds.projected_m,
      pixels.width,
      pixels.height,
    );
    const line = container.querySelector('[data-route="test-route"]')!;
    expect(line.getAttribute("points")!.split(" ")[0]).toBe(first.join(","));
    const originalPoints = line.getAttribute("points");
    fireEvent(window, new Event("resize"));
    expect(line).toHaveAttribute("points", originalPoints);
  });
  it("keeps zones interactive with labels hidden, preserves destination, and retains layer choices on remount", async () => {
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole("checkbox", { name: "Zone boundaries and labels" }));
    expect(container.querySelector("[data-zone-label]")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Terrain suitability" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Inspect terrain zone JZ-01" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("button", { name: "Select destination" }));
    expect(screen.getByLabelText("Mission state")).toHaveTextContent('"destination":"JZ-01"');
    fireEvent.click(screen.getByRole("radio", { name: "Hillshade" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle map view" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle map view" }));
    fireEvent.click(screen.getByRole("button", { name: "Show layers" }));
    expect(screen.getByRole("radio", { name: "Hillshade" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Terrain suitability" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zone boundaries and labels" })).not.toBeChecked();
    expect(screen.getByLabelText("Mission state")).toHaveTextContent('"destination":"JZ-01"');
  });
  it("keeps missing suitability values unavailable and exposes the current formula", async () => {
    currentStats = structuredClone(statistics);
    currentStats.zones[0].terrain_screening.heuristic_terrain_index = null;
    const { container } = await renderMap();
    fireEvent.click(screen.getByRole("checkbox", { name: "Terrain suitability" }));
    const scores = container.querySelector('[data-layer="suitability"]')!;
    expect(scores).toHaveTextContent("Not available");
    const known = statistics.zones[1].terrain_screening.heuristic_terrain_index;
    expect(scores).toHaveTextContent(`${known.toFixed(1)}/100`);
    fireEvent.click(screen.getByText("Layer details"));
    expect(screen.getByText(/Terrain index = gentle%/)).toBeVisible();
    expect(screen.getByText(/NoData means unassessed/)).toBeVisible();
  });
  it("disables misregistered assets and disconnected rover data without replacing them with demo data", async () => {
    currentManifest = structuredClone(manifest);
    currentManifest.raster_layers.find(
      (layer: RasterLayerManifestEntry) => layer.id === "slope",
    ).crs = "different CRS";
    roverFails = true;
    const { container } = await renderMap();
    expect(screen.getByRole("checkbox", { name: "Slope classes" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Historical rover observations" })).toBeDisabled();
    expect(container.querySelector('[data-layer="rover"]')).toBeNull();
    const terrain = container.querySelector('image[data-layer="terrain"]')!;
    fireEvent.error(terrain);
    expect(screen.getByRole("radio", { name: "Terrain" })).toBeDisabled();
    expect(screen.getByText("This layer is not available.")).toBeInTheDocument();
  });
  it("translates controls and keeps mobile collapse accessible", async () => {
    await renderMap();
    fireEvent.click(screen.getByRole("button", { name: "Hide layers" }));
    expect(screen.getByRole("button", { name: "Show layers" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "မြန်မာ" }));
    fireEvent.click(screen.getByRole("button", { name: myanmar["Show layers"] }));
    expect(screen.getByRole("button", { name: myanmar["Hide layers"] })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: myanmar["Terrain suitability"] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: myanmar["Terrain constraints"] }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary", { name: myanmar["Map Layers"] })).getByText(
        myanmar["Terrain-based planning layers."],
      ),
    ).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { fitMapBox, mapPointFromClient, panMapBox, zoomMapBox } from "@/lib/map-camera";
import { DEFAULT_REAL_MAP_LAYERS, normalizeRealMapLayers } from "@/lib/real-map-layers";

describe("shared geographic camera", () => {
  const map = { x: 0, y: 0, width: 1114, height: 1267 };
  it("fits the full map and the actual alpha footprint without cropping", () => {
    const full = fitMapBox(map, 2);
    expect(full.x).toBeLessThanOrEqual(0);
    expect(full.y).toBe(0);
    expect(full.x + full.width).toBeGreaterThanOrEqual(map.width);
    const image = { x: 115, y: 422, width: 378, height: 378 };
    const fit = fitMapBox(image, 2, 0.08);
    expect(fit.x).toBeLessThan(image.x);
    expect(fit.y).toBeLessThan(image.y);
    expect(fit.x + fit.width).toBeGreaterThan(image.x + image.width);
    expect(fit.y + fit.height).toBeGreaterThan(image.y + image.height);
    expect(fit.x + fit.width / 2).toBeCloseTo(304);
    expect(fit.y + fit.height / 2).toBeCloseTo(611);
  });
  it("keeps a pointer anchor fixed during zoom and enforces 1–20× limits", () => {
    const full = fitMapBox(map, 2);
    const anchor = { x: 250, y: 500 };
    const zoom = zoomMapBox(full, 2, anchor, full);
    expect((anchor.x - zoom.x) / zoom.width).toBeCloseTo((anchor.x - full.x) / full.width);
    expect((anchor.y - zoom.y) / zoom.height).toBeCloseTo((anchor.y - full.y) / full.height);
    expect(zoomMapBox(zoom, 1e9, anchor, full).height).toBe(full.height / 20);
    expect(zoomMapBox(zoom, 0.0001, anchor, full).height).toBe(full.height);
    expect(zoomMapBox(zoom, NaN, anchor, full)).toEqual(zoom);
  });
  it("uses inverse screen transforms and keeps pan recoverable", () => {
    const svg = {
      getScreenCTM: () => ({ inverse: () => ({ a: 2, b: 0, c: 0, d: 2, e: -100, f: 50 }) }),
    } as unknown as SVGSVGElement;
    expect(mapPointFromClient(svg, 80, 100)).toEqual({ x: 60, y: 250 });
    const moved = panMapBox(map, 1e6, -1e6, map);
    expect(moved.x + moved.width / 2).toBe(0);
    expect(moved.y + moved.height / 2).toBe(1267);
    expect(map).toEqual({ x: 0, y: 0, width: 1114, height: 1267 });
  });
  it("drops obsolete preferences and clamps only display opacity", () => {
    const old = { ...DEFAULT_REAL_MAP_LAYERS, resources: true, science: true, slopeOpacity: 3 };
    const clean = normalizeRealMapLayers(old);
    expect(clean).not.toHaveProperty("resources");
    expect(clean).not.toHaveProperty("science");
    expect(clean.slopeOpacity).toBe(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { TerrainApiError, terrainErrorMessage, terrainJson, terrainUrl } from "@/lib/terrain-http";
import { validPlan } from "@/lib/terrain-contract";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("terrain API transport", () => {
  it("uses same-origin endpoints by default and normalizes explicit API prefixes", () => {
    expect(terrainUrl("/api/v1/missions/plan")).toBe("/api/v1/missions/plan");
    expect(terrainUrl("/api/v1/health", " https://api.example/ ", "https://app.example")).toBe(
      "https://api.example/api/v1/health",
    );
    expect(terrainUrl("/api/v1/health", "/terrain/", "https://app.example")).toBe(
      "/terrain/api/v1/health",
    );
  });
  it.each([
    "http://api.example",
    "bad-host:8000",
    "//api.example",
    "http://",
    "https://user:secret@api.example",
  ])("rejects incompatible or invalid config %s", (base) => {
    expect(() => terrainUrl("/api/v1/health", base, "https://app.example")).toThrow(
      TerrainApiError,
    );
  });
  it("distinguishes connection, HTTP and invalid-response errors", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(terrainJson("/api/v1/health", {}, () => true)).rejects.toMatchObject({
      kind: "connection",
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422 });
    await expect(terrainJson("/api/v1/health", {}, () => true)).rejects.toMatchObject({
      kind: "http",
      status: 422,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ routes: "wrong" }) });
    await expect(terrainJson("/api/v1/missions/plan", {}, validPlan)).rejects.toMatchObject({
      kind: "invalid-data",
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("HTML");
      },
    });
    await expect(terrainJson("/api/v1/health", {}, () => true)).rejects.toMatchObject({
      kind: "invalid-data",
    });
  });
  it("keeps backend response details out of user-facing messages", () => {
    expect(terrainErrorMessage(new TerrainApiError("http", 503))).toContain("backend is running");
    expect(terrainErrorMessage(new TerrainApiError("http", 422))).toContain("route settings");
    expect(terrainErrorMessage(new TerrainApiError("invalid-data"))).toContain("invalid response");
    expect(terrainErrorMessage(new TerrainApiError("configuration"))).toContain("configuration");
  });
});

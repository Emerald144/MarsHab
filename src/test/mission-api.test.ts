import { afterEach, describe, expect, it, vi } from "vitest";
import { emergencyReturn, planMission } from "@/lib/mission-api";

// Address checks still return a valid API contract after local response validation.
const planResponse = {
  base: { easting: 1, northing: 2 },
  destination_zone_id: "JZ-06",
  destination_point: { easting: 3, northing: 4 },
  routes: {
    A: { available: false, reason: "No route in this address-test fixture" },
    B: { available: false, reason: "No route in this address-test fixture" },
    C: { available: false, reason: "No science waypoint selected" },
  },
  feasibility: null,
  resource_assessment: { available: false, warnings: [], assumptions: [] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mission backend address", () => {
  it("sends route requests to the page origin by default", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => planResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: false, reason: "No return route in this address-test fixture" }) });
    vi.stubGlobal("fetch", fetchMock);
    await planMission({ destinationZoneId: "JZ-06" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/missions/plan",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"destination_zone_id":"JZ-06"'),
      }),
    );
    await emergencyReturn({ current: { easting: 1, northing: 2 } });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/missions/emergency-return",
      expect.any(Object),
    );
  });

  it("honors an explicit public API base without duplicate slashes", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://terrain.example/");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => planResponse });
    vi.stubGlobal("fetch", fetchMock);
    await planMission({ destinationZoneId: "JZ-06" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://terrain.example/api/v1/missions/plan",
      expect.any(Object),
    );
  });
});

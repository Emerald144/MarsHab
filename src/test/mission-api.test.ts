import { afterEach, describe, expect, it, vi } from "vitest";
import { emergencyReturn, planMission } from "@/lib/mission-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mission backend address", () => {
  it("sends route requests to the page origin by default", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
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
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await planMission({ destinationZoneId: "JZ-06" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://terrain.example/api/v1/missions/plan",
      expect.any(Object),
    );
  });
});

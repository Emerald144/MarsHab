import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { planMission, useScienceWaypoints } from "@/lib/mission-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("loads verified Route C waypoints through the same-origin science proxy", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: "verified-site" }], total: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useScienceWaypoints(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/science/targets?verified_route_eligible=true");
  expect(result.current.data?.items[0]?.id).toBe("verified-site");
  client.clear();
});

it("reports a disconnected catalog once and permits an explicit retry instead of silently displaying an empty catalog", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useScienceWaypoints(), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.data).toBeUndefined();
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: "verified-site" }], total: 1 }) });
  await result.current.refetch();
  await waitFor(() => expect(result.current.data?.total).toBe(1));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  client.clear();
});

it("sends the explicitly selected science waypoint to the mission planner on the same origin", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "");
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
  vi.stubGlobal("fetch", fetchMock);
  await expect(planMission({ destinationZoneId: "JZ-07", scienceWaypointId: "m2020-places-site08-cache-depot" })).rejects.toMatchObject({ kind: "http", status: 503 });
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/missions/plan");
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ destination_zone_id: "JZ-07", science_waypoint_id: "m2020-places-site08-cache-depot" });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING,
  PAPER_SPEED_KMH,
  assessLoad,
  evaluateRoute,
  travelHours,
} from "@/lib/route-model";
import { assessMissionRoute, evaluatedPlan, rankedRoutes } from "@/lib/mission-evaluation";
import type { MissionPlan, RouteFeature } from "@/lib/mission-api";

const inputs = {
  ...DEFAULT_PLANNING,
  outboundSpeedKmh: PAPER_SPEED_KMH,
  returnSpeedKmh: PAPER_SPEED_KMH,
};
const evidence = {
  outbound: [{ distanceKm: PAPER_SPEED_KMH }],
  reversible: true,
  provenance: "scenario" as const,
};
const research = {
  ...inputs,
  crewMassKg: 49,
  evaVo2Max: 36,
  suitMassKg: 104,
  suitMassBasis: "loaded" as const,
  equipmentMassKg: 23,
  sampleMassKg: 0,
  pressureOffloadN: 213,
};

describe("route planning budgets", () => {
  it("reproduces exact mph conversion and half-hour walkback", () => {
    expect(PAPER_SPEED_KMH).toBe(3.5405568);
    expect(travelHours([{ distanceKm: 3.5405568 }], PAPER_SPEED_KMH)).toBe(1);
    expect(travelHours([{ distanceKm: 1.7702784 }], PAPER_SPEED_KMH)).toBe(0.5);
  });
  it("separates EVA and emergency budgets and includes contingency", () => {
    expect(evaluateRoute(evidence, inputs)).toMatchObject({
      eva: "within",
      emergency: "within",
      coverage: "full route",
    });
    expect(evaluateRoute(evidence, { ...inputs, emergencyContingencyMinutes: 1 })).toMatchObject({
      eva: "within",
      emergency: "exceeded",
    });
  });
  it("uses distinct outbound/return paths and speeds without double-counting", () => {
    const a = evaluateRoute(
      { ...evidence, returnPath: [{ distanceKm: 2 }] },
      {
        ...inputs,
        outboundSpeedKmh: 1,
        returnSpeedKmh: 2,
        scienceHours: 0,
        bufferHours: 0,
      },
    );
    expect(a.totalHours).toBe(PAPER_SPEED_KMH + 1);
  });
  it("keeps missing paths unknown and never retraces blocked routes or loops", () => {
    expect(evaluateRoute({ provenance: "unknown" }, inputs)).toMatchObject({
      eva: "unknown",
      emergency: "unknown",
      coverage: "none",
    });
    for (const flags of [{ blocked: true }, { loop: true }]) {
      expect(evaluateRoute({ ...evidence, ...flags }, inputs).emergency).toBe("unknown");
    }
    expect(
      evaluateRoute({ returnPath: [{ distanceKm: 1 }], provenance: "scenario" }, inputs).coverage,
    ).toBe("destination only");
  });
  it.each([NaN, Infinity, -1, 0])("rejects invalid speed %s", (speed) => {
    expect(travelHours(evidence.outbound, speed)).toBeNull();
    expect(evaluateRoute(evidence, { ...inputs, emergencySpeedKmh: speed }).emergency).toBe(
      "unknown",
    );
  });
  it.each([NaN, Infinity, -1])("rejects invalid distances and durations %s", (value) => {
    expect(travelHours([{ distanceKm: value }], 1)).toBeNull();
    expect(evaluateRoute(evidence, { ...inputs, restHours: value }).eva).toBe("unknown");
  });
});
describe("preliminary research comparison", () => {
  it("reproduces approximately 104 kg with rounded paper constants", () => {
    const allowance = assessLoad(research).stages[0]!.estimatedMaxSuitMassKg;
    expect(allowance).toBeCloseTo(101.023299821269, 10);
    // The paper reports 104 kg; its rounded SI inputs do not exactly reproduce it.
    // Keep this documented ~3 kg discrepancy visible rather than calibrating constants.
    expect(Math.abs(allowance - 104)).toBeLessThan(3.1);
  });
  it("added samples increase perceived force and reduce allowance kilogram for kilogram", () => {
    const a = assessLoad(research),
      b = assessLoad({ ...research, sampleMassKg: 10 });
    expect(a.stages[0]!.estimatedMaxSuitMassKg - b.stages[1]!.estimatedMaxSuitMassKg).toBeCloseTo(
      10,
      10,
    );
    expect(b.stages[1]!.perceivedForceN - a.stages[1]!.perceivedForceN).toBeCloseTo(37.3, 10);
    expect(b.status).toBe("Above preliminary model estimate");
  });
  it("missing, dry-basis or invalid inputs remain unassessed", () => {
    expect(assessLoad(inputs).status).toBe("Not assessed");
    for (const change of [
      { pressureOffloadN: undefined },
      { suitMassBasis: "dry" as const },
      { evaVo2Max: 14 },
      { crewMassKg: -1 },
      { sampleMassKg: Infinity },
    ]) {
      expect(assessLoad({ ...research, ...change }).status).toBe("Not assessed");
    }
  });
  it("suit mass alone never modifies walking time", () => {
    expect(evaluateRoute(evidence, research).totalHours).toBe(
      evaluateRoute(evidence, { ...research, suitMassKg: 400 }).totalHours,
    );
  });
});
describe("shared comparison and report projection", () => {
  const route = (km: number) =>
    ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [km * 1000, 0],
        ],
      },
      properties: { estimated_total_eva_hours: 999 },
    }) as RouteFeature;
  const plan = {
    routes: {
      A: { name: "Shortest Distance", available: true, route: route(1) },
      B: { name: "Terrain-Aware", available: true, route: route(5) },
      C: { available: false },
    },
    resource_assessment: { available: false },
    feasibility: {},
  } as MissionPlan;
  it("ranks configured constraints, replacing automatic B preference", () => {
    expect(rankedRoutes(plan, inputs)[0]!.id).toBe("A");
  });
  it("report and comparison times agree with the pure evaluator and update on input changes", () => {
    for (const i of [inputs, { ...inputs, returnSpeedKmh: 0.5, restHours: 2 }]) {
      const p = evaluatedPlan(plan, i)!;
      expect(p.feasibility!.estimated_total_hours).toBe(
        assessMissionRoute(plan.routes.A.available ? plan.routes.A.route : route(0), i).totalHours,
      );
      expect(p.routes.A.available && p.routes.A.route.properties.estimated_total_eva_hours).toBe(
        p.feasibility!.estimated_total_hours,
      );
    }
  });
});

/** Pure planning model. ICES-2026-127 is preliminary research, not clearance. */
/** 2.2 mph × 1.609344 km/mile; explicit decimal avoids conversion roundoff. */
export const PAPER_SPEED_KMH = 3.5405568;
export const EARTH_GRAVITY = 9.80665;
export const MARS_GRAVITY = 3.73;
export type BudgetStatus = "within" | "exceeded" | "unknown";
export type PlanningInputs = {
  outboundSpeedKmh: number;
  returnSpeedKmh: number;
  emergencySpeedKmh: number;
  evaHours: number;
  scienceHours: number;
  restHours: number;
  bufferHours: number;
  emergencyBudgetMinutes: number;
  emergencyContingencyMinutes: number;
  resourceBudgetPercent?: number;
  resourceReservePercent?: number;
  resourceRatePercentPerHour?: number;
  crewMassKg?: number | undefined;
  evaVo2Max?: number | undefined;
  suitMassKg?: number | undefined;
  suitMassBasis: "dry" | "loaded" | "unknown";
  equipmentMassKg?: number | undefined;
  sampleMassKg?: number | undefined;
  pressureOffloadN?: number | undefined;
};
export const DEFAULT_PLANNING: PlanningInputs = {
  outboundSpeedKmh: 1,
  returnSpeedKmh: 1,
  emergencySpeedKmh: PAPER_SPEED_KMH,
  evaHours: 8,
  scienceHours: 1.2,
  restHours: 0,
  bufferHours: 0.5,
  emergencyBudgetMinutes: 60,
  emergencyContingencyMinutes: 0,
  suitMassBasis: "unknown",
};
export type Segment = { distanceKm: number; speedKmh?: number };
export type RouteEvidence = {
  outbound?: Segment[] | undefined;
  returnPath?: Segment[];
  /** Explicit network paths, one per assessed waypoint. */
  emergencyPaths?: Segment[][];
  emergencyPathsCoverFullRoute?: boolean;
  reversible?: boolean;
  blocked?: boolean;
  loop?: boolean;
  provenance: "measured" | "scenario" | "unknown";
};
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const positive = (v: unknown): v is number => nonnegative(v) && v > 0;
export function travelHours(segments: Segment[] | undefined, speed: number): number | null {
  if (!segments?.length) return null;
  let total = 0;
  for (const s of segments) {
    const pace = s.speedKmh ?? speed;
    if (!nonnegative(s.distanceKm) || !positive(pace)) return null;
    total += s.distanceKm / pace;
  }
  return Number.isFinite(total) ? total : null;
}
function budget(value: number | null, limit: number): BudgetStatus {
  return value === null || !nonnegative(value) || !positive(limit)
    ? "unknown"
    : value <= limit
      ? "within"
      : "exceeded";
}
export function assessLoad(i: PlanningInputs) {
  const missing =
    !positive(i.crewMassKg) ||
    !positive(i.evaVo2Max) ||
    i.evaVo2Max <= 14 ||
    !nonnegative(i.suitMassKg) ||
    i.suitMassBasis !== "loaded" ||
    !nonnegative(i.equipmentMassKg) ||
    !nonnegative(i.sampleMassKg) ||
    !nonnegative(i.pressureOffloadN);
  if (missing) return { status: "Not assessed" as const, stages: [] };
  const mobilityFactor = 1 - 14 / i.evaVo2Max!;
  const crewCapabilityN = (i.crewMassKg! * EARTH_GRAVITY + 227) * mobilityFactor;
  const stages = [i.equipmentMassKg!, i.equipmentMassKg! + i.sampleMassKg!].map(
    (carriedMassKg) => ({
      carriedMassKg,
      mobilityFactor,
      crewCapabilityN,
      perceivedForceN:
        (i.crewMassKg! + i.suitMassKg! + carriedMassKg) * MARS_GRAVITY - i.pressureOffloadN!,
      estimatedMaxSuitMassKg:
        (crewCapabilityN + i.pressureOffloadN!) / MARS_GRAVITY - i.crewMassKg! - carriedMassKg,
    }),
  );
  if (stages.some((s) => !Object.values(s).every(Number.isFinite)))
    return { status: "Not assessed" as const, stages: [] };
  return {
    status: stages.every((s) => s.perceivedForceN <= s.crewCapabilityN)
      ? ("Within preliminary model estimate" as const)
      : ("Above preliminary model estimate" as const),
    stages,
  };
}
export function evaluateRoute(e: RouteEvidence, i: PlanningInputs) {
  const assumptions = [
    "Scenario speeds; no validated mass, terrain or fatigue speed model.",
    "Time budgets do not establish safety. Oxygen, battery, radiation, thermal stress and fall recovery are unassessed.",
  ];
  const retrace = e.reversible === true && !e.blocked && !e.loop;
  const returnPath = e.returnPath ?? (retrace ? e.outbound?.slice().reverse() : undefined);
  if (retrace)
    assumptions.push(
      "Retrace the reversible outbound path to base; no rover refuge or rescue assumed.",
    );
  const outboundHours = travelHours(e.outbound, i.outboundSpeedKmh);
  // Direction-specific speed overrides must be supplied on an explicit return path.
  const returnHours = travelHours(
    e.returnPath ?? returnPath?.map((s) => ({ distanceKm: s.distanceKm })),
    i.returnSpeedKmh,
  );
  const total =
    outboundHours !== null &&
    returnHours !== null &&
    [i.scienceHours, i.restHours, i.bufferHours].every(nonnegative)
      ? outboundHours + returnHours + i.scienceHours + i.restHours + i.bufferHours
      : null;
  const totalHours = total !== null && Number.isFinite(total) ? total : null;
  let coverage: "full route" | "destination only" | "none" = "none";
  let emergencyHours: number | null = null;
  if (retrace && e.outbound?.length) {
    // Every segment endpoint, including base. Positive lengths make destination worst.
    const times = e.outbound.map((s) =>
      travelHours([{ distanceKm: s.distanceKm }], i.emergencySpeedKmh),
    );
    if (times.every((v): v is number => v !== null)) {
      emergencyHours = times.reduce((a, b) => a + b, 0);
      coverage = "full route";
    }
  } else if (e.emergencyPaths?.length) {
    const times = e.emergencyPaths.map((p) => travelHours(p, i.emergencySpeedKmh));
    if (times.every((v): v is number => v !== null)) {
      emergencyHours = Math.max(...times);
      coverage = e.emergencyPathsCoverFullRoute ? "full route" : "destination only";
    }
  } else if (e.returnPath) {
    emergencyHours = travelHours(
      e.returnPath.map((s) => ({ distanceKm: s.distanceKm })),
      i.emergencySpeedKmh,
    );
    if (emergencyHours !== null) coverage = "destination only";
  }
  emergencyHours =
    emergencyHours !== null && nonnegative(i.emergencyContingencyMinutes)
      ? emergencyHours + i.emergencyContingencyMinutes / 60
      : null;
  if (emergencyHours !== null && !Number.isFinite(emergencyHours)) emergencyHours = null;
  return {
    outboundHours,
    returnHours,
    totalHours,
    emergencyHours,
    eva: budget(totalHours !== null && Number.isFinite(totalHours) ? totalHours : null, i.evaHours),
    emergency: budget(emergencyHours, i.emergencyBudgetMinutes / 60),
    coverage,
    load: assessLoad(i),
    provenance: e.provenance,
    assumptions,
    missing: [
      "Validated life-support consumption and terrain/mobility performance data",
      ...(coverage !== "full route" ? ["Return paths for every waypoint"] : []),
      ...(assessLoad(i).status === "Not assessed"
        ? [
            "Loaded suit mass/basis, EVA VO2max, body/equipment/sample mass and suit-specific pressure offload",
          ]
        : []),
    ],
  };
}

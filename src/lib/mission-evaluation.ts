import type { MissionPlan, RouteFeature } from "./mission-api";
import { evaluateRoute, type PlanningInputs, type RouteEvidence } from "./route-model";

/** API geometry is in Mars projected metres, never SVG pixels. */
export function routeEvidence(route: RouteFeature): RouteEvidence {
  const coordinates = route.geometry.coordinates;
  const valid =
    coordinates.length >= 2 && coordinates.every((p) => p.length === 2 && p.every(Number.isFinite));
  const loop = new Set(coordinates.map((p) => `${p[0]},${p[1]}`)).size !== coordinates.length;
  return {
    outbound: valid
      ? coordinates.slice(1).map((p, n) => ({
          distanceKm: Math.hypot(p[0] - coordinates[n]![0], p[1] - coordinates[n]![1]) / 1000,
        }))
      : undefined,
    // The backend's static 8-connected grid has symmetric traversal edges.
    // Closures invalidate the original path; revised paths require a new assessment.
    reversible: valid,
    loop,
    provenance: valid ? "measured" : "unknown",
  };
}
export const assessMissionRoute = (route: RouteFeature, inputs: PlanningInputs, blocked = false) =>
  evaluateRoute({ ...routeEvidence(route), blocked }, inputs);
export function assessEmergencyPath(route: RouteFeature, inputs: PlanningInputs) {
  const e = routeEvidence(route);
  return evaluateRoute(
    { provenance: e.provenance, ...(e.outbound ? { returnPath: e.outbound } : {}) },
    inputs,
  );
}
export function rankedRoutes(
  plan: MissionPlan | undefined | null,
  inputs: PlanningInputs,
  blocked = false,
) {
  if (!plan) return [];
  return (["A", "B"] as const)
    .flatMap((id) => {
      const outcome = plan.routes[id];
      return outcome.available
        ? [
            {
              id,
              route: outcome.route,
              assessment: assessMissionRoute(outcome.route, inputs, blocked),
            },
          ]
        : [];
    })
    .sort((a, b) => {
      const penalty = (r: typeof a) =>
        [r.assessment.eva, r.assessment.emergency].reduce(
          (sum, s) => sum + (s === "exceeded" ? 10 : s === "unknown" ? 1 : 0),
          0,
        );
      return (
        penalty(a) - penalty(b) ||
        (a.assessment.totalHours ?? Infinity) - (b.assessment.totalHours ?? Infinity)
      );
    });
}

/** Compatibility projection for existing displays, all derived from the same evaluator. */
export function evaluatedPlan(
  plan: MissionPlan | null | undefined,
  inputs: PlanningInputs,
  selectedId?: "A" | "B" | "C",
  blocked = false,
): MissionPlan | undefined {
  if (!plan) return undefined;
  const ranked = rankedRoutes(plan, inputs, blocked);
  const best = selectedId ? ranked.find((r) => r.id === selectedId) : ranked[0];
  const routes = { ...plan.routes };
  for (const id of ["A", "B"] as const) {
    const outcome = routes[id];
    if (!outcome.available) continue;
    const a = assessMissionRoute(outcome.route, inputs, blocked);
    const segments = routeEvidence(outcome.route).outbound;
    const distanceKm = segments?.reduce((sum, s) => sum + s.distanceKm, 0) ?? NaN;
    const updated = {
      ...outcome.route,
      properties: {
        ...outcome.route.properties,
        distance_m: distanceKm * 1000,
        distance_km: distanceKm,
        estimated_one_way_hours: a.outboundHours ?? NaN,
        estimated_total_eva_hours: a.totalHours ?? NaN,
        passes_demo_time_assumptions: a.eva === "unknown" ? null : a.eva === "within",
      },
    };
    if (id === "A" && routes.A.available) routes.A = { ...routes.A, route: updated };
    if (id === "B" && routes.B.available) routes.B = { ...routes.B, route: updated };
  }
  const a = best?.assessment;
  const resource = {
    ...plan.resource_assessment,
    warnings: plan.resource_assessment?.warnings ?? [],
    assumptions: plan.resource_assessment?.assumptions ?? [],
  };
  if (inputs.resourceBudgetPercent !== undefined)
    resource.budget_percent = inputs.resourceBudgetPercent;
  if (inputs.resourceReservePercent !== undefined)
    resource.reserve_percent = inputs.resourceReservePercent;
  if (inputs.resourceRatePercentPerHour !== undefined)
    resource.consumption_rate_percent_per_hour = inputs.resourceRatePercentPerHour;
  if (resource.budget_percent != null && resource.reserve_percent != null) {
    resource.reserved_percent = (resource.budget_percent * resource.reserve_percent) / 100;
  }
  // Preserve the existing abstract percentage model, using the updated total duration.
  if (
    a?.totalHours == null ||
    ![
      resource.budget_percent,
      resource.reserve_percent,
      resource.consumption_rate_percent_per_hour,
    ].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
    (resource.budget_percent ?? 0) > 100 ||
    (resource.reserve_percent ?? 0) > 100
  ) {
    resource.available = false;
    resource.feasible = null;
    resource.estimated_use_percent = null;
    resource.remaining_after_reserve_percent = null;
    resource.warning_level = "unavailable";
    resource.warnings = ["Resource estimate unavailable: incomplete or invalid planning inputs."];
  }
  if (
    resource.available &&
    a?.totalHours != null &&
    resource.consumption_rate_percent_per_hour != null &&
    resource.budget_percent != null &&
    resource.reserved_percent != null
  ) {
    resource.modeled_hours = a.totalHours;
    resource.estimated_use_percent = a.totalHours * resource.consumption_rate_percent_per_hour;
    resource.remaining_after_reserve_percent =
      resource.budget_percent - resource.reserved_percent - resource.estimated_use_percent;
    resource.feasible = resource.remaining_after_reserve_percent >= 0;
    resource.warning_level = !resource.feasible
      ? "insufficient"
      : resource.remaining_after_reserve_percent <= resource.budget_percent * 0.1
        ? "low"
        : "ok";
    resource.warnings =
      resource.warning_level === "insufficient"
        ? ["Estimated use exceeds the configurable resource budget after reserve."]
        : resource.warning_level === "low"
          ? ["Only a low resource margin remains after the configured reserve."]
          : [];
  }
  return {
    ...plan,
    routes,
    resource_assessment: resource,
    feasibility:
      a && plan.feasibility
        ? {
            ...plan.feasibility,
            basis_route: best.id === "A" ? "shortest" : "terrain_aware",
            estimated_outbound_hours: a.outboundHours ?? NaN,
            estimated_return_hours: a.returnHours ?? NaN,
            estimated_total_hours: a.totalHours ?? NaN,
            remaining_eva_hours: a.totalHours === null ? null : inputs.evaHours - a.totalHours,
            time_feasible: a.eva === "unknown" ? null : a.eva === "within",
            feasible:
              a.eva === "unknown" || a.emergency === "unknown"
                ? null
                : a.eva === "within" && a.emergency === "within" && resource.feasible !== false,
            resource_feasible: resource.feasible,
          }
        : null,
  };
}

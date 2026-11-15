import { ArrowRight } from "lucide-react";
import AnimatedContent from "@/components/animations/AnimatedContent";
import { useLanguage } from "@/i18n/useLanguage";
import type { RouteId } from "@/lib/mission-data";
import { evaluatedPlan, rankedRoutes } from "@/lib/mission-evaluation";
import { useMission } from "@/lib/mission-store";
import { planningInputs, RouteAssessment } from "./RouteAssessment";
import { RealTerrainMap } from "./RealTerrainMap";
import { Panel } from "./ui";

const routeIds: RouteId[] = ["A", "B", "C"];
const routeColors = { A: "var(--data)", B: "var(--safe)", C: "var(--mars)" };

export function RouteAnalysis() {
  const { t, display } = useLanguage();
  const m = useMission();
  const inputs = planningInputs(m.setup);
  const plan = evaluatedPlan(m.missionPlan, inputs, m.activeRoute);
  if (!m.routesGenerated || !plan)
    return (
      <div className="glass mx-auto max-w-lg p-10 text-center">
        <p className="text-muted-foreground">
          {t("No routes yet. Select a destination and pass the feasibility check first.")}
        </p>
        <button onClick={() => m.setView("planner")} className="btn-mars mt-6 px-6 py-3 text-xs">
          {t("Open Mission Planner")}
        </button>
      </div>
    );

  const ranked = rankedRoutes(plan, inputs);
  const preferred = ranked[0];
  const outcome = plan.routes[m.activeRoute];
  const selected = outcome.available ? outcome.route : null;
  const assessment = ranked.find((route) => route.id === m.activeRoute)?.assessment;
  const resource = plan.resource_assessment;
  const waypoint = m.activeRoute === "C" && plan.routes.C.available ? plan.routes.C.waypoint : null;
  // Draw the selected route last and at full contrast, without changing its geometry.
  const overlays = [...routeIds.filter((id) => id !== m.activeRoute), m.activeRoute].flatMap(
    (id) => {
      const result = plan.routes[id];
      return result.available
        ? [
            {
              id,
              color: routeColors[id],
              opacity: id === m.activeRoute ? 1 : 0.3,
              dash: id === "A" ? "10 8" : undefined,
              coordinates: result.route.geometry.coordinates,
            },
          ]
        : [];
    },
  );
  const waypointLocation = plan.routes.C.available ? plan.routes.C.waypoint.location : null;
  const rows: [string, (id: RouteId) => string][] = [
    [
      "Distance",
      (id) => {
        const r = plan.routes[id];
        return r.available ? `${r.route.properties.distance_km.toFixed(1)} km` : "—";
      },
    ],
    [
      "Mean Slope",
      (id) => {
        const r = plan.routes[id];
        return r.available ? `${r.route.properties.mean_slope_degrees.toFixed(1)}°` : "—";
      },
    ],
    [
      "Elevation Gain / Loss",
      (id) => {
        const r = plan.routes[id];
        return r.available
          ? `+${r.route.properties.elevation_gain_m.toFixed(0)} / -${r.route.properties.elevation_loss_m.toFixed(0)} m`
          : "—";
      },
    ],
    [
      "Estimated Mission Time",
      (id) => {
        const r = plan.routes[id];
        return r.available ? `${r.route.properties.estimated_total_eva_hours.toFixed(1)} h` : "—";
      },
    ],
    [
      "Feasible (requested EVA)",
      (id) => {
        const r = plan.routes[id];
        if (!r.available) return t("No route");
        return r.route.properties.passes_demo_time_assumptions === null
          ? t("No EVA limit set")
          : display(r.route.properties.passes_demo_time_assumptions ? "YES" : "NO");
      },
    ],
    [
      "Emergency return",
      (id) => {
        const status = ranked.find((route) => route.id === id)?.assessment.emergency;
        return display(
          status === "within"
            ? "Within budget"
            : status === "exceeded"
              ? "Over budget"
              : "Not assessed",
        );
      },
    ],
  ];
  const number = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? `${value.toFixed(1)}%` : display("Not available");

  return (
    <div className="min-w-0 space-y-4">
      <div
        data-planning-workspace
        className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      >
        <div data-terrain-map-panel className="min-w-0">
          <RealTerrainMap
            explorer
            layerState={m.realMapLayers}
            onLayerStateChange={m.setRealMapLayers}
            className="h-[clamp(300px,50svh,560px)]"
            hidePanel
            hideLayerControls
            selectedZoneId={plan.destination_zone_id}
            routes={overlays}
            basePoint={plan.base}
            {...(waypointLocation?.x_m != null && waypointLocation.y_m != null
              ? { waypointPoint: { easting: waypointLocation.x_m, northing: waypointLocation.y_m } }
              : {})}
          />
        </div>

        <section
          data-route-comparison-panel
          aria-label={t("Route Analysis")}
          className="glass min-w-0 p-4"
        >
          <h2 className="mb-3 font-display text-lg font-semibold">{t("Route Analysis")}</h2>
          <table className="w-full table-fixed text-xs sm:text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="w-[31%] pb-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {t("Factor")}
                </th>
                {routeIds.map((id) => (
                  <th scope="col" key={id} className="px-0.5 pb-3 align-top">
                    <button
                      type="button"
                      aria-label={`${t("ROUTE")} ${id} · ${display(plan.routes[id].name)}`}
                      aria-pressed={m.activeRoute === id}
                      disabled={!plan.routes[id].available}
                      onClick={() => m.setActiveRoute(id)}
                      className={`focus-ring min-h-11 w-full rounded-lg border px-1 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${m.activeRoute === id ? "border-data bg-data/10 text-foreground" : "border-border text-muted-foreground hover:bg-data/5 hover:text-foreground"}`}
                    >
                      <span style={{ color: routeColors[id] }}>
                        {t("Route")} {id}
                      </span>
                      <span className="mt-1 block break-words text-[11px] font-normal leading-relaxed">
                        {display(plan.routes[id].name)}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-t border-border/60">
                  <th
                    scope="row"
                    className="break-words py-2 pr-2 text-left text-xs font-normal text-muted-foreground"
                  >
                    {display(label)}
                  </th>
                  {routeIds.map((id) => (
                    <td
                      key={id}
                      className={`break-words px-1 py-2 text-center text-xs ${m.activeRoute === id ? "bg-data/10 font-semibold" : "text-muted-foreground"}`}
                    >
                      {plan.routes[id].available ? value(id) : t("Unavailable")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
            {plan.routes.C.available
              ? t(
                  "Route C (Science Priority) waypoint: {name} — {kind}, {evidence}. {limitations}",
                  {
                    name: plan.routes.C.waypoint.name,
                    kind: plan.routes.C.waypoint.kind,
                    evidence: plan.routes.C.waypoint.evidence_level,
                    limitations: plan.routes.C.waypoint.limitations[0] ?? "",
                  },
                )
              : `${t("Route C (Science Priority):")} ${plan.routes.C.reason}`}
          </p>
          <div aria-live="polite" className="mt-3 space-y-2 text-xs leading-relaxed">
            {!outcome.available && (
              <p className="text-danger">
                {t("Unavailable")}: {outcome.reason}
              </p>
            )}
            {selected && (assessment?.eva === "exceeded" || resource.feasible === false) && (
              <p className="font-semibold text-danger">{t("MISSION NOT FEASIBLE")}</p>
            )}
            {selected && assessment?.eva === "exceeded" && (
              <p className="text-caution">
                {display("Mission time")} · {display("Over budget")}
              </p>
            )}
            {selected && assessment?.emergency === "exceeded" && (
              <p className="text-caution">
                {display("Emergency return")} · {display("Over budget")}
              </p>
            )}
            {selected &&
              resource.warnings.map((warning) => (
                <p key={warning} className="text-caution">
                  {display(warning)}
                </p>
              ))}
            {selected &&
              plan.feasibility?.warnings.map((warning) => (
                <p key={warning} className="text-caution">
                  {display(warning)}
                </p>
              ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {display("Planning estimates, not a safety certification.")}
          </p>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              m.setEnvChanged(false);
              m.setRerouted(false);
              m.setView("execution");
            }}
            className="btn-mars mt-4 flex min-h-11 w-full items-center justify-center gap-2 px-3 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("Start Simulated Mission")}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </section>
      </div>

      <section aria-label={t("Selected Route")}>
        <Panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              {t("Selected Route")} · {t("Route")} {m.activeRoute}
            </h2>
            {selected && preferred?.id === m.activeRoute && (
              <span className="text-xs text-safe">{t("⭐ Recommended Route")}</span>
            )}
          </div>
          {selected ? (
            <>
              {waypoint && (
                <p className="mt-2 text-sm">
                  {t("Via")} {waypoint.name}
                </p>
              )}
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <RouteAssessment setup={m.setup} route={selected} compact />
                <div className="my-3 min-w-0 space-y-3 text-sm">
                  <h3 className="font-medium">{display("Abstract Resource Model")}</h3>
                  <dl className="space-y-2">
                    {[
                      [
                        "Abstract Resource Budget",
                        resource.available
                          ? number(resource.budget_percent)
                          : display("Not available"),
                      ],
                      [
                        "Resource Safety Reserve",
                        resource.available
                          ? number(resource.reserved_percent)
                          : display("Not available"),
                      ],
                      [
                        "Estimated use",
                        resource.available
                          ? number(resource.estimated_use_percent)
                          : display("Not available"),
                      ],
                      [
                        "Remaining after reserve",
                        resource.available
                          ? number(resource.remaining_after_reserve_percent)
                          : display("Not available"),
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-wrap justify-between gap-2">
                        <dt className="text-muted-foreground">{display(label!)}</dt>
                        <dd className="font-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <details className="border-t border-border pt-3 text-xs leading-relaxed">
                    <summary className="cursor-pointer font-medium">{display("Details")}</summary>
                    <p className="mt-2">{resource.model}</p>
                    {resource.assumptions.map((note) => (
                      <p key={note} className="mt-2 text-muted-foreground">
                        {display(note)}
                      </p>
                    ))}
                    <p className="mt-2 text-muted-foreground">
                      {t("Terrain-cost-based comfort (heuristic from mean slope)")}:{" "}
                      {Math.max(
                        0,
                        Math.min(100, 100 - selected.properties.mean_slope_degrees * 4),
                      ).toFixed(1)}
                      /100
                    </p>
                  </details>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-danger">{!outcome.available && outcome.reason}</p>
          )}
        </Panel>
      </section>
      <AnimatedContent distance={35} duration={0.8} scale={0.98} blur={2} className="min-w-0">
        <Panel title={t("Why this route?")}>
          {selected ? (
            <>
              <p className="text-sm leading-relaxed">{selected.properties.algorithm}</p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {display("Assumptions and limitations")}
                </summary>
                <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {selected.properties.assumptions.map((note) => (
                    <li key={note}>{display(note)}</li>
                  ))}
                  {waypoint?.limitations.map((note) => (
                    <li key={note}>{display(note)}</li>
                  ))}
                  <li>{display(selected.properties.disclaimer)}</li>
                </ul>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("No route to explain — none could be computed.")}
            </p>
          )}
        </Panel>
      </AnimatedContent>
    </div>
  );
}

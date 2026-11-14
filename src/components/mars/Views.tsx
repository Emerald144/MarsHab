import { useLanguage } from "@/i18n/useLanguage";
import { ModeSelector } from "@/features/survival-map/SurvivalMapView";
import { useEffect, useMemo, useState } from "react";
import AnimatedContent from "@/components/animations/AnimatedContent";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  Cpu,
  Download,
  ListChecks,
  Star,
} from "lucide-react";
import { OverviewDashboard } from "./overview/OverviewDashboard";
import { MODE_WEIGHTS } from "@/lib/mission-data";
import { partialTerrainScore, useRealTerrainDataset, type JezeroZoneId } from "@/lib/jezero-real-data";
import {
  useMissionPlanQuery,
  useEmergencyReturnMutation,
  type MarsPoint,
  type RouteFeature,
  type MissionPlan,
} from "@/lib/mission-api";
import { useMission } from "@/lib/mission-store";
import { RealTerrainMap } from "./RealTerrainMap";
import { Panel, Ring } from "./ui";
export { SurvivalMapView } from "@/features/survival-map/SurvivalMapView";

/** Shared real mission plan for the currently selected JZ destination + mission setup. */
function useRealMissionPlan(enabled = true) {
  const { destination, setup } = useMission();
  return useMissionPlanQuery(
    {
      destinationZoneId: destination,
      evaHours: setup.eva,
      scienceHours: setup.science,
      bufferHours: setup.buffer,
      walkingSpeedMPerHour: setup.walkingSpeedMPerHour,
    },
    enabled,
  );
}

function preferredRoute(plan: MissionPlan | undefined) {
  if (!plan) return null;
  if (plan.routes.B.available) return { id: "B" as const, route: plan.routes.B.route };
  if (plan.routes.A.available) return { id: "A" as const, route: plan.routes.A.route };
  return null;
}

function interpolateAlongPath(coordinates: [number, number][], progress: number): MarsPoint {
  if (coordinates.length === 0) return { easting: 0, northing: 0 };
  const clamped = Math.max(0, Math.min(1, progress));
  const lengths = coordinates.slice(1).map((point, index) =>
    Math.hypot(point[0] - coordinates[index]![0], point[1] - coordinates[index]![1]),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { easting: coordinates[0]![0], northing: coordinates[0]![1] };
  let remaining = clamped * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index]!;
    if (remaining <= segment) {
      const start = coordinates[index]!;
      const end = coordinates[index + 1]!;
      const fraction = segment === 0 ? 0 : remaining / segment;
      return {
        easting: start[0] + (end[0] - start[0]) * fraction,
        northing: start[1] + (end[1] - start[1]) * fraction,
      };
    }
    remaining -= segment;
  }
  const point = coordinates[coordinates.length - 1]!;
  return { easting: point[0], northing: point[1] };
}

/* ---------------- OVERVIEW ---------------- */
export function Overview() {
  const plan = useRealMissionPlan();
  const { data: dataset } = useRealTerrainDataset();
  return <OverviewDashboard plan={plan.data} isLoading={plan.isLoading} isError={plan.isError} dataset={dataset} />;
}

/* ---------------- PLANNER ---------------- */
export function Planner() {
  const { t, display } = useLanguage();
  const m = useMission();
  const { setup, setSetup } = m;
  const { data: dataset } = useRealTerrainDataset();
  const plan = useRealMissionPlan(m.feasibilityChecked);
  const [generating, setGenerating] = useState(false);
  const field =
    "w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-data focus:shadow-[var(--glow-data)]";
  const num = (k: "eva" | "science" | "buffer" | "resource" | "walkingSpeedMPerHour", label: string, step = 0.1, unit = "h") => (
    <label className="block">
      <span className="label-caps">{display(label)}</span>
      <div className="relative mt-1">
        <input
          type="number"
          aria-label={display(label)}
          step={step}
          value={setup[k]}
          onChange={(e) => {
            setSetup({ ...setup, [k]: Number(e.target.value) });
            m.setFeasibilityChecked(false);
          }}
          className={field}
        />
        <span className="absolute right-3 top-2 text-xs text-muted-foreground">{unit}</span>
      </div>
    </label>
  );

  const preferred = preferredRoute(plan.data);
  const f = plan.data?.feasibility;

  const generate = () => {
    if (!plan.data) return;
    setGenerating(true);
    m.setMissionPlan(plan.data);
    setTimeout(() => {
      m.setRoutesGenerated(true);
      setGenerating(false);
      m.setView("routes");
    }, 900);
  };

  const segs = preferred
    ? [
        { l: "Outbound", v: preferred.route.properties.estimated_one_way_hours, c: "var(--data)" },
        { l: "Science", v: setup.science, c: "var(--caution)" },
        { l: "Return", v: preferred.route.properties.estimated_one_way_hours, c: "var(--mars)" },
        { l: "Buffer", v: setup.buffer, c: "var(--nebula)" },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t("Mission Setup")}>
        <div className="space-y-4">
          <label className="block">
            <span className="label-caps">{t("Mission Name")}</span>
            <input
              value={setup.name}
              onChange={(e) => setSetup({ ...setup, name: e.target.value })}
              className={`${field} mt-1`}
            />
          </label>
          <div>
            <span className="label-caps">{t("Mission Mode")}</span>
            <div className="mt-1">
              <ModeSelector />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="label-caps">{t("Starting Base")}</span>
              <select className={`${field} mt-1`} disabled>
                <option>{t("Perseverance landing site (verified, Sol 0)")}</option>
              </select>
            </label>
            <label className="block">
              <span className="label-caps">{t("Destination")}</span>
              <select
                value={m.destination}
                onChange={(e) => m.setDestination(e.target.value as JezeroZoneId)}
                className={`${field} mt-1`}
              >
                {(dataset?.zones ?? []).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.id} · {t("terrain index")}{" "}
                    {z.terrainScreening.heuristic_terrain_index === null
                      ? t("n/a")
                      : `${z.terrainScreening.heuristic_terrain_index}%`}
                  </option>
                ))}
              </select>
            </label>
            {num("eva", "Available EVA Time", 0.5)}
            {num("science", "Science Activity")}
            {num("buffer", "Safety Buffer")}
            {num("walkingSpeedMPerHour", "Walking Speed Assumption", 100, "m/h")}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t(
              "Walking speed is a configurable planning assumption, not a measured astronaut pace. Jezero zones are large regional analysis areas, hundreds of km from the landing site — a single EVA will often not reach a zone centroid.",
            )}
          </p>
          <button
            onClick={() => m.setFeasibilityChecked(true)}
            className="btn-mars flex w-full items-center justify-center gap-2 py-3 text-xs"
          >
            <ListChecks className="h-4 w-4" />
            {t("Check Mission Feasibility")}
          </button>
        </div>
      </Panel>
      {!m.feasibilityChecked ? (
        <div className="glass flex items-center justify-center p-10 text-center text-sm text-muted-foreground">
          {t("Configure your mission and run the feasibility check.")}
          <br />
          {t("Destination:")} {m.destination}
        </div>
      ) : plan.isLoading ? (
        <div className="glass flex items-center justify-center p-10 text-center text-sm text-muted-foreground">
          <Cpu className="mr-2 h-4 w-4 animate-spin" />
          {t("Computing terrain-aware route from the real DEM/slope rasters…")}
        </div>
      ) : plan.isError || !plan.data ? (
        <div className="glass flex items-center justify-center p-10 text-center text-sm text-danger">
          {t("Could not reach the terrain routing backend.")}{" "}
          {plan.error instanceof Error ? plan.error.message : ""}
        </div>
      ) : (
        <AnimatedContent distance={35} duration={0.75} scale={0.98} className="min-w-0">
          <Panel title={t("Mission Feasibility")} className="h-full">
            {!preferred || !f ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 font-display font-bold text-danger">
                  <AlertTriangle className="h-5 w-5" />
                  {t("NO ROUTE AVAILABLE")}
                </div>
                <p className="text-muted-foreground">
                  {!plan.data.routes.A.available && plan.data.routes.A.reason}
                </p>
                <p className="text-muted-foreground">
                  {!plan.data.routes.B.available && plan.data.routes.B.reason}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 font-mono text-sm">
                  {[
                    ["Available EVA Time", setup.eva],
                    ["Outbound Travel (real route)", f.estimated_outbound_hours],
                    ["Science Activity", setup.science],
                    ["Return Travel (real route)", f.estimated_return_hours],
                    ["Safety Buffer", setup.buffer],
                  ].map(([l, v]) => (
                    <div
                      key={l as string}
                      className="flex justify-between border-b border-border/60 pb-2"
                    >
                      <span className="text-muted-foreground">{display(String(l))}</span>
                      <span>{(v as number).toFixed(1)} h</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 text-base font-bold">
                    <span>{t("TOTAL")}</span>
                    <span>{f.estimated_total_hours.toFixed(1)} h</span>
                  </div>
                </div>
                <div className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t("Basis route:")} {preferred.id === "B" ? t("Route B · Terrain-Aware") : t("Route A · Shortest Distance")} ·{" "}
                  {preferred.route.properties.distance_km.toFixed(1)} km ·{" "}
                  {t("mean slope")} {preferred.route.properties.mean_slope_degrees.toFixed(1)}°
                </div>
                <div className="mt-5">
                  <div className="label-caps mb-2">{t("Timeline")}</div>
                  <div className="relative flex h-6 overflow-hidden rounded-md bg-muted">
                    {segs.map((s) => (
                      <div
                        key={s.l}
                        className="h-full transition-all duration-700"
                        title={display(s.l)}
                        style={{
                          width: `${(s.v / Math.max(setup.eva, f.estimated_total_hours)) * 100}%`,
                          background: s.c,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    {segs.map((s) => (
                      <span key={s.l} className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm" style={{ background: s.c }} />
                        {display(s.l)}
                      </span>
                    ))}
                  </div>
                </div>
                {f.feasible ? (
                  <div className="mt-5 rounded-lg border border-safe/50 bg-safe/10 p-4">
                    <div className="flex items-center gap-2 font-display font-bold text-safe">
                      <Check className="h-5 w-5" />
                      {t("MISSION FEASIBLE")}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t("Remaining time:")}{" "}
                      <span className="text-foreground">{(f.remaining_eva_hours ?? 0).toFixed(1)} h</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg border border-danger/50 bg-danger/10 p-4">
                    <div className="flex items-center gap-2 font-display font-bold text-danger">
                      <AlertTriangle className="h-5 w-5" />
                      {t("MISSION NOT FEASIBLE")}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("Over budget by {hours} h at the current walking-speed assumption.", {
                        hours: Math.abs(f.remaining_eva_hours ?? 0).toFixed(1),
                      })}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {[
                        "Choose a closer destination",
                        "Increase the walking-speed assumption",
                        "Reduce science activity",
                        "Increase available mission time",
                      ].map((s) => (
                        <li key={s}>• {display(s)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {preferred && (
                  <button
                    disabled={generating}
                    onClick={generate}
                    className="btn-ghost mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs"
                  >
                    {generating ? (
                      <>
                        <Cpu className="h-4 w-4 animate-spin" />
                        {t("Preparing route comparison…")}
                      </>
                    ) : (
                      <>
                        {t("Compare Routes")}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </Panel>
        </AnimatedContent>
      )}
    </div>
  );
}

/* ---------------- ROUTES ---------------- */
export function RouteAnalysis() {
  const { t, display } = useLanguage();
  const m = useMission();
  const [hl, setHl] = useState<"A" | "B">("B");
  const plan = m.missionPlan;
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

  const preferred = preferredRoute(plan);
  const rows: [string, (id: "A" | "B") => string][] = [
    ["Distance", (id) => (plan.routes[id].available ? `${plan.routes[id].route.properties.distance_km.toFixed(1)} km` : "—")],
    ["Mean Slope", (id) => (plan.routes[id].available ? `${plan.routes[id].route.properties.mean_slope_degrees.toFixed(1)}°` : "—")],
    [
      "Elevation Gain / Loss",
      (id) =>
        plan.routes[id].available
          ? `+${plan.routes[id].route.properties.elevation_gain_m.toFixed(0)} / -${plan.routes[id].route.properties.elevation_loss_m.toFixed(0)} m`
          : "—",
    ],
    [
      "Estimated Mission Time",
      (id) => (plan.routes[id].available ? `${plan.routes[id].route.properties.estimated_total_eva_hours.toFixed(1)} h` : "—"),
    ],
    [
      "Feasible (requested EVA)",
      (id) =>
        plan.routes[id].available
          ? plan.routes[id].route.properties.passes_demo_time_assumptions === null
            ? t("No EVA limit set")
            : plan.routes[id].route.properties.passes_demo_time_assumptions
              ? "YES"
              : "NO"
          : t("No route"),
    ],
  ];
  const ids: ("A" | "B")[] = ["A", "B"];
  const overlays = ids
    .filter((id) => plan.routes[id].available)
    .map((id) => ({
      id,
      color: id === "B" ? "var(--safe)" : "var(--data)",
      dash: id === "A" ? "10 8" : undefined,
      coordinates: (plan.routes[id] as { available: true; route: RouteFeature }).route.geometry.coordinates,
    }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="relative">
          <RealTerrainMap
            className="h-[56vh] min-h-[420px]"
            hidePanel
            selectedZoneId={plan.destination_zone_id}
            routes={overlays}
            basePoint={plan.base}
          />
          <div className="absolute left-4 top-10 flex flex-col gap-2">
            {ids
              .filter((id) => plan.routes[id].available)
              .map((id) => (
                <button
                  key={id}
                  onMouseEnter={() => setHl(id)}
                  onClick={() => setHl(id)}
                  className={`glass glass-interactive flex items-center gap-3 px-3 py-2 text-left text-xs ${hl === id ? "glass-selected" : ""}`}
                >
                  <span className="h-0.5 w-6" style={{ background: id === "B" ? "var(--safe)" : "var(--data)" }} />
                  <span className="font-display font-semibold">
                    {t("ROUTE")} {id}
                  </span>
                  <span className="text-muted-foreground">{id === "B" ? t("Terrain-Aware") : t("Shortest Distance")}</span>
                </button>
              ))}
          </div>
        </div>
        <Panel className="glow-border">
          {preferred ? (
            <>
              <div className="label-caps text-safe">{t("⭐ Recommended Route")}</div>
              <div className="mt-2 font-display text-2xl font-bold">
                {preferred.id === "B" ? t("Route B · Terrain-Aware") : t("Route A · Shortest Distance")}
              </div>
              <div className="my-4 flex items-center gap-4">
                <Ring value={Math.max(0, Math.min(100, 100 - preferred.route.properties.mean_slope_degrees * 4))} size={110} />
                <div className="text-sm text-muted-foreground">
                  {t("Terrain-cost-based comfort (heuristic from mean slope)")}
                </div>
              </div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-safe" /> {preferred.route.properties.distance_km.toFixed(1)} km,{" "}
                  {preferred.route.properties.mean_slope_degrees.toFixed(1)}° mean slope
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-safe" /> {t("Elevation gain")}{" "}
                  {preferred.route.properties.elevation_gain_m.toFixed(0)} m
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-safe" /> {preferred.route.properties.estimated_total_eva_hours.toFixed(1)} h{" "}
                  {t("total estimated time")}
                </li>
              </ul>
              <button
                onClick={() => {
                  m.setActiveRoute(preferred.id === "B" ? "B" : "A");
                  m.setEnvChanged(false);
                  m.setRerouted(false);
                  m.setView("execution");
                }}
                className="btn-mars mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs"
              >
                {t("Start Simulated Mission")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="text-sm text-danger">{t("No traversable route to this zone at the current DEM scale.")}</div>
          )}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title={t("Route Analysis")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label-caps pb-3">{t("Factor")}</th>
                  {ids.map((id) => (
                    <th key={id} className={`pb-3 font-display ${id === "B" ? "text-safe" : ""}`}>
                      {t("Route")} {id}
                    </th>
                  ))}
                  <th className="pb-3 font-display text-muted-foreground">{t("Route")} C</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([l, fn]) => (
                  <tr key={l} className="border-t border-border/60">
                    <td className="py-2.5 text-muted-foreground">{display(l)}</td>
                    {ids.map((id) => (
                      <td
                        key={id}
                        className={`py-2.5 font-mono ${id === "B" ? "bg-safe/10 text-foreground" : ""} ${fn(id) === "NO" ? "text-danger" : ""}`}
                      >
                        {display(fn(id))}
                      </td>
                    ))}
                    <td className="py-2.5 font-mono text-muted-foreground">{t("Unavailable")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t("Route C (Science Priority):")} {plan.routes.C.reason}
          </p>
        </Panel>
        <AnimatedContent distance={35} duration={0.8} scale={0.98} blur={2} className="min-w-0">
          <Panel title={t("Why this route?")} className="h-full">
            <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-border p-3 font-mono text-[10px] tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5 text-data" />
                {t("A* OVER TERRAIN-COST GRID")}
              </span>
              →<span>{t("REAL DEM/SLOPE RASTERS")}</span>→
              <span className="flex items-center gap-1">
                <Brain className="h-3.5 w-3.5 text-mars" />
                {t("ASSUMPTIONS SHOWN")}
              </span>
            </div>
            {preferred ? (
              <>
                <p className="text-sm leading-relaxed">{preferred.route.properties.algorithm}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {preferred.route.properties.assumptions.map((a) => (
                    <li key={a}>• {a}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("No route to explain — none could be computed.")}</p>
            )}
          </Panel>
        </AnimatedContent>
      </div>
    </div>
  );
}

/* ---------------- EXECUTION ---------------- */
export function Execution() {
  const { t, display } = useLanguage();
  const m = useMission();
  const [p, setP] = useState(0);
  const [returning, setReturning] = useState(false);
  const emergencyMutation = useEmergencyReturnMutation();
  const plan = m.missionPlan;
  const activeOutcome = plan?.routes[m.activeRoute === "C" ? "A" : m.activeRoute];
  const activeRouteFeature = activeOutcome?.available ? activeOutcome.route : null;
  const coordinates = activeRouteFeature?.geometry.coordinates ?? [];

  const revisedOutcome = m.revisedMissionPlan?.routes[m.activeRoute === "C" ? "A" : m.activeRoute];
  const showingRevised = m.envChanged && m.rerouted && revisedOutcome?.available;
  const emergencyOutcome = m.emergencyRoute?.available ? m.emergencyRoute.route : null;
  const displayedCoordinates = emergencyOutcome?.geometry.coordinates
    ?? (showingRevised && revisedOutcome?.available ? revisedOutcome.route.geometry.coordinates : coordinates);

  const target = emergencyOutcome ? 1 : 0.92;
  useEffect(() => {
    const id = setInterval(
      () =>
        setP((v) => {
          const d = target - v;
          return Math.abs(d) < 0.004 ? target : v + d * 0.04;
        }),
      30,
    );
    return () => clearInterval(id);
  }, [target]);
  useEffect(() => {
    setP(0);
  }, [m.activeRoute, emergencyOutcome, showingRevised]);

  const currentPoint = useMemo(() => interpolateAlongPath(displayedCoordinates, p), [displayedCoordinates, p]);

  if (!m.routesGenerated || !plan || !activeRouteFeature)
    return (
      <div className="glass mx-auto max-w-lg p-10 text-center">
        <p className="text-muted-foreground">
          {t("Generate and select a route before starting the simulated mission.")}
        </p>
        <button onClick={() => m.setView("planner")} className="btn-mars mt-6 px-6 py-3 text-xs">
          {t("Open Mission Planner")}
        </button>
      </div>
    );

  const total = activeRouteFeature.properties.estimated_total_eva_hours;
  const elapsed = Math.round(p * total * 10) / 10 || 0;
  const emergency = m.mode === "emergency";

  const simulateEnvironmentalChange = () => {
    m.setEnvChanged(true);
    const mid = coordinates[Math.floor(coordinates.length / 2)];
    if (!mid) return;
    import("@/lib/mission-api").then(({ planMission }) =>
      planMission({
        destinationZoneId: plan.destination_zone_id,
        evaHours: m.setup.eva,
        scienceHours: m.setup.science,
        bufferHours: m.setup.buffer,
        walkingSpeedMPerHour: m.setup.walkingSpeedMPerHour,
        closures: [{ center: { easting: mid[0], northing: mid[1] }, radius_m: 1500 }],
      }).then((revised) => m.setRevisedMissionPlan(revised)),
    );
  };

  const acceptReroute = () => {
    if (m.revisedMissionPlan) {
      const revisedRoute = m.revisedMissionPlan.routes.B.available
        ? "B"
        : m.revisedMissionPlan.routes.A.available
          ? "A"
          : null;
      if (revisedRoute) m.setActiveRoute(revisedRoute);
    }
    m.setRerouted(true);
  };

  const triggerEmergency = () => {
    setReturning(true);
    emergencyMutation.mutate(
      { current: currentPoint, evaHours: m.setup.eva },
      { onSuccess: (result) => m.setEmergencyRoute(result) },
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="relative">
        <RealTerrainMap
          className="h-[70vh] min-h-[460px]"
          hidePanel
          selectedZoneId={plan.destination_zone_id}
          basePoint={plan.base}
          markerPoint={currentPoint}
          routes={[
            ...(emergencyOutcome
              ? [{ id: "emergency", color: "var(--danger)", coordinates: emergencyOutcome.geometry.coordinates }]
              : [{ id: "active", color: showingRevised ? "var(--caution)" : "var(--safe)", coordinates: displayedCoordinates }]),
          ]}
        />
        <div className="glass glass-overlay absolute left-4 top-10 px-3 py-2 font-mono text-[10px] tracking-widest">
          <span className="text-caution">{t("● SIMULATED MISSION")}</span>
          <div className="text-muted-foreground">{t("NOT REAL-TIME ASTRONAUT TRACKING")}</div>
        </div>
        {m.envChanged && !m.rerouted && (
          <div
            className="glass glass-overlay animate-slide-in absolute bottom-4 left-4 right-4 border-danger/60 p-5 md:right-auto md:w-[420px]"
            style={{ boxShadow: "0 0 30px -8px var(--danger)" }}
          >
            <div className="flex items-center gap-2 font-display font-bold text-danger">
              <AlertTriangle className="h-5 w-5" />
              {t("SIMULATED CLOSURE NEAR ROUTE MIDPOINT")}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("A simulated 1.5 km closure was placed on the route and the terrain cost grid was recalculated.")}
            </p>
            {m.revisedMissionPlan ? (
              <div className="mt-4 grid grid-cols-2 gap-2 text-center font-mono text-xs">
                <div className="rounded-md border border-border p-2">
                  {t("Original")}
                  <div className="font-display text-lg font-bold">
                    {activeRouteFeature.properties.distance_km.toFixed(1)} km
                  </div>
                </div>
                <div className="rounded-md border border-safe p-2 text-safe">
                  {t("Revised")}
                  <div className="font-display text-lg font-bold">
                    {revisedOutcome?.available ? `${revisedOutcome.route.properties.distance_km.toFixed(1)} km` : t("unavailable")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5 animate-spin" />
                {t("Recalculating route…")}
              </div>
            )}
            {revisedOutcome?.available && (
              <button onClick={acceptReroute} className="btn-mars mt-4 w-full py-3 text-xs">
                {t("Accept Revised Route")}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-4">
        {emergency ? (
          <Panel
            className="border-danger/60"
            title={<span className="text-danger">{t("🚨 Emergency Return Mode")}</span>}
          >
            <div className="label-caps">{t("Objective")}</div>
            <div className="font-display text-xl font-bold">{t("RETURN TO BASE")}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Calculates a real terrain-aware route from the current simulated position back to the verified base.")}
            </p>
            {m.emergencyRoute && (
              <div className="mt-3 rounded-md border border-border p-3 font-mono text-xs">
                {m.emergencyRoute.available ? (
                  <>
                    <div className="label-caps mb-1">{t("Return route found")}</div>
                    {m.emergencyRoute.route.properties.distance_km.toFixed(1)} km ·{" "}
                    {m.emergencyRoute.route.properties.estimated_one_way_hours.toFixed(1)} h
                  </>
                ) : (
                  <span className="text-danger">
                    {t("No return route could be calculated:")} {m.emergencyRoute.reason}
                  </span>
                )}
              </div>
            )}
            <button
              onClick={triggerEmergency}
              disabled={emergencyMutation.isPending}
              className="btn-mars mt-4 w-full py-3 text-xs"
              style={{ background: "var(--danger)" }}
            >
              {emergencyMutation.isPending ? t("Calculating return route…") : t("Initiate Emergency Return")}
            </button>
          </Panel>
        ) : null}
        <Panel title={returning ? t("Returning to Base") : t("Mission in Progress")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Base")}</span>
              <span>{t("Perseverance landing site")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Destination")}</span>
              <span>{m.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Active Route")}</span>
              <span className="font-mono">
                {t("Route")} {m.activeRoute} — {Math.round(p * 100)}%
              </span>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-data shadow-[var(--glow-data)]"
              style={{ width: `${p * 100}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md border border-border p-2">
              <div className="label-caps">{t("Elapsed")}</div>
              <div className="font-display text-lg">{elapsed.toFixed(1)} h</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="label-caps">{t("Remaining")}</div>
              <div className="font-display text-lg">{Math.max(0, total - elapsed).toFixed(1)} h</div>
            </div>
          </div>
          {!m.envChanged && (
            <button
              onClick={simulateEnvironmentalChange}
              className="btn-ghost mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs text-caution"
            >
              <AlertTriangle className="h-4 w-4" />
              {t("Simulate Environmental Closure")}
            </button>
          )}
          {m.rerouted && (
            <div className="mt-4 rounded-md border border-safe/50 bg-safe/10 p-3 text-sm text-safe">
              <Star className="mr-1 inline h-4 w-4" />
              {t("Rerouted around the simulated closure.")}
            </div>
          )}
          <button
            onClick={() => m.setView("report")}
            className="btn-ghost mt-3 w-full py-3 text-xs"
          >
            {t("View Mission Report")}
          </button>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- REPORT ---------------- */
export function Report() {
  const { t, display } = useLanguage();
  const m = useMission();
  const { data: dataset } = useRealTerrainDataset();
  const plan = m.missionPlan;
  const zone = dataset?.zones.find((z) => z.id === m.destination);
  const [exported, setExported] = useState(false);
  const preferred = preferredRoute(plan ?? undefined);
  const partial = zone ? partialTerrainScore(zone.factors) : null;

  const facts: [string, string][] = [
    ["Mission", m.setup.name],
    ["Region", "Jezero Crater"],
    ["Mode", MODE_WEIGHTS[m.mode].label],
    ["Destination", m.destination],
    ["Route Used", m.rerouted ? "Revised route (post-closure)" : preferred ? `Route ${preferred.id}` : "None available"],
    [
      "Final Mission Status",
      plan?.feasibility?.feasible === null || plan?.feasibility?.feasible === undefined
        ? "Not available"
        : plan.feasibility.feasible
          ? "FEASIBLE"
          : "NOT FEASIBLE",
    ],
    ["Total Mission Time", plan?.feasibility ? `${plan.feasibility.estimated_total_hours.toFixed(1)} h` : "Not available"],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-caps text-mars">{t("MARS-026 · Simulated planning prototype")}</div>
          <h2 className="font-display text-4xl font-bold">{t("Mission Summary")}</h2>
        </div>
        <button
          onClick={() => setExported(true)}
          className="btn-mars flex items-center gap-2 px-6 py-3 text-xs"
        >
          <Download className="h-4 w-4" />
          {exported ? t("Report Prepared (demo export)") : t("Export Mission Report")}
        </button>
      </div>
      <AnimatedContent distance={35} duration={0.8} scale={0.98} blur={2}>
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <div className="label-caps">{display(k)}</div>
                <div className="mt-1 font-display">{k === "Mission" || k === "Destination" ? v : display(v)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </AnimatedContent>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("Real Terrain Assessment")}>
          {zone ? (
            <div className="flex items-center gap-5">
              <Ring value={partial ?? 0} size={110} />
              <div className="flex-1 space-y-1 text-xs text-muted-foreground">
                <div>{t("Terrain-only / Partial — not a validated safety classification")}</div>
                <div>
                  {t("Elevation mean:")} {zone.elevation.mean.toFixed(0)} m
                </div>
                <div>
                  {t("Slope mean / p90:")} {zone.slope.mean.toFixed(1)}° / {zone.slope.p90.toFixed(1)}°
                </div>
                <div>
                  {t("Resource / Access / Environmental Risk / Science:")} {t("Not available")}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{t("Not available")}</span>
          )}
        </Panel>
        <Panel title={t("Route Decision")}>
          <p className="text-sm text-muted-foreground">
            {preferred
              ? t(
                  "Route {id} selected: {distance} km, {slope}° mean slope, {time} h total estimate. Route C (Science Priority) unavailable — {reason}",
                  {
                    id: preferred.id,
                    distance: preferred.route.properties.distance_km.toFixed(1),
                    slope: preferred.route.properties.mean_slope_degrees.toFixed(1),
                    time: preferred.route.properties.estimated_total_eva_hours.toFixed(1),
                    reason: plan?.routes.C.reason ?? "",
                  },
                )
              : t("No traversable route was found to this destination.")}
          </p>
        </Panel>
        <Panel title={t("Mission Feasibility")}>
          <p className="text-sm text-muted-foreground">
            {plan?.feasibility
              ? t("Total {total} h against {eva} h available EVA — {result}", {
                  total: plan.feasibility.estimated_total_hours.toFixed(1),
                  eva: m.setup.eva,
                  result: plan.feasibility.feasible
                    ? t("{hours} h margin retained.", { hours: (plan.feasibility.remaining_eva_hours ?? 0).toFixed(1) })
                    : t("exceeds available time by {hours} h.", {
                        hours: Math.abs(plan.feasibility.remaining_eva_hours ?? 0).toFixed(1),
                      }),
                })
              : t("Not available")}
          </p>
        </Panel>
        <Panel title={t("Simulated Events")}>
          <p className="text-sm text-muted-foreground">
            {m.envChanged
              ? t("A simulated closure was placed near the route midpoint and the terrain cost grid was recalculated. {result}", {
                  result: m.rerouted ? t("Crew accepted the revised route.") : t("Revised route pending acceptance."),
                })
              : t("No simulated events triggered during this run.")}
          </p>
          {m.emergencyRoute && (
            <p className="mt-2 text-sm text-muted-foreground">
              {m.emergencyRoute.available
                ? t("Emergency return route: {distance} km, {time} h.", {
                    distance: m.emergencyRoute.route.properties.distance_km.toFixed(1),
                    time: m.emergencyRoute.route.properties.estimated_one_way_hours.toFixed(1),
                  })
                : t("Emergency return could not be calculated: {reason}", { reason: m.emergencyRoute.reason })}
            </p>
          )}
        </Panel>
      </div>
      <AnimatedContent distance={40} duration={0.85} scale={0.98} blur={2}>
        <Panel title={t("Final Recommendation")} className="glow-border">
          <p className="text-sm">
            {preferred
              ? t(
                  "Proceed with Route {route} to {destination} under {mode} mode, subject to the EVA-time feasibility above. Terrain data is real (20 m CTX DEM); non-terrain factors, oxygen, radiation and battery are not modeled.",
                  {
                    route: preferred.id,
                    destination: m.destination,
                    mode: display(MODE_WEIGHTS[m.mode].label),
                  },
                )
              : t("No feasible route is available for this destination with the current assumptions.")}
          </p>
        </Panel>
      </AnimatedContent>
    </div>
  );
}

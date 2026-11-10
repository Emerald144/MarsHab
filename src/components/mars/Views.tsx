import { useLanguage } from "@/i18n/useLanguage";
import { ModeSelector } from "@/features/survival-map/SurvivalMapView";
import { useEffect, useState } from "react";
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
import {
  FACTOR_LABELS,
  MODE_WEIGHTS,
  ROUTES,
  ZONES,
  score,
  tierColor,
  type Factors,
  type RouteId,
} from "@/lib/mission-data";
import { useMission } from "@/lib/mission-store";
import { MarsMap } from "./MarsMap";
import { Bar, Counter, Panel, Ring } from "./ui";
export { SurvivalMapView } from "@/features/survival-map/SurvivalMapView";

function useFeasibility() {
  const { destination, setup } = useMission();
  const z = ZONES.find((x) => x.id === destination)!;
  const out = z.travel,
    ret = Math.round(z.travel * 0.94 * 10) / 10;
  const total = Math.round((out + setup.science + ret + setup.buffer) * 10) / 10;
  return {
    out,
    ret,
    total,
    remaining: Math.round((setup.eva - total) * 10) / 10,
    ok: total <= setup.eva,
  };
}

/* ---------------- OVERVIEW ---------------- */
export function Overview() {
  const feasibility = useFeasibility();
  return <OverviewDashboard feasibility={feasibility} />;
}
/* ---------------- PLANNER ---------------- */
export function Planner() {
  const { t, display } = useLanguage();
  const m = useMission();
  const { setup, setSetup } = m;
  const f = useFeasibility();
  const [generating, setGenerating] = useState(false);
  const field =
    "w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm outline-none focus:border-data focus:shadow-[var(--glow-data)]";
  const num = (k: keyof typeof setup, label: string, step = 0.1, unit = "h") => (
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
  const generate = () => {
    setGenerating(true);
    setTimeout(() => {
      m.setRoutesGenerated(true);
      setGenerating(false);
      m.setView("routes");
    }, 1800);
  };
  const segs = [
    { l: "Outbound", v: f.out, c: "var(--data)" },
    { l: "Science", v: setup.science, c: "var(--caution)" },
    { l: "Return", v: f.ret, c: "var(--mars)" },
    { l: "Buffer", v: setup.buffer, c: "var(--nebula)" },
  ];
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
              <select className={`${field} mt-1`}>
                <option>{t("Perseverance Base")}</option>
              </select>
            </label>
            <label className="block">
              <span className="label-caps">{t("Destination")}</span>
              <select
                value={m.destination}
                onChange={(e) => {
                  m.setDestination(e.target.value);
                  m.setFeasibilityChecked(false);
                  m.setRoutesGenerated(false);
                }}
                className={`${field} mt-1`}
              >
                {ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {t("Area")} {z.id} · {score(z.factors, m.mode)}%
                  </option>
                ))}
              </select>
            </label>
            {num("eva", "Available EVA Time", 0.5)}
            {num("science", "Science Activity")}
            {num("buffer", "Safety Buffer")}
            {num("resource", "Simulated Resource Level", 5, "%")}
          </div>
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
          {t("Destination: Area")} {m.destination}
        </div>
      ) : (
        <AnimatedContent distance={35} duration={0.75} scale={0.98} className="min-w-0">
          <Panel title={t("Mission Feasibility")} className="h-full">
            <div className="space-y-2 font-mono text-sm">
              {[
                ["Available EVA Time", setup.eva],
                ["Outbound Travel", f.out],
                ["Science Activity", setup.science],
                ["Return Travel", f.ret],
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
                <span>
                  <Counter value={f.total} decimals={1} suffix=" h" />
                </span>
              </div>
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
                      width: `${(s.v / Math.max(setup.eva, f.total)) * 100}%`,
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
            {f.ok ? (
              <div className="mt-5 rounded-lg border border-safe/50 bg-safe/10 p-4">
                <div className="flex items-center gap-2 font-display font-bold text-safe">
                  <Check className="h-5 w-5" />
                  {t("MISSION FEASIBLE")}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t("Remaining time:")}{" "}
                  <span className="text-foreground">{f.remaining.toFixed(1)} h</span>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-danger/50 bg-danger/10 p-4">
                <div className="flex items-center gap-2 font-display font-bold text-danger">
                  <AlertTriangle className="h-5 w-5" />
                  {t("MISSION NOT FEASIBLE")}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {[
                    "Choose a closer destination",
                    "Use a shorter route",
                    "Reduce science activity",
                    "Increase available mission time",
                  ].map((s) => (
                    <li key={s}>• {display(s)}</li>
                  ))}
                </ul>
              </div>
            )}
            {f.ok && (
              <button
                disabled={generating}
                onClick={generate}
                className="btn-ghost mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs"
              >
                {generating ? (
                  <>
                    <Cpu className="h-4 w-4 animate-spin" />
                    {t("Generating survival-aware routes…")}
                  </>
                ) : (
                  <>
                    {t("Generate Routes")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
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
  const [hl, setHl] = useState<RouteId>("B");
  if (!m.routesGenerated)
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
  const rows: [string, (id: RouteId) => string][] = [
    ["Distance", (id) => `${ROUTES[id].distance} km`],
    ["Terrain Risk", (id) => ROUTES[id].terrain],
    ["Resource Access", (id) => ROUTES[id].resource],
    ["Science Value", (id) => ROUTES[id].science],
    ["Mission Time", (id) => `${ROUTES[id].time} h`],
    ["Feasible", (id) => (ROUTES[id].feasible ? "YES" : "NO")],
    [
      "Survival Score",
      (id) => (ROUTES[id].score ? `${ROUTES[id].score}${id === "B" ? " ⭐" : ""}` : "—"),
    ],
  ];
  const ids: RouteId[] = ["A", "B", "C"];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="relative">
          <MarsMap showRoutes highlightRoute={hl} className="h-[56vh] min-h-[420px]" />
          <div className="absolute left-4 top-10 flex flex-col gap-2">
            {ids.map((id) => (
              <button
                key={id}
                onMouseEnter={() => setHl(id)}
                onClick={() => setHl(id)}
                className={`glass glass-interactive flex items-center gap-3 px-3 py-2 text-left text-xs ${hl === id ? "glass-selected" : ""}`}
              >
                <span className="h-0.5 w-6" style={{ background: ROUTES[id].color }} />
                <span className="font-display font-semibold">
                  {t("ROUTE")} {id}
                </span>
                <span className="text-muted-foreground">
                  {display(ROUTES[id].name)}
                  {id === "B" && " ⭐"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <Panel className="glow-border">
          <div className="label-caps text-safe">{t("⭐ Recommended Route")}</div>
          <div className="mt-2 font-display text-2xl font-bold">
            {t("Route B · Balanced Survival")}
          </div>
          <div className="my-4 flex items-center gap-4">
            <Ring value={91} size={110} />
            <div className="text-sm text-muted-foreground">{t("Survival score")}</div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {[
              "Lower terrain difficulty",
              "Good resource accessibility",
              "Acceptable environmental risk",
              "High science value",
              "Fits mission time",
            ].map((r) => (
              <li key={r} className="flex gap-2">
                <Check className="h-4 w-4 text-safe" />c{display(r)}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              m.setActiveRoute("B");
              m.setEnvChanged(false);
              m.setRerouted(false);
              m.setView("execution");
            }}
            className="btn-mars mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs"
          >
            {t("Start Simulated Mission")}
            <ArrowRight className="h-4 w-4" />
          </button>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <AnimatedContent distance={35} duration={0.8} scale={0.98} blur={2} className="min-w-0">
          <Panel title={t("Why this route?")} className="h-full">
            <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-border p-3 font-mono text-[10px] tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5 text-data" />
                {t("ALGORITHM DECIDES")}
              </span>
              →<span>{t("STRUCTURED RESULTS")}</span>→
              <span className="flex items-center gap-1">
                <Brain className="h-3.5 w-3.5 text-mars" />
                {t("AI EXPLAINS")}
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              {t(
                "Route B is recommended because it provides a strong balance between terrain safety, resource accessibility, science value and mission duration. Although Route A is shorter, it crosses higher-risk terrain; Route C offers more science but exceeds the available EVA time.",
              )}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="label-caps">{t("Why not Route A?")}</div>
                <p className="mt-1 text-muted-foreground">
                  {t("Shorter distance, but higher terrain risk.")}
                </p>
              </div>
              <div>
                <div className="label-caps">{t("Why not Route C?")}</div>
                <p className="mt-1 text-muted-foreground">
                  {t("High science value, but exceeds available EVA time.")}
                </p>
              </div>
            </div>
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
  const target = m.envChanged && !m.rerouted ? 0.62 : returning ? 0 : m.rerouted ? 0.85 : 0.62;
  useEffect(() => {
    const t = setInterval(
      () =>
        setP((v) => {
          const d = target - v;
          return Math.abs(d) < 0.004 ? target : v + d * 0.04;
        }),
      30,
    );
    return () => clearInterval(t);
  }, [target]);
  useEffect(() => {
    setP(0);
  }, [m.activeRoute]);
  if (!m.routesGenerated)
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
  const r = m.activeRoute;
  const total = ROUTES[r].time + 0.8;
  const elapsed = Math.round(p * total * 10) / 10 || 0;
  const cur = m.envChanged ? ROUTES[r].afterScore : (ROUTES[r].score ?? 0);
  const emergency = m.mode === "emergency";
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="relative">
        <MarsMap
          showRoutes
          highlightRoute={r}
          progress={p}
          riskZone={m.envChanged}
          className="h-[70vh] min-h-[460px]"
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
              {t("ENVIRONMENTAL CONDITION CHANGED")}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Route B now passes through a higher-risk simulated zone.")}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center font-mono text-xs">
              {(["A", "B", "C"] as RouteId[]).map((id) => (
                <div
                  key={id}
                  className={`rounded-md border p-2 ${id === "A" ? "border-safe text-safe" : "border-border"}`}
                >
                  {t("Route")} {id}
                  <div className="font-display text-lg font-bold">{ROUTES[id].afterScore}%</div>
                  {id === "A" && t("⭐ NEW")}
                  {id === "B" && <span className="text-danger">{t("was 91%")}</span>}
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                m.setActiveRoute("A");
                m.setRerouted(true);
              }}
              className="btn-mars mt-4 w-full py-3 text-xs"
            >
              {t("Accept New Route · A (80%)")}
            </button>
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
            <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
              {[
                "Minimize return time",
                "Minimize terrain difficulty",
                "Minimize environmental risk",
                "Minimize resource consumption",
              ].map((x, i) => (
                <li key={x}>
                  {i + 1}. {display(x)}
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-md border border-border p-3 font-mono text-xs">
              <div className="label-caps mb-1">{t("Fastest safe return")}</div>
              {t("Base ← Route A ← Current Position")}
            </div>
            <button
              onClick={() => {
                m.setActiveRoute("A");
                setReturning(true);
              }}
              className="btn-mars mt-4 w-full py-3 text-xs"
              style={{ background: "var(--danger)" }}
            >
              {returning ? t("Returning to base…") : t("Initiate Emergency Return")}
            </button>
          </Panel>
        ) : null}
        <Panel title={returning ? t("Returning to Base") : t("Mission in Progress")}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Base")}</span>
              <span>{t("Perseverance Base")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Destination")}</span>
              <span>
                {t("Area")} {m.destination}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Current Position")}</span>
              <span className="font-mono">
                {t("Route")} {r} — {Math.round(p * 100)}%
              </span>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-data shadow-[var(--glow-data)]"
              style={{ width: `${p * 100}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border p-2">
              <div className="label-caps">{t("Elapsed")}</div>
              <div className="font-display text-lg">{elapsed.toFixed(1)} h</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="label-caps">{t("Remaining")}</div>
              <div className="font-display text-lg">
                {Math.max(0, total - elapsed).toFixed(1)} h
              </div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="label-caps">{t("Suitability")}</div>
              <div className="font-display text-lg" style={{ color: tierColor(cur) }}>
                {cur}%
              </div>
            </div>
          </div>
          {!m.envChanged && (
            <button
              onClick={() => m.setEnvChanged(true)}
              className="btn-ghost mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs text-caution"
            >
              <AlertTriangle className="h-4 w-4" />
              {t("Simulate Environmental Change")}
            </button>
          )}
          {m.rerouted && (
            <div className="mt-4 rounded-md border border-safe/50 bg-safe/10 p-3 text-sm text-safe">
              <Star className="mr-1 inline h-4 w-4" />
              {t("Rerouted to Route A · 80%")}
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
  const f = useFeasibility();
  const z = ZONES.find((x) => x.id === m.destination)!;
  const [exported, setExported] = useState(false);
  const facts: [string, string][] = [
    ["Mission", m.setup.name],
    ["Region", "Jezero Crater"],
    ["Mode", MODE_WEIGHTS[m.mode].label],
    ["Destination", t("Area {id}", { id: m.destination })],
    ["Recommended Route", m.rerouted ? "Route A (rerouted from B)" : "Route B"],
    ["Initial Survival Score", "91%"],
    ["Final Mission Status", f.ok ? "FEASIBLE" : "NOT FEASIBLE"],
    ["Total Mission Time", `${f.total.toFixed(1)} h`],
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label-caps text-mars">{t("MARS-026 · Simulated")}</div>
          <h2 className="font-display text-4xl font-bold">{t("Mission Summary")}</h2>
        </div>
        <button
          onClick={() => setExported(true)}
          className="btn-mars flex items-center gap-2 px-6 py-3 text-xs"
        >
          <Download className="h-4 w-4" />
          {exported ? t("Report Prepared (demo)") : t("Export Mission Report")}
        </button>
      </div>
      <AnimatedContent distance={35} duration={0.8} scale={0.98} blur={2}>
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <div className="label-caps">{display(k)}</div>
                <div className="mt-1 font-display">{k === "Mission" ? v : display(v)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </AnimatedContent>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("Survival Analysis")}>
          <div className="flex items-center gap-5">
            <Ring value={score(z.factors, m.mode)} size={110} />
            <div className="flex-1 space-y-2">
              {(Object.keys(FACTOR_LABELS) as (keyof Factors)[]).slice(0, 3).map((k) => (
                <Bar key={k} label={FACTOR_LABELS[k]} value={z.factors[k]} />
              ))}
            </div>
          </div>
        </Panel>
        <Panel title={t("Route Decision")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Three routes evaluated. Route B selected for its balance of terrain safety, resource access and science value within EVA limits. Route C rejected (6.7 h exceeds window).",
            )}
          </p>
        </Panel>
        <Panel title={t("Mission Feasibility")}>
          <p className="text-sm text-muted-foreground">
            {t("Total {total} h against {eva} h available EVA — {result}", {
              total: f.total.toFixed(1),
              eva: m.setup.eva,
              result: f.ok
                ? t("{hours} h margin retained.", { hours: f.remaining.toFixed(1) })
                : t("exceeds available time."),
            })}
          </p>
        </Panel>
        <Panel title={t("Simulated Events")}>
          <p className="text-sm text-muted-foreground">
            {m.envChanged
              ? t("Environmental-risk increase detected along Route B (91% → 69%). {result}", {
                  result: m.rerouted
                    ? t("Crew accepted reroute to Route A (80%).")
                    : t("Reroute pending."),
                })
              : t("No simulated events triggered during this run.")}
          </p>
        </Panel>
      </div>
      <AnimatedContent distance={40} duration={0.85} scale={0.98} blur={2}>
        <Panel title={t("Final Recommendation")} className="glow-border">
          <p className="text-sm">
            {t(
              "Proceed with {route} to Area {destination} under {mode} mode. All values are prototype estimates derived from simulated data.",
              {
                route: m.rerouted ? t("Route A") : t("Route B"),
                destination: m.destination,
                mode: display(MODE_WEIGHTS[m.mode].label),
              },
            )}
          </p>
        </Panel>
      </AnimatedContent>
    </div>
  );
}

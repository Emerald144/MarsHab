import { useLanguage } from "@/i18n/useLanguage";
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react";
import { useState } from "react";
import AnimatedContent from "@/components/animations/AnimatedContent";
import { useOverviewMotion } from "@/hooks/use-overview-motion";
import { OverviewMarsGlobe } from "./OverviewMarsGlobe";
import jezeroMap from "@/assets/jezero-map.jpg";
import { useMission } from "@/lib/mission-store";
import { partialTerrainScore, type RealTerrainDataset } from "@/lib/jezero-real-data";
import type { MissionPlan } from "@/lib/mission-api";

type Props = {
  plan: MissionPlan | undefined;
  isLoading: boolean;
  isError: boolean;
  dataset: RealTerrainDataset | undefined;
};

function tierLabel(value: number | null) {
  if (value === null) return "N/A";
  return value >= 80 ? "HIGH" : value >= 60 ? "MODERATE" : "LOW";
}
function tierColorFor(value: number | null) {
  if (value === null) return "var(--muted-foreground)";
  return value >= 80 ? "var(--safe)" : value >= 60 ? "var(--caution)" : "var(--danger)";
}

/** Display-only rounding for the overview's decimal-hour labels. */
export function formatMissionHours(value: number) {
  // JS `toFixed` can render a decimal boundary such as 30.45 as 30.4
  // because the underlying binary value is slightly below the boundary.
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 10) / 10;
  return rounded.toFixed(1);
}

function Gauge({ value, color }: { value: number; color: string }) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg aria-hidden="true" viewBox="0 0 56 56" className="h-14 w-14 shrink-0 -rotate-90">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--track)" strokeWidth="3" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, value)) / 100)}
      />
    </svg>
  );
}

export function OverviewDashboard({ plan, isLoading, isError, dataset }: Props) {
  const { t, display } = useLanguage();
  const [motionPaused, setMotionPaused] = useState(false);
  const motionRef = useOverviewMotion(motionPaused);
  const { setView, destination, setup, feasibilityChecked, routesGenerated } = useMission();
  const zone = dataset?.zones.find((item) => item.id === destination);
  const suitability = zone ? partialTerrainScore(zone.factors) : null;
  const f = plan?.feasibility;
  const resource = plan?.resource_assessment;
  const preferredAvailable = plan ? Object.values(plan.routes).some((route) => route.available) : false;
  const availableRouteCount = plan ? Object.values(plan.routes).filter((route) => route.available).length : 0;
  const missionStatus = routesGenerated
    ? "ROUTES GENERATED"
    : feasibilityChecked
      ? "FEASIBILITY REVIEWED"
      : "AWAITING MISSION SETUP";
  const telemetry = [
    {
      label: "Terrain-Only Suitability",
      value: suitability === null ? t("Not available") : `${suitability}%`,
      status: tierLabel(suitability),
      color: tierColorFor(suitability),
      note: "Partial — real heuristic terrain index only",
      gauge: suitability,
    },
    {
      label: "Mission Feasibility",
      value: f ? (f.feasible === null ? t("Not available") : f.feasible ? t("FEASIBLE") : t("NOT FEASIBLE")) : t("Not available"),
      status: isLoading ? "CALCULATING…" : isError ? "BACKEND UNREACHABLE" : preferredAvailable ? "REAL ROUTE" : "NO ROUTE",
      color: f?.feasible ? "var(--safe)" : f?.feasible === false ? "var(--danger)" : "var(--muted-foreground)",
      note: "Computed from the real DEM/slope terrain-cost A* route",
      gauge: null,
    },
    {
      label: "Resource Margin",
      value: resource?.available
        ? `${resource.remaining_after_reserve_percent?.toFixed(1)}%`
        : t("Not available"),
      status: resource?.warning_level === "ok" ? "ABSTRACT MODEL OK" : resource?.warning_level === "low" ? "LOW MARGIN" : resource?.warning_level === "insufficient" ? "INSUFFICIENT" : "NOT AVAILABLE",
      color: resource?.warning_level === "ok" ? "var(--safe)" : resource?.warning_level === "unavailable" ? "var(--muted-foreground)" : "var(--caution)",
      note: "Configurable abstract resource budget; not oxygen or battery telemetry",
      gauge: null,
    },
    {
      label: "Routes Analyzed",
      value: `${availableRouteCount} / 3`,
      status: "A · B · C",
      color: "var(--data)",
      note: "Route C always unavailable: no verified science-target data for JZ zones",
      gauge: null,
    },
    {
      label: "Mission Time",
      value: f ? `${formatMissionHours(f.estimated_total_hours)} h` : t("Not available"),
      status: t("OF {hours} h EVA", { hours: setup.eva }),
      color: f?.feasible ? "var(--data)" : "var(--danger)",
      note: f
        ? t((f.remaining_eva_hours ?? 0) < 0 ? "{hours} h over budget" : "{hours} h remaining", {
            hours: formatMissionHours(Math.abs(f.remaining_eva_hours ?? 0)),
          })
        : "",
      gauge: f && setup.eva > 0 ? (f.estimated_total_hours / setup.eva) * 100 : null,
    },
  ];

  return (
    <div
      ref={motionRef}
      data-overview-paused={motionPaused}
      className="overview-workstation min-w-0 space-y-6 lg:space-y-8"
    >
      <AnimatedContent
        paused={motionPaused}
        distance={40}
        duration={0.85}
        scale={0.98}
        blur={2}
        className="min-w-0"
      >
        <section
          aria-labelledby="mission-briefing-title"
          data-overview-depth="12"
          className="glass glass-warm overview-card-interaction relative isolate min-w-0 overflow-hidden p-6 sm:p-8 lg:p-10"
        >
          <div
            aria-hidden="true"
            className="overview-mars-layer pointer-events-none absolute -right-40 top-1/2 -z-10 h-[640px] w-[640px] -translate-y-1/2 lg:right-0"
          >
            <OverviewMarsGlobe
              paused={motionPaused}
              data-overview-depth="28"
              className="overview-planet-drift h-full w-full"
            />
            <svg
              viewBox="0 0 560 560"
              data-overview-depth="-18"
              className="overview-orbit-drift absolute inset-0 h-full w-full fill-none"
            >
              <ellipse
                cx="280"
                cy="280"
                rx="272"
                ry="186"
                transform="rotate(-28 280 280)"
                stroke="var(--data)"
                strokeOpacity="0.18"
                strokeWidth="0.8"
              />
              <ellipse
                cx="280"
                cy="280"
                rx="258"
                ry="204"
                transform="rotate(-28 280 280)"
                stroke="var(--mars)"
                strokeOpacity="0.12"
                strokeWidth="0.6"
              />
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="overview-mars-text-protection pointer-events-none absolute inset-0 -z-10"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="label-caps text-mars">{t("01 / MISSION BRIEFING")}</p>
            <button
              type="button"
              aria-pressed={motionPaused}
              onClick={() => setMotionPaused((value) => !value)}
              className="overview-motion-toggle focus-ring inline-flex min-h-11 items-center rounded-md border border-border bg-background/35 px-3 py-2 font-mono text-[11px] text-text-secondary transition-colors hover:border-data/50 hover:text-data"
            >
              {motionPaused ? t("Resume effects") : t("Pause effects")}
            </button>
          </div>
          <div className="mt-5 max-w-2xl">
            <h1
              id="mission-briefing-title"
              className="font-display text-[clamp(1.875rem,5vw,3rem)] font-semibold leading-[1.1] tracking-tight sm:text-5xl 2xl:text-6xl"
            >
              {t("Martian Survival Mission")}
            </h1>
            <p className="mt-4 break-words font-display text-base text-foreground sm:text-lg">
              {setup.name}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-text-secondary">
              {t(
                "Analyze Martian terrain, resources, hazards and science targets to plan a safer and more feasible exploration route.",
              )}
            </p>
            <div className="mt-5 flex items-start gap-2 font-mono text-[10px] leading-relaxed tracking-wider text-brand-amber">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{display(missionStatus)}</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6">
              <button
                type="button"
                onClick={() => setView("map")}
                className="btn-mars overview-action inline-flex min-h-12 w-full items-center justify-center gap-3 px-6 py-3 text-xs sm:w-auto"
              >
                {t("Plan Mission")}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
              <span className="flex items-center gap-2 font-mono text-[11px] text-data">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {t("Jezero Crater · Sector")} {destination}
              </span>
            </div>
          </div>
          <dl
            aria-label={t("Mission setup metrics")}
            className="mt-6 border-t border-data/20 pt-6"
          >
            <div className="min-w-0">
              <dt className="label-caps leading-relaxed">{t("EVA allocation")}</dt>
              <dd className="mt-2 font-mono text-lg text-data">{setup.eva} h</dd>
            </div>
          </dl>
        </section>
      </AnimatedContent>

      <section aria-labelledby="telemetry-title" data-overview-depth="10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="telemetry-title" className="label-caps text-data">
            {t("02 / MISSION TELEMETRY")}
          </h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("SIMULATED PLANNING INDICATORS")}
          </span>
        </div>
        <AnimatedContent
          paused={motionPaused}
          distance={35}
          duration={0.75}
          scale={0.98}
          blur={2}
          stagger={0.09}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          {telemetry.map((item, index) => (
            <div key={item.label} className="min-w-0">
              <article
                aria-labelledby={`overview-telemetry-${index}`}
                aria-describedby={`overview-telemetry-note-${index}`}
                data-overview-depth={index % 2 ? "-5" : "5"}
                data-overview-spread={index < 2 ? "-3" : "3"}
                className="glass glass-interactive overview-card-interaction h-full min-w-0 p-5 lg:p-6"
              >
                <h3 id={`overview-telemetry-${index}`} className="label-caps leading-relaxed">
                  {display(item.label)}
                </h3>
                <div className="mt-4 flex min-h-16 items-center justify-between gap-3">
                  <p
                    className="font-display text-4xl font-semibold tracking-tight tabular-nums xl:text-5xl"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </p>
                  {item.gauge !== null && <Gauge value={item.gauge} color={item.color} />}
                </div>
                <p
                  className="mt-3 font-mono text-[11px] tracking-wider"
                  style={{ color: item.color }}
                >
                  {display(item.status)}
                </p>
                <p
                  id={`overview-telemetry-note-${index}`}
                  className="mt-2 text-xs leading-relaxed text-muted-foreground"
                >
                  {display(item.note)}
                </p>
              </article>
            </div>
          ))}
        </AnimatedContent>
      </section>

      <section aria-labelledby="workflow-title" data-overview-depth="14">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="workflow-title" className="label-caps text-data">
            {t("03 / MISSION WORKFLOW")}
          </h2>
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("CURRENT VIEW: UNDERSTAND")}
          </span>
        </div>
        <AnimatedContent
          as="ol"
          paused={motionPaused}
          distance={35}
          duration={0.7}
          scale={0.98}
          blur={2}
          stagger={0.09}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {["Understand", "Assess", "Plan", "Navigate", "Adapt"].map((label, index) => (
            <li
              key={label}
              aria-current={index === 0 ? "step" : undefined}
              className={`glass flex items-center gap-3 px-4 py-4 ${index === 0 ? "glass-selected [--glass-selection:var(--mars)]" : ""}`}
            >
              <span className="font-mono text-xs text-mars">0{index + 1}</span>
              <span className="text-sm font-medium">{display(label)}</span>
            </li>
          ))}
        </AnimatedContent>
      </section>

      <AnimatedContent
        paused={motionPaused}
        distance={50}
        duration={0.95}
        scale={0.97}
        blur={3}
        className="min-w-0"
      >
        <section
          aria-labelledby="preview-title"
          data-overview-depth="-10"
          className="glass overview-card-interaction min-w-0 overflow-hidden"
        >
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
            <figure className="relative min-h-64 overflow-hidden bg-brand-midnight sm:min-h-80">
              <img
                src={jezeroMap}
                alt={t("Existing Jezero regional terrain image showing the crater rim and delta")}
                width={1536}
                height={1024}
                loading="lazy"
                data-overview-depth="24"
                className="absolute -inset-y-8 inset-x-0 h-[calc(100%+4rem)] w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-brand-midnight/80 to-transparent"
              />
              <div
                aria-hidden="true"
                className="overview-glass-fragments pointer-events-none absolute right-6 top-6 h-16 w-20"
              >
                <span className="overview-glass-fragment overview-glass-fragment-back" />
                <span className="overview-glass-fragment overview-glass-fragment-front" />
              </div>
              <figcaption className="absolute bottom-5 left-5 right-5 font-mono text-[10px] tracking-wider text-brand-white">
                {t("JEZERO CRATER / REGIONAL TERRAIN PREVIEW")}
              </figcaption>
            </figure>
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h2 id="preview-title" className="label-caps text-data">
                {t("04 / EXPLORATION PREVIEW")}
              </h2>
              <p className="mt-4 font-display text-2xl font-medium leading-tight">
                {t("Know the terrain.")}
                <br />
                {t("Choose your route.")}
              </p>
              <p className="mt-4 text-sm leading-7 text-text-secondary">
                {t(
                  "Inspect suitability zones, compare modeled hazards and resources, and explore science opportunities on the Survival Map.",
                )}
              </p>
              <button
                type="button"
                onClick={() => setView("map")}
                className="btn-ghost overview-action mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 self-start px-5 py-3 text-xs sm:w-auto"
              >
                {t("Open Survival Map")}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </AnimatedContent>
    </div>
  );
}

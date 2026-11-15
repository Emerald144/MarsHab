import { useId, useState } from "react";
import { useLanguage } from "@/i18n/useLanguage";
import type { Setup } from "@/lib/mission-store";
import {
  assessLoad,
  evaluateRoute,
  type BudgetStatus,
  type PlanningInputs,
} from "@/lib/route-model";
import { routeEvidence } from "@/lib/mission-evaluation";
import type { RouteFeature } from "@/lib/mission-api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelDetails } from "./PlanningDetails";

export function planningInputs(setup: Setup): PlanningInputs {
  return {
    ...setup.planning,
    outboundSpeedKmh: setup.walkingSpeedMPerHour / 1000,
    evaHours: setup.eva,
    scienceHours: setup.science,
    bufferHours: setup.buffer,
    resourceBudgetPercent: setup.resource,
    resourceReservePercent: setup.resourceReservePercent,
    resourceRatePercentPerHour: setup.resourceConsumptionPercentPerHour,
  };
}

const fieldClass = "mt-1 w-full min-w-0 rounded-md border border-input bg-background p-2 text-sm";
type ResearchKey =
  | "crewMassKg"
  | "evaVo2Max"
  | "suitMassKg"
  | "equipmentMassKg"
  | "sampleMassKg"
  | "pressureOffloadN"
  | "suitMassBasis";

export function PlanningFields({
  setup,
  onChange,
}: {
  setup: Setup;
  onChange: (s: Setup) => void;
}) {
  const { display } = useLanguage();
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<ResearchKey, boolean>>>({});
  const [exampleApplied, setExampleApplied] = useState(false);
  const load = assessLoad(setup.planning);
  const update = (changes: Partial<PlanningInputs>) => {
    setExampleApplied(false);
    onChange({ ...setup, planning: { ...setup.planning, ...changes } });
  };
  // Only display existing model constraints after the relevant field is edited.
  const explanation = (key: ResearchKey) => {
    if (!touched[key]) return undefined;
    const value = setup.planning[key];
    if (key === "suitMassBasis")
      return value !== "loaded" ? "Select loaded mass to calculate the estimate." : undefined;
    if (value === undefined) return undefined;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
      return "Enter zero or a positive value.";
    if (key === "evaVo2Max" && typeof value === "number" && value <= 14)
      return "Enter a value above 14 for this model.";
    if (key === "crewMassKg" && value === 0) return "Enter a value above zero.";
    return undefined;
  };
  const field = (key: keyof PlanningInputs, label: string, optional = false) => {
    const help = optional ? explanation(key as ResearchKey) : undefined;
    return (
      <label className="block min-w-0" key={key}>
        <span className="text-sm font-medium">{display(label)}</span>
        <input
          className={fieldClass}
          aria-label={display(label)}
          type="number"
          step="any"
          min="0"
          aria-invalid={help ? true : undefined}
          aria-describedby={help ? `${id}-${key}-help` : undefined}
          value={
            typeof setup.planning[key] === "number" && Number.isFinite(setup.planning[key])
              ? setup.planning[key]
              : ""
          }
          onBlur={() => {
            if (optional) setTouched((previous) => ({ ...previous, [key]: true }));
          }}
          onChange={(event) => {
            if (optional) setTouched((previous) => ({ ...previous, [key]: true }));
            update({
              [key]:
                event.target.value === ""
                  ? optional
                    ? undefined
                    : NaN
                  : event.target.valueAsNumber,
            });
          }}
        />
        {help && (
          <p id={`${id}-${key}-help`} className="mt-1 text-xs text-caution" aria-live="polite">
            {display(help)}
          </p>
        )}
      </label>
    );
  };
  const basisHelp = explanation("suitMassBasis");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("returnSpeedKmh", "Nominal return speed (km/h)")}
        {field("emergencySpeedKmh", "Emergency scenario speed (km/h)")}
        {field("restHours", "Planned rest (h)")}
        {field("emergencyBudgetMinutes", "Emergency walkback budget (min): 30 / 60 / custom")}
        {field("emergencyContingencyMinutes", "Emergency contingency (min)")}
      </div>
      <details className="rounded-md border border-border p-4">
        <summary className="cursor-pointer text-base font-medium">
          {display("Astronaut & Equipment")}{" "}
          <span className="ml-2 inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {display("Optional")}
          </span>
        </summary>
        <TooltipProvider>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("crewMassKg", "Body mass (kg)", true)}
            {field("evaVo2Max", "Fitness — VO₂max (mL/kg/min)", true)}
            {field("suitMassKg", "Suit mass (kg)", true)}
            <label className="block min-w-0">
              <span className="text-sm font-medium">{display("Suit mass type")}</span>
              <select
                className={fieldClass}
                aria-label={display("Suit mass type")}
                aria-invalid={basisHelp ? true : undefined}
                aria-describedby={basisHelp ? `${id}-basis-help` : undefined}
                value={setup.planning.suitMassBasis}
                onBlur={() => setTouched((previous) => ({ ...previous, suitMassBasis: true }))}
                onChange={(event) => {
                  setTouched((previous) => ({ ...previous, suitMassBasis: true }));
                  update({ suitMassBasis: event.target.value as PlanningInputs["suitMassBasis"] });
                }}
              >
                {["unknown", "dry", "loaded"].map((value) => (
                  <option key={value} value={value}>
                    {display(value)}
                  </option>
                ))}
              </select>
              {basisHelp && (
                <p id={`${id}-basis-help`} className="mt-1 text-xs text-caution" aria-live="polite">
                  {display(basisHelp)}
                </p>
              )}
            </label>
            {field("equipmentMassKg", "Equipment mass (kg)", true)}
            {field("sampleMassKg", "Collected samples (kg)", true)}
            <div>
              {field("pressureOffloadN", "Pressure support (N)", true)}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-4"
                    aria-label={display("About pressure support")}
                  >
                    {display("About pressure support")}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {display(
                    "Suit-specific pressure offload: the force supported by the pressurized suit.",
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-data focus-visible:outline focus-visible:outline-2 focus-visible:outline-data"
                  onClick={() => {
                    onChange({
                      ...setup,
                      planning: {
                        ...setup.planning,
                        crewMassKg: 49,
                        evaVo2Max: 36,
                        suitMassKg: 104,
                        suitMassBasis: "loaded",
                        equipmentMassKg: 23,
                        sampleMassKg: 0,
                        pressureOffloadN: 213,
                      },
                    });
                    setTouched({});
                    setExampleApplied(true);
                  }}
                >
                  {display("Use example values")}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {display("Replaces the fields in this section with a research example.")}
              </TooltipContent>
            </Tooltip>
            <span role="status" className="text-xs text-muted-foreground">
              {exampleApplied ? display("Example values applied") : ""}
            </span>
          </div>
        </TooltipProvider>
        <div className="mt-4 text-sm" role="status">
          {load.status === "Not assessed" ? (
            <>
              <div>{display("Load estimate unavailable")}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {display("Add crew and suit details to calculate the load estimate.")}
              </p>
            </>
          ) : (
            <div>{display(load.status)}</div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {display("Preliminary load estimate.")}
          </p>
        </div>
      </details>
      <ModelDetails />
    </div>
  );
}

export function RouteAssessment({
  route,
  setup,
  blocked = false,
}: {
  route?: RouteFeature | undefined;
  setup: Setup;
  blocked?: boolean;
}) {
  const { display } = useLanguage();
  const a = route
    ? evaluateRoute({ ...routeEvidence(route), blocked }, planningInputs(setup))
    : null;
  const number = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
  const statusLabel = (status: BudgetStatus) =>
    display(
      status === "within"
        ? "Within budget"
        : status === "exceeded"
          ? "Over budget"
          : "Not assessed",
    );
  const budgetRow = (
    label: string,
    required: number | null | undefined,
    available: number,
    status: BudgetStatus,
  ) => (
    <div
      role="group"
      aria-label={display(label)}
      className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-background/30 p-3"
    >
      <div>
        <div className="text-sm font-medium">{display(label)}</div>
        <div className="mt-1 font-mono text-sm">
          {number(required)} / {number(available)} h
        </div>
        {status === "exceeded" && required != null && (
          <p className="mt-1 text-xs text-caution">
            {display("Exceeds budget by {hours} h.", { hours: number(required - available) })}
          </p>
        )}
      </div>
      <span
        className={`text-xs font-medium ${status === "within" ? "text-safe" : status === "exceeded" ? "text-caution" : "text-muted-foreground"}`}
      >
        {status === "within" ? "✓ " : status === "exceeded" ? "! " : "— "}
        {statusLabel(status)}
      </span>
    </div>
  );
  return (
    <div className="my-3 space-y-3" aria-label={display("Planning constraint assessment")}>
      <div className="space-y-2" role="status">
        {budgetRow("Mission time", a?.totalHours, setup.eva, a?.eva ?? "unknown")}
        {budgetRow(
          "Emergency return",
          a?.emergencyHours,
          setup.planning.emergencyBudgetMinutes / 60,
          a?.emergency ?? "unknown",
        )}
        <div className="rounded-md bg-background/30 p-3">
          <div className="text-sm font-medium">{display("Crew load estimate")}</div>
          <div className="mt-1 text-sm">
            {display(
              a?.load.status === "Not assessed" || !a ? "Load estimate unavailable" : a.load.status,
            )}
          </div>
          {(!a || a.load.status === "Not assessed") && (
            <p className="mt-1 text-xs text-muted-foreground">
              {display("Add crew and suit details to calculate the load estimate.")}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {display("Preliminary load estimate.")}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {display("Planning estimates, not a safety certification.")}
      </p>
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">{display("Calculation details")}</summary>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
          <div>
            {display("Return assessment coverage")}: {display(a?.coverage ?? "none")}
          </div>
          <div>
            {display("Distance provenance")}: {display(a?.provenance ?? "unknown")}
          </div>
          {route && (
            <>
              <p>
                {display("Calculated route")}: {route.properties.distance_km.toFixed(2)} km ·{" "}
                {display("mean slope")} {route.properties.mean_slope_degrees.toFixed(1)}°
              </p>
              <p>{route.properties.algorithm}</p>
              <ul className="list-disc space-y-1 pl-4">
                {route.properties.assumptions.map((note) => (
                  <li key={note}>{display(note)}</li>
                ))}
              </ul>
            </>
          )}
          <p>
            {display(
              "Projected route segments; distance is one-way. Return retraces the static grid path.",
            )}
          </p>
          <p>
            {display(
              "Budget results are planning comparisons, not proof of safety. Suit architecture matters independently of mass. CTX imagery is not an elevation model.",
            )}
          </p>
          <p>
            {display(
              "Assumption: the static grid path is reversible. Changed or blocked paths require a new plan; rerouting restarts the route preview from base.",
            )}
          </p>
          <p>
            {display(
              "Missing: validated life support, terrain-speed, fatigue, thermal, radiation and fall-recovery models. Loaded suit mass and suit-specific offload are required for the research comparison.",
            )}
          </p>
          <p>
            {display(
              "Speeds are editable scenario assumptions; no rover refuge or rescue capability is assumed.",
            )}
          </p>
          {a?.load.stages.map((stage, index) => (
            <div key={index}>
              {display(index === 0 ? "Outbound load" : "Return load")}:{" "}
              {stage.carriedMassKg.toFixed(2)} kg · {display("Estimated suit allowance")}:{" "}
              {stage.estimatedMaxSuitMassKg.toFixed(2)} kg ·{" "}
              {display("Perceived force / capability")}: {stage.perceivedForceN.toFixed(2)} /{" "}
              {stage.crewCapabilityN.toFixed(2)} N · {display("Mobility factor")}:{" "}
              {stage.mobilityFactor.toFixed(4)}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

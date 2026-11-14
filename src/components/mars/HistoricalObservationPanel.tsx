import { useMemo, useState } from "react";
import { useLanguage } from "@/i18n/useLanguage";
import {
  lmstClock,
  splitAtGaps,
  useMedaAvailability,
  useMedaSeries,
  useMedaSummary,
  type EnvironmentGroup,
} from "@/lib/environment-api";
import { Panel } from "./ui";
import { ValueCategoryBadge } from "./ValueCategory";

/** Metrics shown in the panel. Units come from the data, never converted. */
const METRICS = [
  { id: "pressure", label: "Pressure", digits: 1 },
  { id: "air_temperature.ats1", label: "Air temperature (RSM sensor 1)", digits: 1 },
  { id: "wind_speed.horizontal", label: "Horizontal wind speed", digits: 1 },
] as const;

const TEMPERATURE_METRIC = "air_temperature.ats1";

function formatNumber(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function TemperatureProfile({ sol }: { sol: number }) {
  const { t, display } = useLanguage();
  const series = useMedaSeries(TEMPERATURE_METRIC, sol);
  const rows = series.data?.observations ?? [];
  const shape = useMemo(() => {
    if (!rows.length) return null;
    const sclks = rows.map((r) => r.sclk).filter((v): v is number => v !== null);
    const values = rows.map((r) => r.value);
    const x0 = Math.min(...sclks);
    const x1 = Math.max(...sclks);
    const y0 = Math.min(...values);
    const y1 = Math.max(...values);
    const W = 300;
    const H = 64;
    const px = (s: number) => ((s - x0) / Math.max(1, x1 - x0)) * W;
    const py = (v: number) => H - ((v - y0) / Math.max(0.001, y1 - y0)) * (H - 6) - 3;
    const lines = splitAtGaps(rows).map((segment) =>
      segment.map((r) => `${px(r.sclk ?? x0).toFixed(1)},${py(r.value).toFixed(1)}`).join(" "),
    );
    return { lines, W, H, y0, y1, first: rows[0]?.lmst, last: rows[rows.length - 1]?.lmst };
  }, [rows]);

  if (series.isPending || !shape) return null;
  return (
    <figure className="mt-3" data-testid="meda-temperature-profile">
      <figcaption className="mb-1 text-[11px] text-muted-foreground">
        {t("Temperature through the sol (rover sensor, K); gaps are missing data, not interpolated")}
      </figcaption>
      <svg
        viewBox={`0 0 ${shape.W} ${shape.H}`}
        role="img"
        aria-label={display("Air temperature (RSM sensor 1)")}
        className="h-16 w-full rounded-md border border-border bg-background/40"
        preserveAspectRatio="none"
      >
        {shape.lines.map((points, index) => (
          <polyline key={index} points={points} fill="none" stroke="var(--data)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{lmstClock(shape.first) ?? ""} LMST</span>
        <span>
          {shape.y0.toFixed(0)}–{shape.y1.toFixed(0)} K
        </span>
        <span>{lmstClock(shape.last) ?? ""} LMST</span>
      </div>
    </figure>
  );
}

/**
 * Historical NASA MEDA observations measured at the Perseverance rover.
 * Never presented as live weather or as valid for a whole zone. Read-only context: it does not
 * change routes, terrain cost, feasibility, the resource model or the simulated closure.
 */
export function HistoricalObservationPanel({ className = "" }: { className?: string }) {
  const { t, display } = useLanguage();
  const availability = useMedaAvailability();
  const available = availability.data?.available === true;
  const summary = useMedaSummary(available);
  const [chosenSol, setChosenSol] = useState<number | null>(null);

  const title = (
    <span className="flex flex-wrap items-center gap-2">
      <span>{t("Historical Rover Observation")}</span>
      <ValueCategoryBadge category="observed" />
    </span>
  );
  const caveat = t(
    "Measured at the Perseverance rover's location in the past. Not live weather, not a forecast, and not valid for every Jezero zone.",
  );

  let body;
  if (availability.isPending || (available && summary.isPending)) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Loading historical MEDA observations…")}
      </p>
    );
  } else if (availability.isError || summary.isError) {
    body = (
      <div role="alert" className="space-y-2 text-sm">
        <p className="text-caution">{t("Historical MEDA observations could not be loaded.")}</p>
        <p className="text-xs text-muted-foreground">{t("The mission planner and simulation still work without them.")}</p>
        <button
          type="button"
          className="btn-ghost px-4 py-2 text-xs"
          onClick={() => {
            void availability.refetch();
            if (available) void summary.refetch();
          }}
        >
          {t("Retry")}
        </button>
      </div>
    );
  } else if (!available || !summary.data?.groups.length) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        {t("No historical MEDA observations are available.")}
        {availability.data?.reason ? <span className="mt-1 block text-xs">{availability.data.reason}</span> : null}
      </p>
    );
  } else {
    const groups = summary.data.groups;
    const sols = [...new Set(groups.map((g) => g.sol))].sort((a, b) => a - b);
    const sol = chosenSol !== null && sols.includes(chosenSol) ? chosenSol : (sols[0] as number);
    const bySolMetric = new Map<string, EnvironmentGroup>(groups.filter((g) => g.sol === sol).map((g) => [g.metric, g]));
    const anchor = bySolMetric.get(TEMPERATURE_METRIC) ?? bySolMetric.get("pressure");
    const locations = (availability.data?.rover_location_by_sol ?? []).filter((l) => l.sol === sol);
    const location = locations[0];
    const excluded = availability.data?.missing_data?.excluded_metrics ?? [];
    body = (
      <div className="space-y-3">
        <div className="text-[11px] text-muted-foreground">
          {t("NASA PDS · Mars 2020 MEDA · Sols {first}–{last}", { first: sols[0] as number, last: sols[sols.length - 1] as number })}
        </div>
        <div role="group" aria-label={t("Select sol")} className="flex flex-wrap items-center gap-2">
          <span className="label-caps">{t("Sol")}</span>
          {sols.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === sol}
              onClick={() => setChosenSol(s)}
              className={`rounded-md border px-3 py-1 font-mono text-xs ${s === sol ? "border-data bg-data/10 text-data" : "border-border text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="label-caps text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-2 font-normal">{t("Metric")}</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">{t("Min")}</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">{t("Mean")}</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">{t("Max")}</th>
                <th scope="col" className="px-2 py-1 text-right font-normal">{t("Coverage")}</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {METRICS.map(({ id, label, digits }) => {
                const g = bySolMetric.get(id);
                return (
                  <tr key={id} className="border-t border-border/60">
                    <th scope="row" className="py-1.5 pr-2 text-left font-sans font-normal">{t(label)}</th>
                    {g ? (
                      <>
                        <td className="px-2 text-right">{formatNumber(g.minimum, digits)}</td>
                        <td className="whitespace-nowrap px-2 text-right">{formatNumber(g.mean, digits)} <span className="text-muted-foreground">{g.unit ?? ""}</span></td>
                        <td className="px-2 text-right">{formatNumber(g.maximum, digits)}</td>
                        <td className="px-2 text-right">
                          {g.coverage_fraction_of_sol === undefined ? "—" : `${(g.coverage_fraction_of_sol * 100).toFixed(0)}%`}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-2 text-right text-muted-foreground">{t("Not available")}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {anchor?.first_lmst && anchor.last_lmst ? (
          <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
            <div>{t("Local mean solar time {start} to {end}", { start: lmstClock(anchor.first_lmst) ?? "", end: lmstClock(anchor.last_lmst) ?? "" })}</div>
            {anchor.first_utc && anchor.last_utc ? (
              <div>{t("UTC (derived, about ±1 s): {start} to {end}", { start: anchor.first_utc.slice(0, 16).replace("T", " "), end: anchor.last_utc.slice(0, 16).replace("T", " ") })}</div>
            ) : null}
          </div>
        ) : null}
        <TemperatureProfile sol={sol} />
        <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
          {location?.status === "validated" && location.jz_zone_id
            ? t("Rover was inside {zone} during these sols (position checked against NASA PLACES, {distance} m difference).", {
                zone: location.jz_zone_id,
                distance: (location.distance_to_places_m ?? 0).toFixed(2),
              })
            : t("Rover position could not be validated, so no location is shown.")}
        </div>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">{t("Data notes")}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {excluded.some((m) => m.metric === "relative_humidity") && (
              <li>{t("Relative humidity is not shown: NASA considers humidity data before sol 63 unreliable.")}</li>
            )}
            <li>{t("Only a few sols are loaded; this is a snapshot, not a climate record.")}</li>
            <li>{t("MEDA measures about 12 hours per sol, so coverage below 100% is normal.")}</li>
            <li>{t("Invalid fill values are excluded, never filled in or interpolated.")}</li>
            <li>{t("UTC is derived from PDS label times; local solar times are as published.")}</li>
            <li>{t("Terrain costs and routes are not changed by historical weather.")}</li>
          </ul>
        </details>
      </div>
    );
  }

  return (
    <Panel title={title} className={className}>
      <div data-testid="historical-observation-panel">
        <p className="mb-3 text-xs text-muted-foreground">{caveat}</p>
        {body}
      </div>
      <span className="sr-only">{display("Historical Rover Observation")}</span>
    </Panel>
  );
}

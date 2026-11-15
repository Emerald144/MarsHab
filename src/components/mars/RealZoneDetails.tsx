import { useLanguage } from "@/i18n/useLanguage";
import { terrainIndex } from "@/lib/real-map-layers";
import { REAL_FACTOR_LABELS, type RealZone } from "@/lib/jezero-real-data";

export function RealZoneDetails({
  zone,
  onSelect,
}: {
  zone: RealZone;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const { display } = useLanguage();
  const number = (value: number | null | undefined, digits = 1, unit = "") =>
    typeof value === "number" && Number.isFinite(value)
      ? `${value.toFixed(digits)}${unit}`
      : display("Not available");
  const index = terrainIndex(zone);
  return (
    <section aria-label={display("Zone Details")} className="min-w-0 space-y-5 p-4">
      <div>
        <div className="text-xs font-medium text-cyan-300">{display("Zone Details")}</div>
        <h3 className="mt-1 font-display text-2xl font-bold">{zone.id}</h3>
      </div>
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <div className="text-xs text-muted-foreground">{display("Terrain suitability")}</div>
        <div className="mt-1 font-mono text-3xl font-semibold">
          {index === null ? display("Not available") : `${index.toFixed(1)}/100`}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{display("Terrain-only estimate")}</p>
      </div>
      <dl className="space-y-3 text-sm">
        {[
          ["Area", number(zone.areaKm2, 1, " km²")],
          ["Elevation", number(zone.elevation.mean, 0, " m")],
          ["Min / Max", `${number(zone.elevation.min, 0)} / ${number(zone.elevation.max, 0)} m`],
          ["Slope", number(zone.slope.mean, 1, "°")],
          ["p90 / p99", `${number(zone.slope.p90)}° / ${number(zone.slope.p99)}°`],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">{display(label!)}</dt>
            <dd className="font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
      {onSelect && (
        <button
          type="button"
          className="btn-mars w-full rounded-lg px-4 py-3 text-sm"
          onClick={() => onSelect(zone.id)}
        >
          {display("Select destination")}
        </button>
      )}
      <details className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          {display("Details")}
        </summary>
        <div className="mt-3 space-y-3 break-words">
          <p>
            {display(
              "Terrain index = gentle% + 0.5 × moderate%. Gentle ≤5°, moderate >5–15°, steep >15°. Unavailable below 90% coverage. A terrain-only heuristic, not survival probability or validated safety.",
            )}
          </p>
          <p>
            {display(
              "Extreme slope pixels have unresolved quality and may include terrain features or processing effects. Inspect source data before interpreting them as cliffs or artifacts.",
            )}
          </p>
          <p>
            {display("Max")}: {number(zone.slope.max, 1, "°")} · {display("Valid coverage")}:{" "}
            {number(zone.slope.coverage_percent, 1, "%")}
          </p>
          <p>
            {display("Gentle / Moderate / Steep")}: {number(zone.slopeClassPercent.gentle)}% /{" "}
            {number(zone.slopeClassPercent.moderate)}% / {number(zone.slopeClassPercent.steep)}%
          </p>
          <p>
            {display("Centroid (lon, lat)")}: {zone.centroidLonLat.join(", ")}°
          </p>
          {Object.entries(REAL_FACTOR_LABELS).map(([key, label]) => (
            <div key={key}>
              {display(label)}: {number(zone.factors[key as keyof typeof zone.factors])}
            </div>
          ))}
          {zone.dataQualityFlags.length > 0 && (
            <p>
              {display("Data quality flags:")} {zone.dataQualityFlags.join(", ")}
            </p>
          )}
          <div>
            {Object.entries(zone.sources).map(([key, value]) => (
              <p key={key}>
                {key}: {value}
              </p>
            ))}
          </div>
          <p>{display("CTX DEM, 20 m resolution. See Data Inventory for full provenance.")}</p>
        </div>
      </details>
    </section>
  );
}

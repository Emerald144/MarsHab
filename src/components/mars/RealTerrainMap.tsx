import { useLanguage } from "@/i18n/useLanguage";
import { useState } from "react";
import { X } from "lucide-react";
import {
  layerImageUrl,
  partialTerrainScore,
  REAL_FACTOR_LABELS,
  useRealTerrainDataset,
  type RealTerrainLayerId,
  type RealZone,
} from "@/lib/jezero-real-data";
import { projectedToPixel, type MarsPoint } from "@/lib/mission-api";
import { DataBadge } from "@/components/mars/DataBadge";
import { Panel } from "@/components/mars/ui";

export type RealRouteOverlay = {
  id: string;
  color: string;
  coordinates: [number, number][]; // [easting, northing] pairs, Mars projected metres
  dash?: string | undefined;
};

const LAYER_ORDER: RealTerrainLayerId[] = ["terrain", "elevation", "slope", "hillshade"];

function NotAvailable() {
  const { t } = useLanguage();
  return <span className="text-muted-foreground">{t("Not available")}</span>;
}

function fmt(n: number | null | undefined, digits = 1, unit = "") {
  if (n === null || n === undefined || Number.isNaN(n)) return <NotAvailable />;
  return (
    <>
      {n.toFixed(digits)}
      {unit}
    </>
  );
}

/** Real Jezero zone metrics panel. Every value is read from the Phase 1 JSON — nothing hardcoded. */
function RealZonePanel({
  zone,
  onClose,
  onSelectAsDestination,
}: {
  zone: RealZone;
  onClose: () => void;
  onSelectAsDestination?: ((id: string) => void) | undefined;
}) {
  const { t, display } = useLanguage();
  const partial = partialTerrainScore(zone.factors);

  return (
    <div className="glass glass-overlay glass-selected animate-slide-in absolute bottom-4 right-4 top-4 w-[340px] overflow-y-auto p-5">
      <button
        aria-label={t("Close inspection")}
        onClick={onClose}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="font-display text-xl font-bold">{zone.id}</div>
      <div className="label-caps mt-1 flex items-center gap-2">
        <DataBadge kind="real" />
        {t("Real Jezero Terrain")}
      </div>

      <div className="mt-4 space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Area")}</span>
          <span>{fmt(zone.areaKm2, 1, " km²")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Centroid (lon, lat)")}</span>
          <span>
            {zone.centroidLonLat[0].toFixed(3)}°, {zone.centroidLonLat[1].toFixed(3)}°
          </span>
        </div>
      </div>

      <div className="label-caps mt-5 mb-2">{t("Elevation")}</div>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Mean")}</span>
          <span>{fmt(zone.elevation.mean, 0, " m")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Min / Max")}</span>
          <span>
            {fmt(zone.elevation.min, 0, " m")} / {fmt(zone.elevation.max, 0, " m")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Range")}</span>
          <span>{fmt(zone.elevation.range, 0, " m")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Valid coverage")}</span>
          <span>{fmt(zone.elevation.coverage_percent, 1, "%")}</span>
        </div>
      </div>

      <div className="label-caps mt-5 mb-2">{t("Slope")}</div>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Mean / Median")}</span>
          <span>
            {fmt(zone.slope.mean, 1, "°")} / {fmt(zone.slope.median, 1, "°")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("p90 / p99")}</span>
          <span>
            {fmt(zone.slope.p90, 1, "°")} / {fmt(zone.slope.p99, 1, "°")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("Max")}</span>
          <span>{fmt(zone.slope.max, 1, "°")}</span>
        </div>
        <div className="text-[10px] leading-relaxed text-muted-foreground">
          {t(
            "Max slope values of roughly 75-88° are likely 20 m DEM artifacts (e.g. single noisy pixels), not measured cliffs. p90/p99 are more representative of the zone."
          )}
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-muted-foreground">{t("Gentle / Moderate / Steep")}</span>
          <span>
            {fmt(zone.slopeClassPercent.gentle, 0, "%")} / {fmt(zone.slopeClassPercent.moderate, 0, "%")} /{" "}
            {fmt(zone.slopeClassPercent.steep, 0, "%")}
          </span>
        </div>
      </div>

      <div className="label-caps mt-5 mb-2">{t("Terrain-only assessment")}</div>
      <div className="flex items-center gap-2">
        <DataBadge kind="heuristic" />
        <span className="font-mono text-2xl font-bold">
          {partial === null ? <NotAvailable /> : `${partial}%`}
        </span>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t(
          "Terrain-only / Partial — NOT a validated safety classification. Computed only from the available real factor(s) below; missing factors are not treated as zero."
        )}
      </div>
      <div className="mt-3 space-y-2">
        {(Object.keys(REAL_FACTOR_LABELS) as (keyof typeof REAL_FACTOR_LABELS)[]).map((key) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{display(REAL_FACTOR_LABELS[key])}</span>
            <span>{zone.factors[key] === null ? <NotAvailable /> : `${zone.factors[key]}%`}</span>
          </div>
        ))}
      </div>
      {zone.dataQualityFlags.length > 0 && (
        <div className="mt-4 text-[11px] text-caution">
          {t("Data quality flags:")} {zone.dataQualityFlags.join(", ")}
        </div>
      )}

      <div className="label-caps mt-5 mb-2">{t("Source")}</div>
      <div className="text-[11px] leading-relaxed text-muted-foreground">
        {Object.entries(zone.sources).map(([k, v]) => (
          <div key={k}>
            {k}: {v}
          </div>
        ))}
        <div className="mt-1">{t("CTX DEM, 20 m resolution. See Data Inventory for full provenance.")}</div>
      </div>

      {onSelectAsDestination && (
        <button
          onClick={() => onSelectAsDestination(zone.id)}
          className="btn-mars mt-5 flex w-full items-center justify-center gap-2 py-3 text-xs"
        >
          {t("Select as Mission Destination")}
        </button>
      )}
      <div className="mt-5 rounded-sm border border-dashed border-muted-foreground p-3 text-[11px] text-muted-foreground">
        {t(
          "Selecting this zone drives the real Mission Setup, route planning, feasibility, simulation and report — all computed from the real DEM/slope data, not illustrative values."
        )}
      </div>
    </div>
  );
}

type Props = {
  className?: string;
  /** Controlled selection, so a parent (e.g. the mission planner) can drive which zone is shown. */
  selectedZoneId?: string | null;
  onSelectZone?: (id: string | null) => void;
  /** Real computed route(s) in Mars projected metres, drawn on top of the terrain layer. */
  routes?: RealRouteOverlay[];
  /** Mission base marker, in Mars projected metres. */
  basePoint?: MarsPoint;
  /** A moving marker (e.g. simulated current position), in Mars projected metres. */
  markerPoint?: MarsPoint;
  /** A verified science waypoint (Route C), drawn with a distinct marker from the base/current position. */
  waypointPoint?: MarsPoint;
  hidePanel?: boolean;
  onSelectAsDestination?: (id: string) => void;
};

export function RealTerrainMap({
  className,
  selectedZoneId,
  onSelectZone,
  routes,
  basePoint,
  markerPoint,
  waypointPoint,
  hidePanel,
  onSelectAsDestination,
}: Props) {
  const { t, display } = useLanguage();
  const { data, isLoading, isError, error } = useRealTerrainDataset();
  const [activeLayer, setActiveLayer] = useState<RealTerrainLayerId>("terrain");
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = selectedZoneId !== undefined ? selectedZoneId : internalSelected;
  const setSelected = (id: string | null) => {
    setInternalSelected(id);
    onSelectZone?.(id);
  };

  if (isLoading) {
    return (
      <div className={`glass flex items-center justify-center rounded-xl ${className ?? ""}`}>
        <span className="label-caps text-muted-foreground">{t("Loading real terrain data…")}</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`glass flex items-center justify-center rounded-xl ${className ?? ""}`}>
        <span className="label-caps text-danger">
          {t("Could not load real terrain data.")} {error instanceof Error ? error.message : ""}
        </span>
      </div>
    );
  }

  const layer = data.layers.find((l) => l.id === activeLayer);
  const zone = data.zones.find((z) => z.id === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {LAYER_ORDER.map((id) => {
          const l = data.layers.find((x) => x.id === id);
          if (!l) return null;
          return (
            <button
              key={id}
              onClick={() => setActiveLayer(id)}
              aria-pressed={activeLayer === id}
              className={`glass glass-interactive focus-ring rounded-md px-3 py-1.5 text-xs font-display uppercase tracking-wider ${
                activeLayer === id ? "glass-selected" : ""
              }`}
            >
              {display(l.name)}
            </button>
          );
        })}
        <DataBadge kind="real" label="Real terrain · Jezero Crater" />
      </div>

      <div
        data-theme="dark"
        className={`relative overflow-hidden rounded-xl border border-border ${className ?? ""}`}
      >
        {!layer ? (
          <div className="flex h-full items-center justify-center">
            <span className="label-caps text-muted-foreground">
              {t("This layer is not available.")}
            </span>
          </div>
        ) : (
          <svg
            role="img"
            aria-label={t("Real Jezero Crater terrain map")}
            viewBox={`0 0 ${data.width} ${data.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="block h-full w-full"
          >
            <image
              href={layerImageUrl(layer)}
              x="0"
              y="0"
              width={data.width}
              height={data.height}
              preserveAspectRatio="xMidYMid meet"
            />
            {data.zones.map((z) => {
              const sel = selected === z.id;
              return (
                <g
                  key={z.id}
                  onClick={() => setSelected(z.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${z.id} terrain zone`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(z.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <title>{z.id}</title>
                  {z.svgPoints.map((ring, i) => (
                    <polygon
                      key={i}
                      points={ring}
                      fill="var(--data)"
                      fillOpacity={sel ? 0.32 : 0.14}
                      stroke="var(--data)"
                      strokeOpacity={sel ? 1 : 0.55}
                      strokeWidth={sel ? 2.5 : 1}
                      className="transition-all duration-500 hover:fill-opacity-25"
                    />
                  ))}
                  <text
                    x={z.center[0]}
                    y={z.center[1]}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground font-mono text-[18px] font-semibold"
                  >
                    {z.id}
                  </text>
                </g>
              );
            })}
            {routes?.map((r) => {
              const layerForBounds = data.layers.find((item) => item.id === "terrain") ?? data.layers[0];
              if (!layerForBounds) return null;
              const bounds = layerForBounds.bounds.projected_m;
              const points = r.coordinates
                .map(([easting, northing]) => projectedToPixel({ easting, northing }, bounds, data.width, data.height))
                .map(([x, y]) => `${x},${y}`)
                .join(" ");
              return (
                <polyline
                  key={r.id}
                  points={points}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={3}
                  strokeDasharray={r.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                />
              );
            })}
            {basePoint &&
              (data.layers.find((item) => item.id === "terrain") ?? data.layers[0]) &&
              (() => {
                const layerForBounds = data.layers.find((item) => item.id === "terrain") ?? data.layers[0]!;
                const [bx, by] = projectedToPixel(basePoint, layerForBounds.bounds.projected_m, data.width, data.height);
                return (
                  <g>
                    <circle cx={bx} cy={by} r={9} fill="var(--mars)" stroke="white" strokeWidth={2} />
                    <text x={bx} y={by - 14} textAnchor="middle" className="fill-foreground font-mono text-[12px] font-semibold">
                      {t("BASE")}
                    </text>
                  </g>
                );
              })()}
            {markerPoint &&
              (data.layers.find((item) => item.id === "terrain") ?? data.layers[0]) &&
              (() => {
                const layerForBounds = data.layers.find((item) => item.id === "terrain") ?? data.layers[0]!;
                const [mx, my] = projectedToPixel(markerPoint, layerForBounds.bounds.projected_m, data.width, data.height);
                return <circle cx={mx} cy={my} r={7} fill="var(--data)" stroke="white" strokeWidth={2} />;
              })()}
            {waypointPoint &&
              (data.layers.find((item) => item.id === "terrain") ?? data.layers[0]) &&
              (() => {
                const layerForBounds = data.layers.find((item) => item.id === "terrain") ?? data.layers[0]!;
                const [wx, wy] = projectedToPixel(waypointPoint, layerForBounds.bounds.projected_m, data.width, data.height);
                return (
                  <g>
                    <path
                      d={`M ${wx} ${wy - 10} L ${wx + 9} ${wy + 7} L ${wx - 9} ${wy + 7} Z`}
                      fill="var(--mars)"
                      stroke="white"
                      strokeWidth={2}
                    />
                    <text x={wx} y={wy - 15} textAnchor="middle" className="fill-foreground font-mono text-[11px] font-semibold">
                      {t("SCIENCE")}
                    </text>
                  </g>
                );
              })()}
          </svg>
        )}

        <div className="pointer-events-none absolute left-3 top-3 label-caps">
          {t("JEZERO CRATER · REAL TERRAIN · 1114×1267")}
        </div>
        {layer && (
          <div className="pointer-events-none absolute bottom-3 left-3 glass glass-overlay max-w-[260px] p-2 text-[10px] leading-relaxed">
            <div className="label-caps mb-1">{display(layer.name)}</div>
            <div>
              {t("Unit:")} {String(layer.legend["unit"] ?? "—")}
            </div>
            {layer.note && <div className="mt-1 text-muted-foreground">{display(layer.note)}</div>}
          </div>
        )}

        {!hidePanel && !zone && (
          <div className="glass glass-overlay absolute right-4 top-4 px-4 py-2 text-xs text-muted-foreground">
            {t("Click a zone to inspect real terrain data")}
          </div>
        )}
        {!hidePanel && zone && (
          <RealZonePanel zone={zone} onClose={() => setSelected(null)} onSelectAsDestination={onSelectAsDestination} />
        )}
      </div>
    </div>
  );
}

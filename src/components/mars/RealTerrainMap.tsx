import { useLanguage } from "@/i18n/useLanguage";
import { useEffect, useState } from "react";
import { RealMapLayersCard } from "./RealMapLayers";
import { RealZoneDetails } from "./RealZoneDetails";
import { useMapCamera } from "@/hooks/use-map-camera";
import {
  alignedLayer,
  DEFAULT_REAL_MAP_LAYERS,
  normalizeRealMapLayers,
  terrainIndex,
  terrainIndexColor,
  type RealMapLayers,
} from "@/lib/real-map-layers";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  layerImageUrl,
  useRealTerrainDataset,
  type RealTerrainLayerId,
} from "@/lib/jezero-real-data";
import { projectedToPixel, type MarsPoint } from "@/lib/mission-api";

export type RealRouteOverlay = {
  id: string;
  color: string;
  coordinates: [number, number][]; // [easting, northing] pairs, Mars projected metres
  dash?: string | undefined;
};

type Props = {
  explorer?: boolean;
  layerState?: RealMapLayers;
  onLayerStateChange?: (state: RealMapLayers) => void;
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
  explorer = false,
  layerState,
  onLayerStateChange,
}: Props) {
  const { display } = useLanguage();
  const { data, isLoading, isError } = useRealTerrainDataset();
  const [localLayers, setLocalLayers] = useState<RealMapLayers>({ ...DEFAULT_REAL_MAP_LAYERS });
  const layers = normalizeRealMapLayers(layerState ?? localLayers);
  const changeLayers = (next: RealMapLayers) => {
    setLocalLayers(next);
    onLayerStateChange?.(next);
  };
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const camera = useMapCamera(data?.width ?? 1114, data?.height ?? 1267);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const selected = selectedZoneId !== undefined ? selectedZoneId : internalSelected;
  const select = (id: string) => {
    if (explorer && camera.shouldSuppressClick()) return;
    setInternalSelected(id);
    onSelectZone?.(id);
    setDetailsOpen(true);
  };
  if (isLoading) return <div className={className}>{display("Loading real terrain data?")}</div>;
  if (isError || !data)
    return <div className={className}>{display("Could not load real terrain data.")}</div>;
  const basis = data.layers.find((layer) => layer.id === "terrain");
  const available = (id: RealTerrainLayerId) => {
    const layer = data.layers.find((item) => item.id === id);
    return (
      !!layer && !!basis && !failed.has(id) && alignedLayer(layer, basis, data.width, data.height)
    );
  };
  const point = (p: MarsPoint) =>
    projectedToPixel(p, basis!.bounds.projected_m, data.width, data.height);
  const zone = data.zones.find((item) => item.id === selected);
  const ctx = data.layers.find((layer) => layer.id === "ctx");
  const image = (id: RealTerrainLayerId, opacity = 1) => {
    const layer = data.layers.find((item) => item.id === id);
    return layer && available(id) ? (
      <image
        key={id}
        data-layer={id}
        href={layerImageUrl(layer)}
        x={0}
        y={0}
        width={data.width}
        height={data.height}
        opacity={opacity}
        pointerEvents="none"
        preserveAspectRatio="xMidYMid meet"
        onError={() => setFailed((previous) => new Set([...previous, id]))}
      />
    ) : null;
  };
  const layerCard = (embedded = false) => (
    <RealMapLayersCard
      data={data}
      state={layers}
      onChange={changeLayers}
      available={available}
      embedded={embedded}
    />
  );
  const action = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      aria-label={display(label)}
      className="focus-ring rounded border border-border bg-background/80 px-3 py-2 text-xs"
      onClick={onClick}
      disabled={disabled}
    >
      {display(label)}
    </button>
  );
  const view = camera.view;
  const details = !hidePanel && zone && (
    <div className="glass min-w-0 rounded-xl">
      {action(detailsOpen ? "Collapse zone details" : "Zone Details", () =>
        setDetailsOpen(!detailsOpen),
      )}
      {detailsOpen && <RealZoneDetails zone={zone} onSelect={onSelectAsDestination} />}
    </div>
  );
  return (
    <div className="space-y-3">
      {explorer && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl">{display("Jezero Explorer")}</h2>
          <div className="flex flex-wrap gap-2">
            {action("Zoom in", () => camera.zoom(1.4))}
            {action("Zoom out", () => camera.zoom(1 / 1.4))}
            {action("Fit map", camera.fitMap)}
            {action(
              "Fit imagery",
              () => {
                if (ctx?.coverage_preview_px) camera.fitExtent(ctx.coverage_preview_px);
              },
              !available("ctx"),
            )}
            {!wide && action("Layers", () => setDrawerOpen(true))}
          </div>
        </div>
      )}
      <div
        className={
          explorer && wide
            ? `grid items-start gap-3 ${details ? "xl:grid-cols-[220px_minmax(0,1fr)_280px]" : "xl:grid-cols-[240px_minmax(0,1fr)]"}`
            : "space-y-3"
        }
      >
        {(!explorer || wide) && layerCard(explorer)}
        <div className="min-w-0 space-y-3">
          <div
            data-theme="dark"
            className={`relative overflow-hidden rounded-xl border border-border bg-background ${className ?? ""}`}
          >
            <svg
              role="img"
              aria-label={display("Real Jezero Crater terrain map")}
              ref={explorer ? camera.ref : undefined}
              tabIndex={explorer ? 0 : undefined}
              viewBox={
                explorer
                  ? `${view.x} ${view.y} ${view.width} ${view.height}`
                  : `0 0 ${data.width} ${data.height}`
              }
              preserveAspectRatio="xMidYMid meet"
              className="block h-full w-full"
              style={
                explorer
                  ? { touchAction: "none", cursor: camera.dragging ? "grabbing" : "grab" }
                  : undefined
              }
              onPointerDown={explorer ? camera.onPointerDown : undefined}
              onPointerMove={explorer ? camera.onPointerMove : undefined}
              onPointerUp={explorer ? camera.onPointerUp : undefined}
              onPointerCancel={explorer ? camera.onPointerCancel : undefined}
              onKeyDown={
                explorer
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "+" || event.key === "=") {
                        event.preventDefault();
                        camera.zoom(1.4);
                      }
                      if (event.key === "-") {
                        event.preventDefault();
                        camera.zoom(1 / 1.4);
                      }
                      if (event.key === "0") camera.fitMap();
                    }
                  : undefined
              }
            >
              <g data-geography="true">
                {layers.basemap === "ctx" && image("hillshade")}
                {image(layers.basemap)}
                {layers.slope && image("slope", layers.slopeOpacity)}
                {layers.constraints && image("constraints", layers.constraintsOpacity)}
                {layers.suitability && (
                  <g data-layer="suitability" pointerEvents="none">
                    {data.zones.map((z) => (
                      <g key={z.id}>
                        {z.svgPoints.map((ring, n) => (
                          <polygon
                            key={n}
                            points={ring}
                            fill={terrainIndexColor(terrainIndex(z))}
                            opacity={0.45}
                          />
                        ))}
                        <text
                          x={z.center[0]}
                          y={z.center[1] + 24}
                          textAnchor="middle"
                          className="fill-foreground text-[18px]"
                        >
                          {terrainIndex(z) === null
                            ? display("Not available")
                            : `${terrainIndex(z)!.toFixed(1)}/100`}
                        </text>
                      </g>
                    ))}
                  </g>
                )}
                {data.zones.map((z) => (
                  <g
                    key={z.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${display("Inspect terrain zone")} ${z.id}`}
                    aria-pressed={selected === z.id}
                    onClick={() => select(z.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setInternalSelected(z.id);
                        onSelectZone?.(z.id);
                        setDetailsOpen(true);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <title>{z.id}</title>
                    {z.svgPoints.map((ring, n) => (
                      <polygon
                        key={n}
                        points={ring}
                        fill="var(--data)"
                        fillOpacity={selected === z.id ? 0.2 : 0}
                        stroke={layers.zones || selected === z.id ? "var(--data)" : "none"}
                        strokeWidth={selected === z.id ? 2.5 : 1}
                      />
                    ))}
                    {layers.zones && (
                      <text
                        data-zone-label={z.id}
                        x={z.center[0]}
                        y={z.center[1]}
                        textAnchor="middle"
                        className="pointer-events-none fill-foreground font-mono text-[18px] font-semibold"
                      >
                        {z.id}
                      </text>
                    )}
                  </g>
                ))}
                {layers.rover && data.roverTrack && basis && (
                  <g data-layer="rover" pointerEvents="none">
                    {data.roverTrack.points.map((p, n) => {
                      const [x, y] = point(p);
                      return (
                        <circle key={n} cx={x} cy={y} r={3} fill="#c084fc">
                          <title>Sol {p.sol}</title>
                        </circle>
                      );
                    })}
                  </g>
                )}
                {basis &&
                  routes?.map((route) => (
                    <polyline
                      key={route.id}
                      data-route={route.id}
                      pointerEvents="none"
                      points={route.coordinates
                        .map(([easting, northing]) => point({ easting, northing }).join(","))
                        .join(" ")}
                      fill="none"
                      stroke={route.color}
                      strokeWidth={3}
                      strokeDasharray={route.dash}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                {basis &&
                  [
                    { p: basePoint, label: "BASE", color: "var(--mars)" },
                    { p: markerPoint, label: "", color: "var(--data)" },
                    { p: waypointPoint, label: "SCIENCE", color: "var(--mars)" },
                  ].map(({ p, label, color }, n) => {
                    if (!p) return null;
                    const [x, y] = point(p);
                    return (
                      <g key={n} pointerEvents="none">
                        {label === "SCIENCE" ? (
                          <path
                            d={`M ${x} ${y - 10} L ${x + 9} ${y + 7} L ${x - 9} ${y + 7} Z`}
                            fill={color}
                            stroke="white"
                            strokeWidth={2}
                          />
                        ) : (
                          <circle
                            cx={x}
                            cy={y}
                            r={label ? 9 : 7}
                            fill={color}
                            stroke="white"
                            strokeWidth={2}
                          />
                        )}
                        {label && (
                          <text
                            x={x}
                            y={y - 15}
                            textAnchor="middle"
                            className="fill-foreground text-[12px]"
                          >
                            {display(label)}
                          </text>
                        )}
                      </g>
                    );
                  })}
              </g>
            </svg>
            {!available(layers.basemap) && (
              <div className="absolute bottom-3 left-3 rounded bg-background p-2 text-xs">
                {display("This layer is not available.")}
              </div>
            )}
          </div>
          {!(explorer && wide) && details}
          {!hidePanel && !zone && (
            <p className="text-xs text-muted-foreground">
              {display("Click a zone to inspect real terrain data")}
            </p>
          )}
        </div>
        {explorer && wide && details}
      </div>
      {explorer && !wide && (
        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogTitle>{display("Layers")}</DialogTitle>
            {action("Close layers", () => setDrawerOpen(false))}
            {layerCard(true)}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

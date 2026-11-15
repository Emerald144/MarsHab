import { useId, useState } from "react";
import { useLanguage } from "@/i18n/useLanguage";
import type {
  RasterLayerManifestEntry,
  RealTerrainDataset,
  RealTerrainLayerId,
} from "@/lib/jezero-real-data";
import type { RealMapLayers, RealBasemap } from "@/lib/real-map-layers";

export function RealMapLayersCard({
  data,
  state,
  onChange,
  available,
  embedded = false,
}: {
  data: RealTerrainDataset;
  state: RealMapLayers;
  onChange: (state: RealMapLayers) => void;
  available: (id: RealTerrainLayerId) => boolean;
  embedded?: boolean;
}) {
  const { display } = useLanguage();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const basemaps: [RealBasemap, string][] = [
    ["terrain", "Terrain"],
    ["elevation", "Elevation"],
    ["hillshade", "Hillshade"],
  ];
  if (data.layers.some((layer) => layer.id === "ctx")) basemaps.push(["ctx", "CTX + hillshade"]);
  const connected = [
    data.layers.find((layer) => layer.id === state.basemap),
    ...(state.slope ? [data.layers.find((layer) => layer.id === "slope")] : []),
    ...(state.constraints ? [data.layers.find((layer) => layer.id === "constraints")] : []),
  ].filter((layer): layer is RasterLayerManifestEntry => !!layer && available(layer.id));
  const checkbox = (
    key: "zones" | "slope" | "suitability" | "constraints" | "rover",
    label: string,
    enabled: boolean,
    note?: string,
  ) => (
    <label
      className={`flex items-start gap-2.5 text-sm ${enabled ? "cursor-pointer" : "text-muted-foreground"}`}
    >
      <input
        type="checkbox"
        className="mt-1 accent-[var(--data)]"
        aria-label={display(label)}
        checked={state[key] && enabled}
        disabled={!enabled}
        onChange={(event) => onChange({ ...state, [key]: event.target.checked })}
      />
      <span>
        {display(label)}
        {(!enabled || note) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {display(!enabled ? "Data not connected" : note!)}
          </span>
        )}
      </span>
    </label>
  );
  return (
    <aside
      className={embedded ? "min-w-0 p-4" : "glass min-w-0 self-start rounded-xl p-4"}
      aria-label={display(embedded ? "Layers" : "Map Layers")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-data">
          {display(embedded ? "Layers" : "Map Layers")}
        </h3>
        <button
          type="button"
          className={`${embedded ? "hidden" : "lg:hidden"} focus-ring rounded border border-border px-2 py-1 text-xs`}
          aria-expanded={expanded}
          aria-controls={`${id}-controls`}
          onClick={() => setExpanded((value) => !value)}
        >
          {display(expanded ? "Hide layers" : "Show layers")}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {display("Terrain-based planning layers.")}
      </p>
      <div
        id={`${id}-controls`}
        className={`${expanded || embedded ? "block" : "hidden"} mt-4 space-y-4 lg:block`}
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{display("Basemap")}</legend>
          {basemaps.map(([key, label]) => (
            <label
              key={key}
              className={
                "flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-sm " +
                (state.basemap === key ? "border-cyan-400/30 bg-cyan-400/10" : "border-transparent")
              }
            >
              <input
                type="radio"
                name={`${id}-basemap`}
                className="accent-[var(--data)]"
                aria-label={display(label)}
                checked={state.basemap === key}
                disabled={!available(key)}
                onChange={() => onChange({ ...state, basemap: key })}
              />
              <span>
                {display(label)}
                {!available(key) && (
                  <span className="block text-xs text-muted-foreground">
                    {display("Data not connected")}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2.5">
          <legend className="mb-2 text-sm font-medium">{display("Overlays")}</legend>
          {checkbox("zones", "Zone boundaries and labels", true)}
          {checkbox("slope", "Slope classes", available("slope"))}
          {checkbox("suitability", "Terrain suitability", data.zones.length > 0)}
          {checkbox("constraints", "Terrain constraints", available("constraints"))}
          {(["slope", "constraints"] as const).map(
            (key) =>
              state[key] &&
              available(key) && (
                <label key={key} className="block text-xs text-muted-foreground">
                  {display(key === "slope" ? "Slope opacity" : "Constraint opacity")} ·{" "}
                  {Math.round(
                    (state[key === "slope" ? "slopeOpacity" : "constraintsOpacity"] ??
                      (key === "slope" ? 0.55 : 0.85)) * 100,
                  )}
                  %
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    className="mt-1 w-full accent-cyan-400"
                    aria-label={display(key === "slope" ? "Slope opacity" : "Constraint opacity")}
                    value={
                      state[key === "slope" ? "slopeOpacity" : "constraintsOpacity"] ??
                      (key === "slope" ? 0.55 : 0.85)
                    }
                    onChange={(event) =>
                      onChange({
                        ...state,
                        [key === "slope" ? "slopeOpacity" : "constraintsOpacity"]:
                          event.target.valueAsNumber,
                      })
                    }
                  />
                </label>
              ),
          )}
          {checkbox(
            "rover",
            "Historical rover observations",
            !!data.roverTrack,
            "Historical locations only",
          )}
        </fieldset>
        <section
          aria-label={display("Visible layer legends")}
          className="space-y-3 border-t border-border pt-3 text-xs"
        >
          {connected.map((layer) => (
            <LayerLegend key={layer.id} layer={layer} />
          ))}
          {state.suitability && (
            <div>
              <div className="font-medium">{display("Terrain suitability")} · 0–100</div>
              <div className="my-1 h-2 rounded bg-[linear-gradient(to_right,hsl(0_65%_45%),hsl(60_65%_45%),hsl(120_65%_45%))]" />
              <div>{display("Terrain-only index; unavailable values stay unassessed.")}</div>
            </div>
          )}
          {state.rover && data.roverTrack && (
            <div>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#c084fc]" />
              {display("Historical rover locations (sol)")}
            </div>
          )}
        </section>
        <details className="border-t border-border pt-3 text-xs">
          <summary className="cursor-pointer font-medium">{display("Layer details")}</summary>
          <div className="mt-3 space-y-3 break-words leading-relaxed text-muted-foreground">
            <p>
              {display(
                "Registered previews share the Mars projected extent; the full extent is fitted without stretching or cropping.",
              )}
            </p>
            <p>
              {display(
                "Terrain index = gentle% + 0.5 × moderate%. Gentle ≤5°, moderate >5–15°, steep >15°. Unavailable below 90% coverage. A terrain-only heuristic, not survival probability or validated safety.",
              )}
            </p>
            <p>
              {display(
                "Display overlays do not change routing. Constraint previews aggregate source-resolution exclusions conservatively; the router uses a separate resampled grid.",
              )}
            </p>
            <p>
              {display(
                "NoData means unassessed, not a confirmed hazard. A 20 m DEM cannot resolve individual rocks. Simulated closures are not part of these static layers.",
              )}
            </p>
            {!data.layers.some((layer) => layer.id === "ctx") && (
              <p>{display("CTX imagery has no aligned display asset connected.")}</p>
            )}
            {connected.map((layer) => (
              <div key={layer.id}>
                <div className="font-medium text-foreground">{display(layer.name)}</div>
                <div>
                  {layer.crs} · {layer.width_px}×{layer.height_px} · {layer.source_pixel_size_m} m →{" "}
                  {layer.display_pixel_size_m} m
                </div>
                <div>
                  {Object.entries(layer.bounds.projected_m)
                    .map(([key, value]) => `${key}: ${value.toFixed(2)}`)
                    .join(" · ")}{" "}
                  m
                </div>
                <div>{layer.source.join("; ")}</div>
                {layer.source_crs && (
                  <div>
                    {layer.source_crs} → {layer.crs}
                  </div>
                )}
                {layer.source_transform && <div>{layer.source_transform.join(", ")}</div>}
                {layer.resampling && <p>{display(layer.resampling)}</p>}
                {layer.note && <p>{display(layer.note)}</p>}
              </div>
            ))}
            {state.rover && data.roverTrack && (
              <div>
                {data.roverTrack.source}
                <p>
                  {display(
                    "Historical NASA PDS localization records; not live tracking, science targets, a refuge or rescue capability.",
                  )}
                </p>
              </div>
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}

function LayerLegend({ layer }: { layer: RasterLayerManifestEntry }) {
  const { display } = useLanguage();
  if (layer.id === "ctx")
    return (
      <div>
        <div className="font-medium">{display("CTX orbital imagery")}</div>
        <div className="mt-1 text-orange-300">{display("Partial imagery coverage")}</div>
      </div>
    );
  const classes = layer.legend["classes"] as
    | {
        name: string;
        color: string;
        min_exclusive?: number | null;
        max_inclusive?: number | null;
      }[]
    | undefined;
  const minimum = layer.legend["min"],
    maximum = layer.legend["max"];
  const name = layer.id === "terrain" ? "Terrain" : layer.name;
  return (
    <div>
      <div className="mb-1 font-medium">{display(name)}</div>
      {classes ? (
        classes.map((category) => (
          <div key={category.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: category.color }} />
            <span>
              {display(category.name)}
              {layer.id === "slope"
                ? category.min_exclusive == null
                  ? ` ≤${category.max_inclusive}°`
                  : category.max_inclusive == null
                    ? ` >${category.min_exclusive}°`
                    : ` >${category.min_exclusive}–${category.max_inclusive}°`
                : ""}
            </span>
          </div>
        ))
      ) : (
        <>
          <div>
            {typeof minimum === "number" && typeof maximum === "number"
              ? `${minimum.toFixed(1)}–${maximum.toFixed(1)} `
              : ""}
            {display(String(layer.legend["unit"] ?? "—"))}
          </div>
        </>
      )}
    </div>
  );
}

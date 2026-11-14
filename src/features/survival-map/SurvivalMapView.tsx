import { useLanguage } from "@/i18n/useLanguage";
import { useState, type CSSProperties } from "react";
import { Check, X, Shield, FlaskConical, Siren } from "lucide-react";

import {
  FACTOR_LABELS,
  MODE_WEIGHTS,
  ZONES,
  score,
  tier,
  tierColor,
  type Factors,
  type Mode,
} from "@/lib/mission-data";

import { isRealZoneId, useMission } from "@/lib/mission-store";
import { MarsMap, type Layers } from "@/components/mars/MarsMap";
import { RealTerrainMap } from "@/components/mars/RealTerrainMap";
import { Bar, Legend, Panel, Ring } from "@/components/mars/ui";

type MapKind = "demo" | "real";

function MapKindSelector({ value, onChange }: { value: MapKind; onChange: (v: MapKind) => void }) {
  const { t } = useLanguage();
  return (
    <div className="glass glass-overlay inline-flex gap-1 p-1 text-xs">
      <button
        onClick={() => onChange("demo")}
        aria-pressed={value === "demo"}
        className={`rounded-sm px-3 py-1.5 font-display uppercase tracking-wider ${
          value === "demo" ? "glass-selected text-mars" : "text-muted-foreground"
        }`}
      >
        {t("Demo Mission Map")}
      </button>
      <button
        onClick={() => onChange("real")}
        aria-pressed={value === "real"}
        className={`rounded-sm px-3 py-1.5 font-display uppercase tracking-wider ${
          value === "real" ? "glass-selected text-data" : "text-muted-foreground"
        }`}
      >
        {t("Real Jezero Terrain")}
      </button>
    </div>
  );
}

// Mission mode selector
export function ModeSelector() {
  const { display } = useLanguage();
  const { mode, setMode } = useMission();

  const opts: {
    id: Mode;
    label: string;
    icon: typeof Shield;
    col: string;
  }[] = [
    { id: "survival", label: "Survival", icon: Shield, col: "var(--safe)" },
    { id: "science", label: "Science", icon: FlaskConical, col: "var(--data)" },
    { id: "emergency", label: "Emergency", icon: Siren, col: "var(--danger)" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map(({ id, label, icon: Icon, col }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          aria-pressed={mode === id}
          className={`glass glass-interactive focus-ring flex flex-col items-center gap-1.5 rounded-md p-3 text-xs font-display tracking-wider uppercase ${mode === id ? "glass-selected" : ""}`}
          style={
            {
              "--glass-selection": id === "science" ? "var(--data)" : "var(--mars)",
              color: mode === id ? col : "var(--muted-foreground)",
            } as CSSProperties
          }
        >
          <Icon className="h-4 w-4" />
          {display(label)}
        </button>
      ))}
    </div>
  );
}

// Weight information for selected mission mode
function Weights() {
  const { display } = useLanguage();
  const { mode } = useMission();
  const w = MODE_WEIGHTS[mode].weights;

  if (mode === "emergency") {
    return (
      <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
        {["Return to Base", "Time", "Terrain", "Risk", "Resource Consumption"].map((x, i) => (
          <div key={x}>
            {i ? "↓ " : ""}
            {display(x)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1">
      {Object.entries(w)
        .sort((a, b) => b[1]! - a[1]!)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between font-mono text-xs">
            <span className="text-muted-foreground">
              {display(FACTOR_LABELS[k as keyof Factors])}
            </span>
            <span>{Math.round(v! * 100)}%</span>
          </div>
        ))}
    </div>
  );
}

// Survival Map page
export function SurvivalMapView() {
  const { t, display } = useLanguage();
  const { mode, setDestination, setView } = useMission();

  const [layers, setLayers] = useState<Layers>({
    suitability: true,
    terrain: false,
    hazards: false,
    resources: false,
    science: false,
    rover: false,
  });

  const [sel, setSel] = useState<string | null>(null);
  const zone = ZONES.find((z) => z.id === sel);
  const [mapKind, setMapKind] = useState<MapKind>("real");

  const layerOptions: [keyof Layers, string][] = [
    ["suitability", "Survival Suitability"],
    ["terrain", "Terrain"],
    ["hazards", "Hazards"],
    ["resources", "Resources"],
    ["science", "Science Targets"],
    ["rover", "Rover Observations"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MapKindSelector value={mapKind} onChange={setMapKind} />
        {mapKind === "demo" ? (
          <span className="rounded-sm border border-dashed border-muted-foreground px-2 py-1 text-[11px] text-muted-foreground">
            {t("Legacy illustrative demo — not georeferenced, not used for mission results")}
          </span>
        ) : (
          <span className="rounded-sm border border-dashed border-data px-2 py-1 text-[11px] text-data">
            {t("Primary map — drives Mission Setup, routes, feasibility and report")}
          </span>
        )}
      </div>

      {mapKind === "real" ? (
        <RealTerrainMap
          className="h-[72vh] min-h-[480px]"
          onSelectAsDestination={(id) => {
            if (isRealZoneId(id)) {
              setDestination(id);
              setView("planner");
            }
          }}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
          <div className="space-y-4">
            <Panel title={t("Map Layers")}>
              <div className="space-y-2">
                {layerOptions.map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() =>
                        setLayers((previous) => ({
                          ...previous,
                          [key]: !previous[key],
                        }))
                      }
                      className="accent-[var(--data)]"
                    />
                    {display(label)}
                  </label>
                ))}
              </div>
            </Panel>

            <Panel title={t("Mission Mode")}>
              <ModeSelector />
              <Weights />
            </Panel>
          </div>

          <div className="relative" data-theme="dark">
            <MarsMap
              layers={layers}
              selectedZone={sel}
              onZoneClick={setSel}
              className="h-[72vh] min-h-[480px]"
            />

            <div className="absolute bottom-4 left-4">
              <Legend />
            </div>

            {!zone && (
              <div className="glass glass-overlay absolute right-4 top-4 px-4 py-2 text-xs text-muted-foreground">
                {t("Click a zone to inspect its suitability")}
              </div>
            )}

        {zone &&
          (() => {
            const s = score(zone.factors, mode);

            return (
              <div
                key={zone.id + mode}
                className="glass glass-overlay glass-selected animate-slide-in absolute bottom-4 right-4 top-4 w-[320px] overflow-y-auto p-5"
              >
                <button
                  aria-label={t("Close inspection")}
                  onClick={() => setSel(null)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="font-display text-xl font-bold">
                  {t("AREA")} {zone.id}
                </div>

                <div className="label-caps mt-1">
                  {t("Martian Survival Suitability ·")} {display(MODE_WEIGHTS[mode].label)}
                </div>

                <div className="my-5 flex items-center gap-5">
                  <Ring value={s} size={120} />
                  <div
                    className="font-display text-lg font-semibold"
                    style={{ color: tierColor(s) }}
                  >
                    {display(tier(s))}
                  </div>
                </div>

                <div className="space-y-3">
                  {(Object.keys(FACTOR_LABELS) as (keyof Factors)[]).map((key) => (
                    <Bar key={key} label={FACTOR_LABELS[key]} value={zone.factors[key]} />
                  ))}
                </div>

                <div className="label-caps mt-6 mb-2">{t("Why this area?")}</div>

                <ul className="space-y-1.5 text-sm">
                  {zone.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tierColor(s) }} />
                      {display(reason)}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-sm border border-dashed border-muted-foreground p-3 text-[11px] text-muted-foreground">
                  {t(
                    "Legacy demo area — illustrative only. Switch to Real Jezero Terrain to select an actual mission destination."
                  )}
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      )}
    </div>
  );
}

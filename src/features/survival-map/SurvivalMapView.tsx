import { useLanguage } from "@/i18n/useLanguage";
import type { CSSProperties } from "react";
import { Shield, FlaskConical, Siren } from "lucide-react";
import type { Mode } from "@/lib/mission-data";
import { isRealZoneId, useMission } from "@/lib/mission-store";
import { RealTerrainMap } from "@/components/mars/RealTerrainMap";

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

// The Survival Map uses the real Jezero dataset; legacy map components remain available elsewhere.
export function SurvivalMapView() {
  const { t } = useLanguage();
  const { setDestination, setView, realMapLayers, setRealMapLayers } = useMission();
  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1">
        <h1 className="font-display text-lg font-semibold">{t("Real Jezero Terrain")}</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("Primary map — drives Mission Setup, routes, feasibility and report")}
        </p>
      </div>
      <RealTerrainMap
        explorer
        layerState={realMapLayers}
        onLayerStateChange={setRealMapLayers}
        className="h-[60svh] min-h-[320px] sm:h-[68vh] sm:min-h-[420px]"
        onSelectAsDestination={(id) => {
          if (isRealZoneId(id)) {
            setDestination(id);
            setView("planner");
          }
        }}
      />
    </div>
  );
}

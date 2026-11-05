import { createContext, useContext, useState, type ReactNode } from "react";
import type { Mode, RouteId } from "./mission-data";

export type View = "overview" | "map" | "planner" | "routes" | "execution" | "report";

type Setup = { name: string; eva: number; science: number; buffer: number; resource: number };
type State = {
  view: View;
  setView: (v: View) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  destination: string;
  setDestination: (d: string) => void;
  setup: Setup;
  setSetup: (s: Setup) => void;
  feasibilityChecked: boolean;
  setFeasibilityChecked: (b: boolean) => void;
  routesGenerated: boolean;
  setRoutesGenerated: (b: boolean) => void;
  activeRoute: RouteId;
  setActiveRoute: (r: RouteId) => void;
  envChanged: boolean;
  setEnvChanged: (b: boolean) => void;
  rerouted: boolean;
  setRerouted: (b: boolean) => void;
};

const Ctx = createContext<State | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("overview");
  const [mode, setMode] = useState<Mode>("survival");
  const [destination, setDestination] = useState("A-17");
  const [setup, setSetup] = useState<Setup>({
    name: "Jezero Geological Survey",
    eva: 6,
    science: 1.2,
    buffer: 0.5,
    resource: 80,
  });
  const [feasibilityChecked, setFeasibilityChecked] = useState(false);
  const [routesGenerated, setRoutesGenerated] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteId>("B");
  const [envChanged, setEnvChanged] = useState(false);
  const [rerouted, setRerouted] = useState(false);
  return (
    <Ctx.Provider
      value={{
        view,
        setView: (v) => {
          setView(v);
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        },
        mode,
        setMode,
        destination,
        setDestination,
        setup,
        setSetup,
        feasibilityChecked,
        setFeasibilityChecked,
        routesGenerated,
        setRoutesGenerated,
        activeRoute,
        setActiveRoute,
        envChanged,
        setEnvChanged,
        rerouted,
        setRerouted,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMission() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMission outside provider");
  return c;
}

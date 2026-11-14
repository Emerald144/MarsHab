import { createContext, useContext, useState, type ReactNode } from "react";
import type { Mode, RouteId } from "./mission-data";
import type { JezeroZoneId } from "./jezero-real-data";
import type { MissionPlan, RouteOutcome } from "./mission-api";

export type View = "overview" | "map" | "planner" | "routes" | "execution" | "report";

type Setup = {
  name: string;
  eva: number;
  science: number;
  buffer: number;
  resource: number;
  resourceReservePercent: number;
  resourceConsumptionPercentPerHour: number;
  walkingSpeedMPerHour: number;
};

/** `destination` is always a real JZ-xx zone id in the primary workflow; the legacy
 * A-xx demo module (mission-data.ts) is no longer reachable from it. */
export const isRealZoneId = (id: string): id is JezeroZoneId => /^JZ-0[1-8]$/.test(id);

type State = {
  view: View;
  setView: (v: View) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  destination: JezeroZoneId;
  setDestination: (d: JezeroZoneId) => void;
  /** Optional verified, route-eligible science catalog id selected for Route C. */
  scienceWaypointId: string | null;
  setScienceWaypointId: (id: string | null) => void;
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
  /** Real mission plan from POST /api/v1/missions/plan (routes A/B/C + feasibility). */
  missionPlan: MissionPlan | null;
  setMissionPlan: (p: MissionPlan | null) => void;
  /** Recomputed plan after a simulated environmental closure, for comparison. */
  revisedMissionPlan: MissionPlan | null;
  setRevisedMissionPlan: (p: MissionPlan | null) => void;
  emergencyRoute: RouteOutcome | null;
  setEmergencyRoute: (r: RouteOutcome | null) => void;
};

const Ctx = createContext<State | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("overview");
  const [mode, setMode] = useState<Mode>("survival");
  const [destination, setDestination] = useState<JezeroZoneId>("JZ-06");
  const [scienceWaypointId, setScienceWaypointIdState] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup>({
    name: "Jezero Geological Survey",
    eva: 8,
    science: 1.2,
    buffer: 0.5,
    resource: 80,
    resourceReservePercent: 20,
    resourceConsumptionPercentPerHour: 2,
    walkingSpeedMPerHour: 1000,
  });
  const [feasibilityChecked, setFeasibilityChecked] = useState(false);
  const [routesGenerated, setRoutesGenerated] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteId>("B");
  const [envChanged, setEnvChanged] = useState(false);
  const [rerouted, setRerouted] = useState(false);
  const [missionPlan, setMissionPlan] = useState<MissionPlan | null>(null);
  const [revisedMissionPlan, setRevisedMissionPlan] = useState<MissionPlan | null>(null);
  const [emergencyRoute, setEmergencyRoute] = useState<RouteOutcome | null>(null);

  const clearStaleMissionState = () => {
    setFeasibilityChecked(false);
    setRoutesGenerated(false);
    setMissionPlan(null);
    setRevisedMissionPlan(null);
    setEmergencyRoute(null);
    setEnvChanged(false);
    setRerouted(false);
  };

  const changeDestination = (d: JezeroZoneId) => {
    setDestination(d);
    clearStaleMissionState();
  };

  const changeScienceWaypointId = (id: string | null) => {
    setScienceWaypointIdState(id);
    clearStaleMissionState();
  };

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
        setDestination: changeDestination,
        scienceWaypointId,
        setScienceWaypointId: changeScienceWaypointId,
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
        missionPlan,
        setMissionPlan,
        revisedMissionPlan,
        setRevisedMissionPlan,
        emergencyRoute,
        setEmergencyRoute,
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

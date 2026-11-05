import { createFileRoute } from "@tanstack/react-router";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { Shell } from "@/components/mars/Shell";
import {
  Execution,
  Overview,
  Planner,
  Report,
  RouteAnalysis,
  SurvivalMapView,
} from "@/components/mars/Views";

export const Route = createFileRoute("/mission")({
  head: () => ({
    meta: [
      { title: "Interplanetary Survival Guide: Martian Map" },
      {
        name: "description",
        content:
          "Prototype Mars mission planner: survival suitability map of Jezero Crater, feasibility checks, route comparison and dynamic rerouting.",
      },
    ],
  }),
  component: () => (
    <MissionProvider>
      <App />
    </MissionProvider>
  ),
});

function App() {
  const { view } = useMission();
  const V = {
    overview: Overview,
    map: SurvivalMapView,
    planner: Planner,
    routes: RouteAnalysis,
    execution: Execution,
    report: Report,
  }[view];

  return (
    <Shell>
      <V />
    </Shell>
  );
}

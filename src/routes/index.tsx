import { createFileRoute } from "@tanstack/react-router";
import { MissionProvider, useMission } from "@/lib/mission-store";
import { Shell } from "@/components/mars/Shell";
import { Execution, Overview, Planner, Report, RouteAnalysis, SurvivalMapView } from "@/components/mars/Views";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Interplanetary Survival Guide: Martian Map" },
      { name: "description", content: "Prototype Mars mission planner: survival suitability map of Jezero Crater, feasibility checks, route comparison and dynamic rerouting." },
      { property: "og:title", content: "Interplanetary Survival Guide: Martian Map" },
      { property: "og:description", content: "Understand Mars. Plan for Survival. Navigate with Confidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const V = { overview: Overview, map: SurvivalMapView, planner: Planner, routes: RouteAnalysis, execution: Execution, report: Report }[view];
  return <Shell><V /></Shell>;
}

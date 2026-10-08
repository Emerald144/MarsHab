import { useMemo, type ReactNode } from "react";
import { BarChart3, Compass, FileText, LayoutDashboard, Map, Rocket } from "lucide-react";
import { useMission, type View } from "@/lib/mission-store";
import { MODE_WEIGHTS } from "@/lib/mission-data";

const NAV: { id: View; label: string; icon: typeof Map }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "map", label: "Survival Map", icon: Map },
  { id: "planner", label: "Mission Planner", icon: Compass },
  { id: "routes", label: "Route Analysis", icon: BarChart3 },
  { id: "execution", label: "Mission Execution", icon: Rocket },
  { id: "report", label: "Mission Report", icon: FileText },
];

function Stars() {
  const stars = useMemo(() => Array.from({ length: 90 }, (_, i) => ({ x: (i * 37.7) % 100, y: (i * 61.3) % 100, s: (i % 3) + 1, d: (i % 7) * 0.6 })), []);
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {stars.map((s, i) => (
        <span key={i} className="star absolute rounded-full bg-foreground" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
}

const Dot = ({ c }: { c: string }) => <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />;

export function Shell({ children }: { children: ReactNode }) {
  const { view, setView, mode } = useMission();
  return (
    <div className="flex min-h-screen">
      <Stars />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-background/40 p-5 backdrop-blur-xl md:flex">
        <div className="mb-10 flex items-center gap-2">
          <span className="text-xl">☄️</span>
          <span className="font-display text-lg font-semibold">Martian Map</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setView(id)}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-all ${view === id ? "bg-accent text-data glow-border" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-4 rounded-lg border border-border p-4">
          <div><div className="label-caps">Mission Status</div><div className="mt-1 flex items-center gap-2 font-mono text-xs text-caution"><Dot c="var(--caution)" />DEMO SIMULATION</div></div>
          <div><div className="label-caps">Region</div><div className="mt-1 text-sm">Jezero Crater</div></div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/50 px-6 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-5">
            <h1 className="font-display text-sm font-bold tracking-[0.2em]">INTERPLANETARY SURVIVAL GUIDE</h1>
            <div className="hidden items-center gap-4 font-mono text-[10px] tracking-widest text-muted-foreground lg:flex">
              <span className="flex items-center gap-1.5"><Dot c="var(--data)" />NASA DATA SIMULATION</span>
              <span className="flex items-center gap-1.5"><Dot c="var(--mars)" />JEZERO CRATER</span>
              <span className="flex items-center gap-1.5"><Dot c="var(--safe)" />MISSION READY</span>
            </div>
          </div>
          <div className="flex gap-5 font-mono text-[11px] text-muted-foreground">
            <span>Mission ID: <span className="text-foreground">MARS-026</span></span>
            <span>Mode: <span className={mode === "emergency" ? "text-danger" : "text-data"}>{MODE_WEIGHTS[mode].label}</span></span>
          </div>
        </header>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
          {NAV.map(({ id, label }) => (
            <button key={id} onClick={() => setView(id)} className={`whitespace-nowrap rounded px-3 py-1 text-xs ${view === id ? "bg-accent text-data" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        <main key={view} className="animate-rise flex-1 p-6">{children}</main>
        <footer className="border-t border-border px-6 py-3 text-[11px] text-muted-foreground">
          Prototype simulation using selected NASA datasets and modeled mission parameters. Suitability scores, route costs and resource estimates are illustrative and not official NASA safety classifications or operational routes.
        </footer>
      </div>
    </div>
  );
}

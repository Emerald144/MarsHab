import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Orbit } from "lucide-react";
import { useMission } from "@/lib/mission-store";
import { MODE_WEIGHTS } from "@/lib/mission-data";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";
import { StepIndicator } from "./StepIndicator";
import { DataBadge } from "./DataBadge";

function Stars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        x: (i * 37.7) % 100,
        y: (i * 61.3) % 100,
        s: (i % 3) + 1,
        d: (i % 7) * 0.6,
      })),
    [],
  );

  return (
    <div className="stars-layer pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="star absolute rounded-full bg-foreground"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            animationDelay: `${s.d}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { view, mode } = useMission();
  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Map view တွင် ကြယ်မပြ */}
      {view !== "map" && <Stars />}

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-background/60 px-4 py-2.5 backdrop-blur-xl md:px-6">
        {/* ဘယ်: Logo */}
        <Link
          to="/"
          aria-label="Martian Map, back to landing page"
          className="focus-ring flex items-center gap-2 rounded-md"
        >
          <Orbit className="h-6 w-6 text-mars" aria-hidden="true" />
          <span className="font-display text-lg font-semibold">Martian Map</span>
        </Link>

        {/* အလယ်: Step Indicator */}
        <div className="order-last flex w-full justify-center xl:order-none xl:w-auto">
          <StepIndicator />
        </div>

        {/* ညာ: Status */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground md:gap-4">
          <span className="hidden items-center gap-1.5 2xl:flex">
            <MapPin className="h-3.5 w-3.5 text-mars" aria-hidden="true" />
            Jezero Crater
          </span>
          <span className="hidden 2xl:inline">
            ID: <span className="text-foreground">MARS-026</span>
          </span>
          <span className="hidden sm:inline">
            Mode:{" "}
            <span className={mode === "emergency" ? "text-danger" : "text-data"}>
              {MODE_WEIGHTS[mode].label}
            </span>
          </span>
          <DataBadge kind="simulated" label="DEMO SIM" />
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main key={view} className="animate-rise flex-1 p-4 md:p-6">
        {children}
      </main>

      <footer className="border-t border-border px-6 py-3 text-[11px] text-muted-foreground">
        Prototype simulation using selected NASA datasets and modeled mission parameters.
        Suitability scores, route costs and resource estimates are illustrative and not official
        NASA safety classifications or operational routes.
      </footer>
    </div>
  );
}
import { useLanguage } from "@/i18n/useLanguage";
import { Check, Lock } from "lucide-react";
import { useMission, type View } from "@/lib/mission-store";

const STEPS: { id: View; label: string; needsRoutes?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Survival Map" },
  { id: "routes", label: "Routes", needsRoutes: true },
  { id: "execution", label: "Execution", needsRoutes: true },
  { id: "report", label: "Report", needsRoutes: true },
];

export function StepIndicator() {
  const { t, display } = useLanguage();
  const { view, setView, routesGenerated } = useMission();

  // Step 7 မတိုင်မီ "planner" view သည် Survival Map အဆင့်ဟု ယူဆ (ယာယီ)
  const activeView: View = view === "planner" ? "map" : view;
  const currentIndex = STEPS.findIndex((s) => s.id === activeView);

  return (
    <nav aria-label={t("Mission steps")} className="mx-auto shrink-0">
      <ol className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          const locked = !!step.needsRoutes && !routesGenerated && !current;
          const isLast = i === STEPS.length - 1;

          let circle = "border border-border-strong text-muted-foreground";
          if (done) circle = "bg-data text-background";
          if (current) circle = "bg-mars text-primary-foreground";

          return (
            <li key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setView(step.id)}
                disabled={locked}
                aria-label={
                  locked
                    ? t("{step}: generate routes first", { step: display(step.label) })
                    : display(step.label)
                }
                aria-current={current ? "step" : undefined}
                title={locked ? t("Generate routes first") : display(step.label)}
                className={`focus-ring group flex min-h-11 items-center gap-2 rounded-lg border px-1.5 py-1 transition-colors ${
                  current ? "border-mars/35 bg-mars/10" : "border-transparent"
                } ${locked ? "cursor-not-allowed opacity-50" : "hover:bg-data/5"}`}
              >
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                  <span
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${circle}`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : locked ? (
                      <Lock className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                </span>
                <span
                  className={`hidden whitespace-nowrap text-sm md:inline ${
                    current
                      ? "font-medium text-mars"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {display(step.label)}
                </span>
              </button>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px w-4 sm:w-6 ${done ? "bg-data" : "bg-border-strong/60"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

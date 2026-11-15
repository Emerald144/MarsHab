import { useLanguage } from "@/i18n/useLanguage";
import { usePageTranslation } from "@/i18n/usePageTranslation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { MarsCanvas } from "@/components/mars/MarsCanvas";
import { MissionApproach } from "@/components/mars/MissionApproach";
import { useMissionApproach } from "@/hooks/use-mission-approach";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "MarsHab prototype Mars mission planner: survival suitability map of Jezero Crater, feasibility checks, route comparison and dynamic rerouting.",
      },
      { title: "MarsHab | Mars Mission Planning" },
    ],
  }),
  component: Landing,
});

function Landing() {
  usePageTranslation(
    "MarsHab | Mars Mission Planning",
    "MarsHab prototype Mars mission planner: survival suitability map of Jezero Crater, feasibility checks, route comparison and dynamic rerouting.",
  );
  const { t, display } = useLanguage();
  const navigate = useNavigate();
  const router = useRouter();
  const [navigationFailed, setNavigationFailed] = useState(false);
  const { active, progress, reducedMotion, start } = useMissionApproach(() => {
    void navigate({ to: "/mission" }).catch(() => setNavigationFailed(true));
  });
  const beginMission = () => {
    start();
    void router.preloadRoute({ to: "/mission" }).catch(() => {});
  };
  return (
    <div
      data-theme="dark"
      className="relative isolate flex min-h-screen w-full flex-col justify-between overflow-hidden bg-brand-midnight text-brand-white"
    >
      <MarsCanvas approach={active && !reducedMotion ? Math.min(1, progress / 0.65) : 0} />
      <MissionApproach active={active} progress={progress} reducedMotion={reducedMotion} />

      <header
        style={{ zIndex: active ? 50 : undefined }}
        className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-8 md:px-16"
      >
        <LanguageSwitcher />
        <Link
          to="/mission"
          className={`focus-ring pointer-events-auto inline-flex min-h-11 items-center rounded-md border border-mars/40 bg-brand-midnight/70 px-5 py-2 font-mono text-[11px] tracking-wider text-brand-amber transition-colors hover:border-mars hover:bg-mars/15 ${active ? "fixed right-6 top-6 z-50" : ""}`}
        >
          {t("SKIP TO MISSION →")}
        </Link>
      </header>

      <section className="pointer-events-none relative z-10 flex max-w-4xl flex-col items-start px-6 pb-12 pt-8 sm:px-8 md:px-16 md:pt-0">
        <p className="glass glass-overlay mb-5 rounded-md px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-text-secondary sm:text-xs sm:tracking-[0.25em]">
          {t("Interplanetary Survival Guide")}
        </p>

        <h1 className="font-display text-[clamp(2.75rem,8vw,6.5rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-brand-white [text-shadow:0_4px_24px_var(--brand-midnight)]">
          MarsHab
        </h1>

        <p className="mt-5 max-w-xl font-display text-xl font-medium leading-snug tracking-tight text-brand-amber md:text-2xl">
          {t("Your Mission. Your Route. Your Survival.")}
        </p>

        <p className="glass glass-overlay mt-5 max-w-2xl p-4 text-sm leading-7 text-text-secondary md:p-5 md:text-base">
          {t(
            "Explore the Red Planet with intelligence. Analyze Martian terrain, assess environmental risks, discover scientific opportunities, and plan safer routes for human exploration.",
          )}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4 pointer-events-auto">
          <button
            type="button"
            onClick={beginMission}
            disabled={active}
            className="btn-mars group relative inline-flex min-h-14 items-center justify-center gap-3 px-5 py-4 text-xs sm:px-8 sm:text-sm"
          >
            <span>{active ? t("MISSION INITIATED") : t("ENTER MISSION CONTROL")}</span>
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              &rarr;
            </span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="pointer-events-none relative z-10 flex flex-col items-start justify-between gap-3 border-t border-data/15 bg-brand-midnight/80 px-6 py-6 text-xs leading-relaxed text-text-secondary backdrop-blur-sm sm:px-8 md:flex-row md:items-center md:px-16">
        <p>{t("Drag to rotate globe • Scroll to zoom in/out")}</p>
        <p className="pointer-events-auto font-mono text-[10px] tracking-wider text-data sm:text-xs">
          {t("[ SECURE ORBITAL LINK ACTIVE ]")}
        </p>
      </footer>
      {navigationFailed && (
        <div
          role="alert"
          className="fixed inset-x-6 top-24 z-50 rounded-lg bg-brand-midnight p-5 text-brand-white"
        >
          {t("Mission navigation could not complete.")}{" "}
          <a href="/mission" className="focus-ring text-data underline">
            {t("Open mission control")}
          </a>
        </div>
      )}
    </div>
  );
}

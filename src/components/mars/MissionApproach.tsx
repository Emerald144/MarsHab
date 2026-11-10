import { useLanguage } from "@/i18n/useLanguage";
import { useState } from "react";
import jezeroMap from "@/assets/jezero-map.jpg";

const approachEase = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function MissionApproach({
  active,
  progress,
  reducedMotion,
}: {
  active: boolean;
  progress: number;
  reducedMotion: boolean;
}) {
  const { t, display } = useLanguage();
  const [mapFailed, setMapFailed] = useState(false);
  const mapOpacity = reducedMotion ? 0 : approachEase((progress - 0.36) / 0.36);
  const fade = reducedMotion ? progress : approachEase((progress - 0.83) / 0.17);
  const status =
    progress < 0.12
      ? "MISSION INITIATED"
      : progress < 0.38
        ? "ESTABLISHING ORBITAL APPROACH"
        : progress < 0.62
          ? "TARGET: JEZERO CRATER"
          : progress < 0.83
            ? "INITIALIZING TERRAIN ANALYSIS"
            : "LOADING MISSION INTELLIGENCE";

  return (
    <div
      aria-hidden={!active}
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      style={{ visibility: active ? "visible" : "hidden" }}
    >
      {/* Preload the existing regional asset without claiming a georeferenced descent. */}
      <div className="absolute inset-0 bg-brand-midnight" style={{ opacity: mapOpacity }}>
        {!mapFailed && (
          <img
            src={jezeroMap}
            alt=""
            onError={() => setMapFailed(true)}
            className="h-full w-full object-cover"
            style={{ transform: `scale(${1 + (reducedMotion ? 0 : progress * 0.08)})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-midnight via-brand-midnight/20 to-brand-midnight/40" />
      </div>
      <div className="absolute inset-0 bg-brand-midnight" style={{ opacity: fade }} />
      {active && (
        <div className="absolute inset-x-0 bottom-[12%] mx-auto max-w-lg px-6 text-brand-white">
          <div className="glass glass-overlay p-5 sm:p-6">
            <p className="font-mono text-[10px] tracking-[0.18em] text-brand-amber">
              {t("TERRANEXIS // MISSION ENTRY")}
            </p>
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="mt-3 font-display text-lg font-medium sm:text-xl"
            >
              {display(status)}
            </p>
            <div aria-hidden="true" className="mt-4 h-px overflow-hidden bg-data/20">
              <div
                className="h-full origin-left bg-data"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-text-secondary">
              {t("ILLUSTRATIVE APPROACH ·")}{" "}
              {mapFailed ? t("REGIONAL IMAGE UNAVAILABLE") : t("JEZERO REGIONAL MAP")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

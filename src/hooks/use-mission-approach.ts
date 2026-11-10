import { useCallback, useEffect, useRef, useState } from "react";

export function useMissionApproach(onComplete: () => void) {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const started = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const began = performance.now();
    let frame = 0;
    let finished = false;
    let reduce = media.matches;
    const tick = (now: number) => {
      // Respect a preference enabled during the approach, too.
      reduce = reduce || media.matches;
      if (reduce) setReducedMotion(true);
      const next = Math.min(1, (now - began) / (reduce ? 350 : 4200));
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
      else if (!finished) {
        finished = true;
        complete.current();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return { active, progress, reducedMotion, start };
}

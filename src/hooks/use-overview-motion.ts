import { useEffect, useRef } from "react";

/** Bounded parallax only. AnimatedContent owns all Overview entrance animations. */
export function useOverviewMotion(paused = false) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || paused) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 768px)");
    const layers = [...root.querySelectorAll<HTMLElement>("[data-overview-depth]")];
    let stop = () => {};

    const configure = () => {
      stop();
      if (reduced.matches || !desktop.matches) return;
      let frame = 0;
      let needsMeasure = true;
      let bounds: {
        element: HTMLElement;
        top: number;
        height: number;
        depth: number;
        spread: number;
      }[] = [];

      const update = () => {
        frame = 0;
        if (!desktop.matches || document.hidden) return;
        if (needsMeasure) {
          bounds = layers.map((element) => {
            // Layout offsets exclude our transforms and entrance animations.
            let top = 0;
            let node: HTMLElement | null = element;
            while (node) {
              top += node.offsetTop;
              node = node.offsetParent as HTMLElement | null;
            }
            return {
              element,
              top,
              height: element.offsetHeight,
              depth: Number(element.dataset["overviewDepth"]) || 0,
              spread: Number(element.dataset["overviewSpread"]) || 0,
            };
          });
          needsMeasure = false;
        }
        const height = window.innerHeight;
        bounds.forEach(({ element, top, height: elementHeight, depth, spread }) => {
          const position = Math.max(
            -1,
            Math.min(
              1,
              (window.scrollY + height / 2 - top - elementHeight / 2) /
                ((height + elementHeight) / 2),
            ),
          );
          const distance = Math.abs(position);
          element.style.setProperty("--overview-scroll-y", `${(position * depth).toFixed(2)}px`);
          element.style.setProperty("--overview-scroll-x", `${(distance * spread).toFixed(2)}px`);
          element.style.setProperty(
            "--overview-scroll-scale",
            (1 - distance * Math.min(Math.abs(depth) / 2000, 0.012)).toFixed(4),
          );
        });
      };
      const schedule = () => {
        if (!frame && !document.hidden) frame = requestAnimationFrame(update);
      };
      const resize = () => {
        needsMeasure = true;
        schedule();
      };
      const resizeObserver =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
      if (desktop.matches) {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", schedule);
        resizeObserver?.observe(root);
        schedule();
      }
      root.dataset["overviewMotion"] = "true";
      stop = () => {
        resizeObserver?.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", schedule);
        delete root.dataset["overviewMotion"];
        layers.forEach((element) => {
          element.style.removeProperty("--overview-scroll-y");
          element.style.removeProperty("--overview-scroll-x");
          element.style.removeProperty("--overview-scroll-scale");
        });
      };
    };
    configure();
    reduced.addEventListener("change", configure);
    desktop.addEventListener("change", configure);
    return () => {
      stop();
      reduced.removeEventListener("change", configure);
      desktop.removeEventListener("change", configure);
    };
  }, [paused]);

  return rootRef;
}

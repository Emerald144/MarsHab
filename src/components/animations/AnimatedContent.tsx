/**
 * Adapted from React Bits AnimatedContent by David Haz.
 * https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Animations/AnimatedContent/AnimatedContent.tsx
 * See AnimatedContent.LICENSE.md for the upstream license.
 */
import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type {} from "gsap";

export type AnimatedContentWipe = "none" | "up" | "down" | "left" | "right" | "center";
export type AnimatedContentStaggerFrom = "start" | "end" | "center" | "edges" | "random";

export interface AnimatedContentProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "onAnimationStart"
> {
  children?: ReactNode;
  container?: Element | string | null;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  blur?: number;
  rotate?: number;
  tilt?: number;
  wipe?: AnimatedContentWipe;
  threshold?: number;
  delay?: number;
  stagger?: number;
  staggerFrom?: AnimatedContentStaggerFrom;
  trigger?: "scroll" | "mount";
  once?: boolean;
  scrub?: boolean | number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
  /** TerraNexis: reveal everything and release all animation resources. */
  paused?: boolean;
  /** Preserve ordered-list semantics when staggering workflow items. */
  as?: "div" | "ol";
}

const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const masks: Record<Exclude<AnimatedContentWipe, "none">, string> = {
  up: "linear-gradient(to top, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))",
  down: "linear-gradient(to bottom, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))",
  left: "linear-gradient(to left, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))",
  right:
    "linear-gradient(to right, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))",
  center:
    "radial-gradient(farthest-corner at 50% 50%, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))",
};
const managedProperties = [
  "opacity",
  "visibility",
  "transform",
  "transform-origin",
  "translate",
  "scale",
  "rotate",
  "filter",
  "mask-image",
  "-webkit-mask-image",
  "--ac-wipe",
];

export default function AnimatedContent({
  children,
  container,
  distance = 100,
  direction = "vertical",
  reverse = false,
  duration = 0.8,
  ease = "power3.out",
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  blur = 0,
  rotate = 0,
  tilt = 0,
  wipe = "none",
  threshold = 0.1,
  delay = 0,
  stagger = 0,
  staggerFrom = "start",
  trigger = "scroll",
  once = true,
  scrub = false,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = "power3.in",
  onStart,
  onComplete,
  onDisappearanceComplete,
  paused = false,
  as = "div",
  ...props
}: AnimatedContentProps) {
  const ref = useRef<HTMLElement>(null);
  const settled = useRef(false);
  const callbacks = useRef({ onStart, onComplete, onDisappearanceComplete });
  callbacks.current = { onStart, onComplete, onDisappearanceComplete };

  useSafeLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let disposed = false;
    let generation = 0;
    let context: gsap.Context | undefined;
    let restore = () => {};
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const stop = () => {
      // Invalidate pending dynamic imports as well as any existing context.
      generation++;
      try {
        context?.revert();
      } finally {
        context = undefined;
        restore();
      }
    };
    const expose = (status: string) => {
      stop();
      settled.current = true;
      element.dataset["animatedContentStatus"] = status;
    };
    const configure = () => {
      stop();
      if (paused || reduced.matches || (once && settled.current)) {
        settled.current = true;
        element.dataset["animatedContentStatus"] = paused
          ? "paused"
          : reduced.matches
            ? "reduced"
            : "settled";
        return;
      }
      const currentGeneration = generation;
      element.dataset["animatedContentStatus"] = "loading";
      // No hidden SSR/initial style: a failed chunk load leaves normal readable content.
      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
        .then(([{ gsap }, { ScrollTrigger }]) => {
          if (disposed || currentGeneration !== generation) return;
          const targets =
            stagger > 0 && element.children.length
              ? Array.from(element.children).filter(
                  (child): child is HTMLElement => child instanceof HTMLElement,
                )
              : [element];
          const snapshots = targets.map((target) => ({
            target,
            properties: managedProperties.map((property) => ({
              property,
              value: target.style.getPropertyValue(property),
              priority: target.style.getPropertyPriority(property),
            })),
          }));
          restore = () =>
            snapshots.forEach(({ target, properties }) =>
              properties.forEach(({ property, value, priority }) => {
                if (value) target.style.setProperty(property, value, priority);
                else target.style.removeProperty(property);
              }),
            );
          try {
            gsap.registerPlugin(ScrollTrigger);
            const scroller =
              typeof container === "string" ? document.querySelector(container) : container;
            if (typeof container === "string" && !scroller)
              throw new Error("AnimatedContent container not found");
            // Window is explicit by omission. No snap-container lookup or global defaults.
            const axis = direction === "horizontal" ? "x" : "y";
            const travel =
              (mobile.matches ? Math.min(Math.abs(distance), 20) : distance) * (reverse ? -1 : 1);
            const mask = wipe === "none" ? undefined : masks[wipe];
            const from: GSAPTweenVars = {
              [axis]: travel,
              scale,
              opacity: animateOpacity ? initialOpacity : 1,
            };
            const to: GSAPTweenVars = { [axis]: 0, scale: 1, opacity: 1, duration, ease };
            if (blur > 0) {
              from.filter = `blur(${mobile.matches ? Math.min(blur, 1) : blur}px)`;
              to.filter = "blur(0px)";
            }
            if (rotate) {
              from.rotation = rotate * (reverse ? -1 : 1);
              to.rotation = 0;
            }
            if (tilt) {
              const tiltAxis = direction === "horizontal" ? "rotationY" : "rotationX";
              from[tiltAxis] = tilt * (direction === "horizontal" ? -1 : 1) * (reverse ? -1 : 1);
              to[tiltAxis] = 0;
              from["transformPerspective"] = to["transformPerspective"] = 900;
            }
            if (mask) {
              from["--ac-wipe"] = 0;
              to["--ac-wipe"] = 1;
            }
            if (stagger > 0) to.stagger = { each: stagger, from: staggerFrom };
            // Create the context before running setup so partial initialization is reversible.
            context = gsap.context(() => {}, element);
            context.add(() => {
              if (mask) gsap.set(targets, { maskImage: mask, webkitMaskImage: mask });
              const timeline = gsap.timeline({
                paused: true,
                onStart: () => {
                  element.dataset["animatedContentStatus"] = "animating";
                  callbacks.current.onStart?.();
                },
                onComplete: () => {
                  if (!scrub) restore();
                  if (once && !scrub) settled.current = true;
                  element.dataset["animatedContentStatus"] = "settled";
                  callbacks.current.onComplete?.();
                  if (once && !scrub && disappearAfter > 0)
                    context?.add(() => {
                      gsap.to(targets, {
                        [axis]: -travel,
                        scale: 0.8,
                        opacity: animateOpacity ? initialOpacity : 0,
                        ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}),
                        delay: disappearAfter,
                        duration: disappearDuration,
                        ease: disappearEase,
                        ...(stagger > 0 ? { stagger: { each: stagger, from: staggerFrom } } : {}),
                        onComplete: () => callbacks.current.onDisappearanceComplete?.(),
                      });
                    });
                },
              });
              timeline.fromTo(targets, from, to, scrub ? 0 : Math.max(0, delay));
              if (trigger === "mount") {
                timeline.play();
                return;
              }
              const start = `top ${(1 - Math.max(0, Math.min(1, threshold))) * 100}%`;
              const base = { trigger: element, ...(scroller ? { scroller } : {}), start };
              if (scrub)
                ScrollTrigger.create({
                  ...base,
                  end: `top ${Math.max((1 - threshold) * 100 - 45, 5)}%`,
                  scrub: scrub === true ? true : Math.max(Number(scrub), 0.01),
                  animation: timeline,
                });
              else
                ScrollTrigger.create({
                  ...base,
                  once,
                  onEnter: () => timeline.play(),
                  ...(once
                    ? {}
                    : {
                        onLeaveBack: () => {
                          if (mask) gsap.set(targets, { maskImage: mask, webkitMaskImage: mask });
                          timeline.reverse();
                        },
                      }),
                });
              element.dataset["animatedContentStatus"] = "ready";
            });
          } catch (error) {
            expose("fallback");
            console.warn("AnimatedContent initialization failed; content remains visible.", error);
          }
        })
        .catch((error) => {
          if (disposed || currentGeneration !== generation) return;
          expose("fallback");
          console.warn("AnimatedContent could not load; content remains visible.", error);
        });
    };
    const focus = () => expose("focused");
    configure();
    element.addEventListener("focusin", focus);
    reduced.addEventListener("change", configure);
    mobile.addEventListener("change", configure);
    return () => {
      disposed = true;
      stop();
      element.removeEventListener("focusin", focus);
      reduced.removeEventListener("change", configure);
      mobile.removeEventListener("change", configure);
      delete element.dataset["animatedContentStatus"];
    };
  }, [
    container,
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    blur,
    rotate,
    tilt,
    wipe,
    threshold,
    delay,
    stagger,
    staggerFrom,
    trigger,
    once,
    scrub,
    disappearAfter,
    disappearDuration,
    disappearEase,
    paused,
  ]);

  return createElement(as, { ...props, ref, "data-animated-content": "" }, children);
}

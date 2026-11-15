import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  fitMapBox,
  mapPointFromClient,
  panMapBox,
  zoomMapBox,
  type MapBox,
} from "@/lib/map-camera";

export function useMapCamera(width: number, height: number) {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const ref = useCallback((element: SVGSVGElement | null) => setSvg(element), []);
  const [aspect, setAspect] = useState(width / height);
  const [pixelHeight, setPixelHeight] = useState(height);
  const [camera, setCamera] = useState<MapBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const canvas = { x: 0, y: 0, width, height };
  const fitted = fitMapBox(canvas, aspect);
  const view = camera ?? fitted;
  const latest = useRef({ view, fitted, canvas });
  latest.current = { view, fitted, canvas };
  const pointers = useRef(
    new Map<number, { x: number; y: number; startX: number; startY: number }>(),
  );
  const moved = useRef(false);
  useEffect(() => {
    setCamera(null);
  }, [width, height]);
  useEffect(() => {
    if (!svg) return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const next = box.width / box.height;
      setPixelHeight(box.height);
      setAspect(next);
      setCamera((previous) =>
        previous
          ? {
              ...previous,
              x: previous.x + previous.width / 2 - (previous.height * next) / 2,
              width: previous.height * next,
            }
          : null,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(svg);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [svg]);
  const zoom = (factor: number) => {
    const current = latest.current;
    setCamera(
      zoomMapBox(
        current.view,
        factor,
        { x: current.view.x + current.view.width / 2, y: current.view.y + current.view.height / 2 },
        current.fitted,
      ),
    );
  };
  useEffect(() => {
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== svg) return;
      event.preventDefault();
      const current = latest.current;
      const delta =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1);
      setCamera(
        zoomMapBox(
          current.view,
          Math.exp(Math.max(-0.7, Math.min(0.7, -delta * 0.002))),
          mapPointFromClient(svg, event.clientX, event.clientY),
          current.fitted,
        ),
      );
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [svg]);
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    if (!pointers.current.size) moved.current = false;
    svg?.focus({ preventScroll: true });
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const old = pointers.current.get(event.pointerId);
    if (!svg || !old) return;
    const previous = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { ...old, x: event.clientX, y: event.clientY });
    const next = [...pointers.current.values()];
    if (
      !moved.current &&
      next.length < 2 &&
      Math.hypot(event.clientX - old.startX, event.clientY - old.startY) < 5
    )
      return;
    moved.current = true;
    setDragging(true);
    svg.setPointerCapture?.(event.pointerId);
    const current = latest.current;
    if (previous.length >= 2 && next.length >= 2) {
      const center = (points: typeof next) => ({
        x: (points[0]!.x + points[1]!.x) / 2,
        y: (points[0]!.y + points[1]!.y) / 2,
      });
      const distance = (points: typeof next) =>
        Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
      const before = center(previous),
        after = center(next);
      const a = mapPointFromClient(svg, before.x, before.y),
        b = mapPointFromClient(svg, after.x, after.y);
      const factor = distance(previous) > 0 ? distance(next) / distance(previous) : 1;
      const zoomed = zoomMapBox(current.view, factor, a, current.fitted);
      const actual = current.view.width / zoomed.width;
      setCamera(panMapBox(zoomed, (b.x - a.x) / actual, (b.y - a.y) / actual, current.canvas));
    } else {
      const a = mapPointFromClient(svg, old.x, old.y),
        b = mapPointFromClient(svg, event.clientX, event.clientY);
      setCamera(panMapBox(current.view, b.x - a.x, b.y - a.y, current.canvas));
    }
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (svg?.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (!pointers.current.size) setDragging(false);
  };
  return {
    unitsPerPixel: view.height / pixelHeight,
    ref,
    view,
    dragging,
    zoom,
    fitMap: () => setCamera(null),
    fitExtent: (box: MapBox) => setCamera(fitMapBox(box, aspect, 0.08)),
    shouldSuppressClick: () => moved.current,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}

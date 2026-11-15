export type MapBox = { x: number; y: number; width: number; height: number };
export type MapPoint = { x: number; y: number };
export function fitMapBox(extent: MapBox, aspect: number, padding = 0): MapBox {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const height = Math.max(extent.height, extent.width / ratio) * (1 + padding * 2);
  const width = height * ratio;
  return {
    x: extent.x + extent.width / 2 - width / 2,
    y: extent.y + extent.height / 2 - height / 2,
    width,
    height,
  };
}
export function zoomMapBox(view: MapBox, factor: number, anchor: MapPoint, fitted: MapBox): MapBox {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const height = Math.min(fitted.height, Math.max(fitted.height / 20, view.height / factor));
  const scale = height / view.height;
  return {
    x: anchor.x - (anchor.x - view.x) * scale,
    y: anchor.y - (anchor.y - view.y) * scale,
    width: view.width * scale,
    height,
  };
}
export function panMapBox(view: MapBox, dx: number, dy: number, canvas: MapBox): MapBox {
  const cx = Math.max(canvas.x, Math.min(canvas.x + canvas.width, view.x + view.width / 2 - dx));
  const cy = Math.max(canvas.y, Math.min(canvas.y + canvas.height, view.y + view.height / 2 - dy));
  return { ...view, x: cx - view.width / 2, y: cy - view.height / 2 };
}
/** SVG's inverse screen matrix includes letterboxing, viewBox zoom and pan. */
export function mapPointFromClient(svg: SVGSVGElement, x: number, y: number): MapPoint {
  const matrix = svg.getScreenCTM()?.inverse();
  if (!matrix) return { x: 0, y: 0 };
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

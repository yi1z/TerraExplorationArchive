export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function pointerResponse(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const nx = clamp(x / Math.max(width, 1), 0, 1);
  const ny = clamp(y / Math.max(height, 1), 0, 1);
  return {
    x: nx * 100,
    y: ny * 100,
    tiltX: (0.5 - ny) * 7,
    tiltY: (nx - 0.5) * 8,
    magnetX: (nx - 0.5) * 5,
    magnetY: (ny - 0.5) * 5,
  };
}
export function panelOffset(
  x: number,
  y: number,
  box: { left: number; top: number; right: number; bottom: number },
  viewport: { width: number; height: number },
) {
  return {
    x: clamp(
      x,
      Math.min(16 - box.left, 0),
      Math.max(viewport.width - 16 - box.right, 0),
    ),
    y: clamp(
      y,
      Math.min(16 - box.top, 0),
      Math.max(viewport.height - 16 - box.bottom, 0),
    ),
  };
}

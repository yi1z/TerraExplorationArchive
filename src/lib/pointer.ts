export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const neutralPointer = {
  x: 50,
  y: 50,
  tiltX: 0,
  tiltY: 0,
  magnetX: 0,
  magnetY: 0,
};
export type PointerResponse = typeof neutralPointer;
export function approachPointer(
  current: PointerResponse,
  target: PointerResponse,
  elapsedMs: number,
) {
  const alpha = 1 - Math.exp(-clamp(elapsedMs, 0, 64) / 90);
  const result = { ...current };
  let settled = true;
  for (const key of Object.keys(result) as (keyof PointerResponse)[]) {
    const value = current[key] + (target[key] - current[key]) * alpha;
    if (Math.abs(target[key] - value) < 0.01) result[key] = target[key];
    else {
      result[key] = value;
      settled = false;
    }
  }
  return { value: result, settled };
}
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

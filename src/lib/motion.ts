export const MOTION = {
  intro: 2.8,
  focus: 1.35,
  trace: 1.4,
  beacon: 2.4,
  tour: 10,
} as const;
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const smoothStep = (value: number) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
// Bound resumed frames; hidden tabs never advance the choreography.
export function advanceMotion(
  elapsed: number,
  delta: number,
  duration: number,
  hidden = false,
) {
  if (hidden || !Number.isFinite(delta) || delta < 0) return elapsed;
  return Math.min(duration, elapsed + Math.min(delta, 0.1));
}
export function terrainRise(elapsed: number, x: number, z: number) {
  const sweep = clamp01((x + 21 + (z + 13) * 0.35) / 53);
  return easeOut((elapsed - sweep * 1.15) / 1.15);
}
export function flightSample(elapsed: number, duration: number) {
  const progress = clamp01(elapsed / duration);
  const ease = smoothStep(progress);
  return { progress, ease, lift: Math.sin(Math.PI * ease) };
}
export function traceVertices(
  points: readonly (readonly number[])[],
  subdivisions = 12,
) {
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < subdivisions; j++) {
      for (const t of [j / subdivisions, (j + 1) / subdivisions]) {
        for (let axis = 0; axis < 3; axis++)
          vertices.push(
            points[i - 1][axis] + (points[i][axis] - points[i - 1][axis]) * t,
          );
      }
    }
  }
  return new Float32Array(vertices);
}

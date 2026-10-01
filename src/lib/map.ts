import { mainland, regions, markerById, regionById } from "../data/geography";
import { entryById } from "../data/archive";
import type { Point } from "../data/types";
export function insidePolygon(x: number, z: number, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i],
      [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}
export interface Tile {
  x: number;
  z: number;
  height: number;
  region: string | null;
  tone: number;
}
export function makeTiles(radius = 0.34): Tile[] {
  const result: Tile[] = [];
  const dx = Math.sqrt(3) * radius;
  const dz = 1.5 * radius;
  for (let row = -25; row < 29; row++)
    for (let col = -38; col < 39; col++) {
      const x = dx * (col + (row % 2) / 2),
        z = dz * row;
      if (!insidePolygon(x, z, mainland)) continue;
      const region = regions.find(
        (r) => !r.special && insidePolygon(x, z, r.polygon),
      );
      const tone = (Math.sin(x * 13.4 + z * 9.7) + 1) * 0.5;
      result.push({
        x,
        z,
        height: (region?.elevation ?? 0.18) + 0.07 * tone,
        region: region?.id ?? null,
        tone,
      });
    }
  return result;
}
export const tiles = makeTiles();
export function mapPoint(id: string | null): Point | null {
  if (!id) return null;
  if (markerById[id]) return markerById[id].point;
  const entry = entryById[id];
  return regionById[entry?.regionId || id]?.center ?? null;
}
export function mapRegionId(id: string | null) {
  if (!id) return null;
  const entry = entryById[id];
  return entry?.kind === "country" ? id : (entry?.regionId ?? null);
}
export function formatIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

import { describe, expect, it } from "vitest";
import {
  captureMapCamera,
  mapCameraFit,
  restoreMapCamera,
} from "../src/lib/camera";
import type { MapCameraContext } from "../src/lib/camera";

const context: MapCameraContext = {
  selected: "yan",
  focusSequence: 3,
  introSequence: 0,
  cameraSequence: 2,
};

describe("atlas camera return memory", () => {
  const snapshot = captureMapCamera(
    context,
    [15, 25, -8],
    [12, 0, -12],
    40,
    20,
  )!;

  it("restores a manually orbited and panned view while fitting a changed viewport", () => {
    const wideFit = mapCameraFit(1440, 900)!;
    const shortFit = mapCameraFit(1280, 720)!;
    const wide = restoreMapCamera(snapshot, context, wideFit)!;
    const short = restoreMapCamera(snapshot, context, shortFit)!;
    expect(wide.position).toEqual([15, 25, -8]);
    expect(wide.target).toEqual([12, 0, -12]);
    expect(short.position).toEqual(wide.position);
    expect(short.target).toEqual(wide.target);
    expect(wide.zoom / wideFit).toBeCloseTo(2);
    expect(short.zoom / shortFit).toBeCloseTo(2);
    expect(short.zoom).toBeLessThan(wide.zoom);
  });

  it.each([
    { selected: "lungmen" },
    { focusSequence: 4 },
    { introSequence: 1 },
    { cameraSequence: 3 },
  ])(
    "lets explicit navigation or a new camera command supersede saved context %o",
    (change) => {
      expect(
        restoreMapCamera(snapshot, { ...context, ...change }, 20),
      ).toBeNull();
    },
  );

  it("does not invent a view on a fresh load or capture a collapsed viewport", () => {
    expect(restoreMapCamera(null, context, 20)).toBeNull();
    for (const invalid of [0, -1, NaN, Infinity]) {
      expect(mapCameraFit(invalid, 900)).toBeNull();
      expect(mapCameraFit(1440, invalid)).toBeNull();
      expect(
        captureMapCamera(context, [1, 2, 3], [0, 0, 0], 20, invalid),
      ).toBeNull();
      expect(restoreMapCamera(snapshot, context, invalid)).toBeNull();
    }
  });

  it("keeps restored zoom inside the actual orbit-control bounds", () => {
    expect(
      restoreMapCamera({ ...snapshot, zoomRatio: 10 }, context, 20)?.zoom,
    ).toBe(90);
    expect(
      restoreMapCamera({ ...snapshot, zoomRatio: 0.1 }, context, 20)?.zoom,
    ).toBe(13);
  });
});

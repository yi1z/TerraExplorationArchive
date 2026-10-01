import { describe, expect, it } from "vitest";
import {
  approachPointer,
  neutralPointer,
  pointerResponse,
} from "../src/lib/pointer";
import { requestedPage } from "../src/lib/pagination";
import { artworkFor } from "../src/components/EntryArtwork";
import { entryById } from "../src/data/archive";

describe("smooth pointer response", () => {
  const target = pointerResponse(100, 0, 100, 100);
  it("enters gradually instead of snapping to the full offset", () => {
    const { value, settled } = approachPointer(neutralPointer, target, 16);
    expect(value.magnetX).toBeGreaterThan(0);
    expect(value.magnetX).toBeLessThan(target.magnetX / 4);
    expect(settled).toBe(false);
  });
  it("converges consistently across display refresh rates", () => {
    const sample = (frames: number) => {
      let value = { ...neutralPointer };
      for (let i = 0; i < frames; i++)
        value = approachPointer(value, target, 300 / frames).value;
      return value;
    };
    expect(sample(18).magnetX).toBeCloseTo(sample(36).magnetX, 8);
    expect(sample(18).tiltX).toBeCloseTo(sample(36).tiltX, 8);
  });
  it("settles exactly at rest and bounds a suspended frame", () => {
    let current = { ...target },
      settled = false;
    for (let i = 0; i < 100; i++)
      ({ value: current, settled } = approachPointer(
        current,
        neutralPointer,
        16,
      ));
    expect(settled).toBe(true);
    expect(current).toEqual(neutralPointer);
    expect(
      approachPointer(neutralPointer, target, 10000).value.magnetX,
    ).toBeLessThan(1.3);
  });
});
describe("catalogue page navigation", () => {
  it.each([
    ["1", 0],
    ["5", 4],
    ["20", 9],
    ["0", 0],
    ["-5", 0],
  ])("bounds page %s", (value, expected) => {
    expect(requestedPage(value, 10)).toBe(expected);
  });
  it.each(["", " ", "1.5", "1e2", "next", "9007199254740992"])(
    "does not navigate on invalid input %s",
    (value) => {
      expect(requestedPage(value, 10)).toBeNull();
    },
  );
  it("handles a shrinking result set", () =>
    expect(requestedPage("100", 1)).toBe(0));
});
it("uses full portraits for early operator cards instead of the avatar", () => {
  for (const id of ["operator-amiya", "operator-silverash"]) {
    expect(artworkFor(entryById[id], false, true)?.url).toContain("portrait");
  }
});

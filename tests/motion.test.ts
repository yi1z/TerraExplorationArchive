import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceMotion,
  flightSample,
  MOTION,
  terrainRise,
  traceVertices,
} from "../src/lib/motion";
import { tiles } from "../src/lib/map";
import { defaultPreferences, useArchiveStore } from "../src/lib/state";

describe("finite motion contracts", () => {
  it("reveals every actual tile from collapsed to its exact final height", () => {
    for (const tile of tiles) {
      expect(terrainRise(0, tile.x, tile.z)).toBe(0);
      expect(terrainRise(MOTION.intro, tile.x, tile.z)).toBe(1);
      let previous = 0;
      for (let t = 0; t <= MOTION.intro; t += 0.1) {
        const current = terrainRise(t, tile.x, tile.z);
        expect(current).toBeGreaterThanOrEqual(previous);
        expect(current).toBeLessThanOrEqual(1);
        previous = current;
      }
    }
  });
  it("sweeps from west to east instead of moving all tiles together", () => {
    expect(terrainRise(0.6, -18, 0)).toBeGreaterThan(terrainRise(0.6, 18, 0));
  });
  it.each([1 / 120, 1 / 60, 1 / 30, 1 / 15])(
    "finishes at the endpoint with a %s second frame budget",
    (delta) => {
      let time = 0;
      for (let frame = 0; frame < 400; frame++)
        time = advanceMotion(time, delta, MOTION.intro);
      expect(time).toBe(MOTION.intro);
    },
  );
  it("does not jump after a background tab or invalid frame", () => {
    expect(advanceMotion(0.5, 100, MOTION.intro)).toBe(0.6);
    expect(advanceMotion(0.5, 100, MOTION.intro, true)).toBe(0.5);
    for (const delta of [NaN, Infinity, -1])
      expect(advanceMotion(0.5, delta, MOTION.intro)).toBe(0.5);
  });
  it("settles camera paths with no residual lift or endpoint overshoot", () => {
    expect(flightSample(0, MOTION.focus)).toEqual({
      progress: 0,
      ease: 0,
      lift: 0,
    });
    const end = flightSample(100, MOTION.focus);
    expect(end.progress).toBe(1);
    expect(end.ease).toBe(1);
    expect(end.lift).toBeCloseTo(0);
    expect(flightSample(0.001, MOTION.focus).ease).toBeLessThan(0.000001);
    const middle = flightSample(MOTION.focus / 2, MOTION.focus);
    expect(middle.ease).toBeCloseTo(0.5);
    expect(middle.lift).toBeCloseTo(1);
  });
  it("produces paired line segments without gaps and preserves the endpoints", () => {
    const points = [
      [0, 1, 0],
      [2, 3, 1],
      [4, 1, 2],
    ];
    const vertices = traceVertices(points);
    expect(vertices.length % 6).toBe(0);
    expect([...vertices.slice(0, 3)]).toEqual(points[0]);
    expect([...vertices.slice(-3)]).toEqual(points[2]);
    for (let i = 6; i < vertices.length; i += 6)
      expect([...vertices.slice(i, i + 3)]).toEqual([
        ...vertices.slice(i - 3, i),
      ]);
    expect(traceVertices([]).length).toBe(0);
  });
});

describe("motion interruption and replay", () => {
  const state = () => useArchiveStore.getState();
  beforeEach(() => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    useArchiveStore.setState({
      ...useArchiveStore.getInitialState(),
      preferences: { ...defaultPreferences, favorites: [], visited: [] },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("replays from overview, ends the tour and preserves saved reading state", () => {
    state().favorite("yan");
    state().startTour();
    state().replayIntro();
    expect(state().selected).toBeNull();
    expect(state().introPlaying).toBe(true);
    expect(state().tourPlaying).toBe(false);
    expect(state().tourIndex).toBe(-1);
    expect(state().preferences.favorites).toEqual(["yan"]);
    expect(state().preferences.visited).toEqual(["ursus"]);
    const sequence = state().introSequence;
    state().replayIntro();
    expect(state().introSequence).toBe(sequence + 1);
  });
  it.each(["select", "close", "camera", "view", "route", "tour"])(
    "yields immediately to %s without a stale intro",
    (action) => {
      state().replayIntro();
      if (action === "select") state().select("yan");
      if (action === "close") state().close();
      if (action === "camera") state().camera("in");
      if (action === "view") state().setView("archive");
      if (action === "route") state().navigate("#/atlas?entry=lungmen");
      if (action === "tour") state().startTour();
      expect(state().introPlaying).toBe(false);
    },
  );
  it("makes skip idempotent and disabling animation cancels an active intro", () => {
    state().replayIntro();
    state().finishIntro();
    state().finishIntro();
    expect(state().introPlaying).toBe(false);
    state().replayIntro();
    state().togglePreference("reducedMotion");
    expect(state().introPlaying).toBe(false);
    state().replayIntro();
    expect(state().introPlaying).toBe(false);
  });
});

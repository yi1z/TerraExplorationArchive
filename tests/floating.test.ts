import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pointerResponse, panelOffset } from "../src/lib/pointer";
import { gameAssets, assetFor } from "../src/data/assets";
import { entryById, entries } from "../src/data/archive";
import { useArchiveStore, defaultPreferences } from "../src/lib/state";
describe("floating pointer and window boundaries", () => {
  it("keeps centered controls still and bounds corner effects", () => {
    expect(pointerResponse(50, 25, 100, 50)).toEqual({
      x: 50,
      y: 50,
      tiltX: 0,
      tiltY: 0,
      magnetX: 0,
      magnetY: 0,
    });
    for (const [x, y] of [
      [-100, -100],
      [1000, 1000],
      [0, 1000],
      [1000, 0],
    ]) {
      const p = pointerResponse(x, y, 100, 50);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(Math.abs(p.tiltX)).toBeLessThanOrEqual(3.5);
      expect(Math.abs(p.tiltY)).toBeLessThanOrEqual(4);
      expect(Math.abs(p.magnetX)).toBeLessThanOrEqual(2.5);
      expect(Math.abs(p.magnetY)).toBeLessThanOrEqual(2.5);
    }
  });
  it("handles temporarily collapsed elements without invalid CSS values", () => {
    expect(
      Object.values(pointerResponse(20, 20, 0, 0)).every(Number.isFinite),
    ).toBe(true);
  });
  it("keeps the whole dossier reachable even after extreme drags", () => {
    const box = { left: 890, right: 1250, top: 166, bottom: 610 },
      viewport = { width: 1280, height: 720 };
    for (const [x, y] of [
      [-10000, -10000],
      [10000, 10000],
      [-400, 42],
    ]) {
      const p = panelOffset(x, y, box, viewport);
      expect(box.left + p.x).toBeGreaterThanOrEqual(16);
      expect(box.right + p.x).toBeLessThanOrEqual(viewport.width - 16);
      expect(box.top + p.y).toBeGreaterThanOrEqual(16);
      expect(box.bottom + p.y).toBeLessThanOrEqual(viewport.height - 16);
    }
    expect(panelOffset(-245, 42, box, viewport)).toEqual({ x: -245, y: 42 });
  });
});
describe("game art provenance and ownership", () => {
  it("ships every recorded file intact with a bounded PNG and traceable source", () => {
    const ids = new Set<string>();
    for (const a of gameAssets) {
      expect(entryById[a.id]).toBeDefined();
      const key = a.id + ":" + a.kind;
      expect(ids.has(key)).toBe(false);
      ids.add(key);
      expect(a.path).toMatch(/^assets\/game\/[a-z-]+-(emblem|landscape)\.png$/);
      expect(new URL(a.url).hostname).toBe("media.prts.wiki");
      expect(new URL(a.filePage).protocol).toBe("https:");
      expect(a.credit).toContain("鹰角");
      expect(a.license).toContain("非开放许可");
      const buffer = readFileSync(
        new URL("../public/" + a.path, import.meta.url),
      );
      expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(buffer.length).toBe(a.bytes);
      expect(buffer.length).toBeLessThan(5000000);
      expect(createHash("sha256").update(buffer).digest("hex")).toBe(a.sha256);
    }
    expect(
      JSON.parse(
        readFileSync(
          new URL("../public/assets/game/sources.json", import.meta.url),
          "utf8",
        ),
      ),
    ).toEqual(gameAssets);
  });
  it("supplies all six faction insignia and keeps missing emblems neutral", () => {
    for (const e of entries.filter((e) => e.kind === "faction"))
      expect(assetFor(e.id, "emblem")?.id).toBe(e.id);
    expect(gameAssets.filter((a) => a.kind === "emblem")).toHaveLength(25);
    expect(gameAssets.filter((a) => a.kind === "landscape")).toHaveLength(12);
    expect(assetFor("kazdel", "emblem")).toBeUndefined();
    expect(assetFor("durin", "emblem")).toBeUndefined();
    expect(assetFor("not-a-country", "emblem", true)).toBeUndefined();
  });
  it("never silently substitutes a parent's emblem, but allows labeled scenery", () => {
    expect(assetFor("chernobog", "emblem")).toBeUndefined();
    expect(assetFor("chernobog", "landscape", true)?.id).toBe("ursus");
    expect(assetFor("siesta", "emblem")?.id).toBe("siesta");
  });
});
describe("hover previews are transient", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    useArchiveStore.setState({
      ...useArchiveStore.getInitialState(),
      preferences: { ...defaultPreferences, favorites: [], visited: [] },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("previews known entries without reading, navigating or persisting", () => {
    const initial = useArchiveStore.getState();
    initial.setPreviewEntry("yan");
    const current = useArchiveStore.getState();
    expect(current.previewEntry).toBe("yan");
    expect(current.selected).toBe(initial.selected);
    expect(current.focusSequence).toBe(initial.focusSequence);
    expect(current.preferences.visited).toEqual([]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    current.setPreviewEntry("__proto__");
    expect(useArchiveStore.getState().previewEntry).toBe("yan");
  });
  it("selection promotes a preview into a real reading visit", () => {
    useArchiveStore.getState().setPreviewEntry("yan");
    useArchiveStore.getState().select("ursus");
    expect(useArchiveStore.getState().previewEntry).toBe("ursus");
    expect(useArchiveStore.getState().preferences.visited).toEqual(["ursus"]);
  });
});

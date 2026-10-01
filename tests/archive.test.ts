import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  entries,
  entryById,
  countryEntries,
  events,
  sources,
  searchEntries,
  visibleSections,
  visibleEvents,
} from "../src/data/archive";
import { regions, markers, tour } from "../src/data/geography";
import {
  insidePolygon,
  makeTiles,
  mapPoint,
  mapRegionId,
  formatIndex,
} from "../src/lib/map";
import {
  readPreferences,
  readRoute,
  defaultPreferences,
  defaultLayers,
  useArchiveStore,
  STORAGE_KEY,
} from "../src/lib/state";

describe("curated archive contracts", () => {
  it("contains the complete first-edition inventory with unique stable identifiers", () => {
    expect(entries).toHaveLength(103);
    expect(countryEntries).toHaveLength(19);
    expect(entries.filter((e) => e.kind === "city")).toHaveLength(8);
    expect(entries.filter((e) => e.kind === "faction")).toHaveLength(6);
    expect(entries.filter((e) => e.kind === "concept")).toHaveLength(6);
    expect(entries.filter((e) => e.kind === "operator")).toHaveLength(24);
    expect(entries.filter((e) => e.kind === "enemy")).toHaveLength(16);
    expect(entries.filter((e) => e.kind === "item")).toHaveLength(24);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const e of entries) expect(e.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
  it("resolves every related entry, geography reference and source", () => {
    for (const e of entries) {
      expect(e.summary.length).toBeGreaterThan(10);
      expect(e.sections.length).toBeGreaterThan(0);
      expect(e.sources.length).toBeGreaterThan(0);
      for (const id of e.related)
        expect(entryById[id], e.id + " → " + id).toBeDefined();
      for (const id of e.sources)
        expect(sources[id], e.id + " → " + id).toBeDefined();
      if (e.regionId)
        expect(regions.some((r) => r.id === e.regionId)).toBe(true);
    }
    for (const source of Object.values(sources)) {
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(["prts.wiki", "ak.hypergryph.com", "www.bilibili.com"]).toContain(
        url.hostname,
      );
      expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("keeps city location separate from administrative ownership", () => {
    expect(entryById.siesta.regionId).toBeUndefined();
    expect(mapPoint("siesta")).toEqual([-9.2, 10.2]);
    expect(mapRegionId("siesta")).toBeNull();
    expect(mapRegionId("lungmen")).toBe("yan");
  });
  it("has six valid tour stops and eight ordered, sourced events", () => {
    expect(tour).toHaveLength(6);
    tour.forEach((id) => expect(mapPoint(id)).not.toBeNull());
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.year)).toEqual(
      events.map((e) => e.year).sort((a, b) => a - b),
    );
    for (const event of events) {
      expect(sources[event.source]).toBeDefined();
      event.related.forEach((id) => expect(entryById[id]).toBeDefined());
    }
  });
  it("does not expose hidden story sections or events in the public view", () => {
    expect(
      visibleSections(entryById.babel, false).every((s) => !s.spoiler),
    ).toBe(true);
    expect(visibleSections(entryById.babel, true).some((s) => s.spoiler)).toBe(
      true,
    );
    expect(visibleEvents(false)).toHaveLength(4);
    expect(visibleEvents(true)).toHaveLength(8);
    expect(searchEntries("特蕾西娅", false)).toEqual([]);
    expect(searchEntries("特蕾西娅", true).map((e) => e.id)).toContain("babel");
  });
  it.each([
    ["龙门", "lungmen"],
    ["Lungmen", "lungmen"],
    ["ＬＵＮＧＭＥＮ", "lungmen"],
    [" 大骑士领 ", "kawalerielki"],
    ["aegir", "aegir"],
    ["bolivar", "bolivar"],
    ["大炎", "yan"],
  ])("finds %s by Chinese, English or alias", (query, id) => {
    expect(searchEntries(query, false).map((e) => e.id)).toContain(id);
  });
  it("combines type filters and handles empty or unmatched searches", () => {
    expect(searchEntries("", false, "city")).toHaveLength(8);
    expect(searchEntries("", false, "world")).toHaveLength(39);
    expect(searchEntries("", false, "operator")).toHaveLength(24);
    expect(searchEntries("", false, "enemy")).toHaveLength(16);
    expect(searchEntries("", false, "item")).toHaveLength(24);
    expect(
      searchEntries("龙门", false, "concept").every(
        (e) => e.kind === "concept",
      ),
    ).toBe(true);
    expect(searchEntries("no-such-archive-123456", false)).toEqual([]);
    expect(searchEntries("  ", false)).toHaveLength(entries.length);
  });
});
describe("bounded schematic geography", () => {
  it("generates deterministic terrain with a bounded tile count", () => {
    const a = makeTiles(),
      b = makeTiles();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1000);
    expect(a.length).toBeLessThan(4000);
    expect(a.every((t) => Number.isFinite(t.height) && t.height > 0)).toBe(
      true,
    );
    for (const r of regions.filter((r) => !r.special))
      expect(
        a.some((t) => t.region === r.id),
        r.id,
      ).toBe(true);
  });
  it("places the country labels inside their polygons", () => {
    for (const r of regions.filter((r) => !r.special))
      expect(insidePolygon(...r.center, r.polygon), r.id).toBe(true);
  });
  it("uses only explicit markers and special entrances", () => {
    expect(regions.filter((r) => r.special).map((r) => r.id)).toEqual([
      "aegir",
      "durin",
    ]);
    for (const r of regions.filter((r) => r.special))
      expect(r.polygon).toEqual([]);
    expect(markers).toHaveLength(8);
    expect(mapPoint(null)).toBeNull();
    expect(mapPoint("unknown")).toBeNull();
    expect(mapPoint("__proto__")).toBeNull();
    expect(mapRegionId("constructor")).toBeNull();
    expect(formatIndex(0)).toBe("01");
  });
});
describe("untrusted persisted state and URL input", () => {
  it.each([
    null,
    "",
    "{broken",
    "null",
    "[]",
    '{"version":2}',
    "x".repeat(50001),
  ])("safely resets malformed, missing or obsolete preferences", (raw) => {
    expect(readPreferences(raw)).toEqual(defaultPreferences);
  });
  it("whitelists, deduplicates and bounds saved IDs and boolean types", () => {
    const parsed = readPreferences(
      JSON.stringify({
        version: 1,
        favorites: ["yan", "yan", "bad", "__proto__", 42, "constructor"],
        visited: entries.map((e) => e.id).concat(entries.map((e) => e.id)),
        spoilers: "true",
        sound: 1,
        reducedMotion: true,
      }),
    );
    expect(parsed.favorites).toEqual(["yan"]);
    expect(parsed.visited).toHaveLength(entries.length);
    expect(parsed.spoilers).toBe(false);
    expect(parsed.sound).toBe(false);
    expect(parsed.reducedMotion).toBe(true);
  });
  it("restores a shareable selection and explicit layers", () => {
    expect(readRoute("#/atlas?entry=lungmen&layers=cities,relations")).toEqual({
      view: "atlas",
      dossierOpen: false,
      dossierSection: "overview",
      selected: "lungmen",
      layers: { countries: false, cities: true, relations: true },
      kind: "all",
      facet: "all",
      releaseFilter: "available",
      query: "",
      searchScope: "all",
      searchPage: 0,
      invalid: false,
    });
    expect(readRoute("#/favorites")).toMatchObject({
      view: "search",
      searchScope: "favorites",
    });
    expect(readRoute("#/atlas?layers=").layers).toEqual({
      countries: false,
      cities: false,
      relations: false,
    });
  });
  it.each(["missing", "__proto__", "constructor", "toString"])(
    "rejects the unknown archive ID %s",
    (id) => {
      expect(readRoute("#/atlas?entry=" + id)).toMatchObject({
        selected: null,
        invalid: true,
      });
    },
  );
  it("ignores unknown views and layer tokens", () => {
    expect(readRoute("#/bad").view).toBe("home");
    expect(readRoute("#/atlas?layers=bad,cities").layers).toEqual({
      countries: false,
      cities: true,
      relations: false,
    });
    expect(readRoute("").layers).toEqual(defaultLayers);
  });
});
describe("interaction owner", () => {
  let saved: Map<string, string>;
  const s = () => useArchiveStore.getState();
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    });
    const location = { hash: "" };
    vi.stubGlobal("window", {
      location,
      history: {
        pushState: vi.fn((_data: unknown, _unused: string, url: string) => {
          location.hash = url;
        }),
      },
    });
    useArchiveStore.setState({
      ...useArchiveStore.getInitialState(),
      preferences: { ...defaultPreferences, favorites: [], visited: [] },
      layers: { ...defaultLayers },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("opens entries, records each visit once, synchronizes the route and closes cleanly", () => {
    s().select("yan");
    s().select("yan");
    expect(s().selected).toBe("yan");
    expect(s().preferences.visited).toEqual(["yan"]);
    expect(window.location.hash).toContain("entry=yan");
    s().close();
    expect(s().selected).toBeNull();
    expect(s().activeEvent).toBeNull();
    expect(window.location.hash).toBe("#/atlas");
  });
  it("does not let invalid input mutate selection or favorites", () => {
    s().select("constructor");
    s().favorite("__proto__");
    expect(s().selected).toBeNull();
    expect(s().preferences.favorites).toEqual([]);
  });
  it("persists reversible favorites and preserves them when footprints reset", () => {
    s().favorite("yan");
    s().select("yan");
    expect(readPreferences(saved.get(STORAGE_KEY) ?? null).favorites).toEqual([
      "yan",
    ]);
    s().resetProgress();
    expect(s().preferences.visited).toEqual([]);
    expect(s().preferences.favorites).toEqual(["yan"]);
    s().favorite("yan");
    expect(s().preferences.favorites).toEqual([]);
  });
  it("remains usable when storage denies writes", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("denied");
      },
    });
    s().favorite("lungmen");
    s().select("lungmen");
    expect(s().storageAvailable).toBe(false);
    expect(s().selected).toBe("lungmen");
    expect(s().preferences.favorites).toEqual(["lungmen"]);
  });
  it("keeps comparisons limited to two countries and supports repeated removal", () => {
    s().toggleCompare("lungmen");
    s().toggleCompare("yan");
    s().toggleCompare("ursus");
    s().toggleCompare("sargon");
    expect(s().compare).toEqual(["yan", "ursus"]);
    expect(s().notice).toContain("最多");
    s().toggleCompare("yan");
    s().toggleCompare("sargon");
    expect(s().compare).toEqual(["ursus", "sargon"]);
  });
  it("runs a bounded tour and stops it on an unrelated selection", () => {
    s().startTour();
    expect(s().tourPlaying).toBe(true);
    expect(s().selected).toBe(tour[0]);
    s().tourStep(-1);
    expect(s().tourIndex).toBe(0);
    for (let i = 0; i < 10; i++) s().tourStep(1);
    expect(s().tourIndex).toBe(5);
    expect(s().selected).toBe("siesta");
    s().select("columbia");
    expect(s().tourPlaying).toBe(false);
    expect(s().tourIndex).toBe(-1);
  });
  it("pauses camera interaction, resumes and fully exits on navigation", () => {
    s().startTour();
    s().camera("in");
    expect(s().tourPlaying).toBe(false);
    s().resumeTour();
    expect(s().tourPlaying).toBe(true);
    s().setView("archive");
    expect(s().tourPlaying).toBe(false);
    expect(s().tourIndex).toBe(-1);
  });
  it("enforces spoilers even when events are requested directly", () => {
    s().setEvent("great-silence");
    expect(s().activeEvent).toBeNull();
    s().togglePreference("spoilers");
    s().setEvent("great-silence");
    expect(s().activeEvent).toBe("great-silence");
    expect(s().selected).toBe("iberia");
    s().togglePreference("spoilers");
    expect(s().activeEvent).toBeNull();
  });
  it("restores history and resets transient guide state", () => {
    s().startTour();
    s().navigate("#/atlas?entry=lungmen&layers=relations");
    expect(s().selected).toBe("lungmen");
    expect(s().tourPlaying).toBe(false);
    expect(s().tourIndex).toBe(-1);
    expect(s().layers).toEqual({
      countries: false,
      cities: false,
      relations: true,
    });
    s().navigate("#/atlas?entry=bad");
    expect(s().selected).toBeNull();
    expect(s().notice).toBeTruthy();
  });
});

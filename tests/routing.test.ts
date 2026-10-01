import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entries, entryById } from "../src/data/archive";
import {
  defaultLayers,
  defaultPreferences,
  readPreferences,
  readRoute,
  STORAGE_KEY,
  useArchiveStore,
} from "../src/lib/state";

const s = () => useArchiveStore.getState();
const newIds = [
  "operator-amiya",
  "enemy-originium-slug",
  "item-originite-prime",
];

describe("home and archive links", () => {
  it("opens the home page for a missing or unknown route", () => {
    for (const hash of ["", "#", "#/", "#/missing"])
      expect(readRoute(hash)).toMatchObject({
        view: "home",
        selected: null,
        kind: "all",
        facet: "all",
        query: "",
      });
  });

  it.each(newIds)("restores an actual catalogue record %s", (id) => {
    expect(entryById[id]).toBeDefined();
    expect(
      readRoute("#/archive?entry=" + id + "&kind=" + entryById[id].kind),
    ).toMatchObject({
      view: "archive",
      selected: id,
      kind: entryById[id].kind,
      invalid: false,
    });
    expect(readRoute("#/atlas?entry=" + id)).toMatchObject({
      view: "archive",
      selected: id,
      invalid: false,
    });
  });

  it("validates category filters and bounds decoded search input", () => {
    for (const kind of [
      "all",
      "world",
      "operator",
      "enemy",
      "item",
      "country",
      "city",
      "faction",
      "concept",
    ])
      expect(readRoute("#/archive?kind=" + kind).kind).toBe(kind);
    for (const kind of ["__proto__", "constructor", "invalid"])
      expect(readRoute("#/archive?kind=" + kind).kind).toBe("all");
    expect(
      readRoute("#/archive?q=" + encodeURIComponent("阿米娅")),
    ).toMatchObject({ query: "阿米娅" });
    expect(readRoute("#/archive?q=" + "a".repeat(200)).query).toHaveLength(160);
  });

  it("preserves pending full-library IDs, typed facets and release visibility", () => {
    expect(
      readRoute(
        "#/archive?entry=prts-story-900001&kind=story&filter=chapter%3A%E4%B8%BB%E7%BA%BF&status=preview",
      ),
    ).toMatchObject({
      selected: "prts-story-900001",
      kind: "story",
      facet: "chapter:主线",
      releaseFilter: "preview",
      invalid: false,
    });
    expect(
      readRoute(
        "#/archive?kind=operator&filter=profession%3A%E6%9C%AF%E5%B8%88&status=all",
      ),
    ).toMatchObject({ facet: "profession:术师", releaseFilter: "all" });
    expect(
      readRoute("#/archive?kind=operator&filter=branch%3A%E5%B7%A5%E5%8C%A0")
        .facet,
    ).toBe("branch:工匠");
    expect(readRoute("#/archive?status=constructor").releaseFilter).toBe(
      "available",
    );
    expect(readRoute("#/atlas?entry=prts-item-900001").view).toBe("archive");
  });

  it("reads large migrated ID lists without the old 50 KB data-loss cutoff", () => {
    const ids = Array.from({ length: 6000 }, (_, i) => `prts-item-${i}`);
    const raw = JSON.stringify({
      ...defaultPreferences,
      favorites: ids,
      visited: ids,
    });
    expect(raw.length).toBeGreaterThan(50000);
    expect(readPreferences(raw).favorites).toEqual(ids);
    expect(readPreferences(raw).visited).toEqual(ids);
  });

  it.each([
    ["operator", "术师"],
    ["enemy", "领袖"],
    ["item", "活动道具"],
    ["world", "国家与文明"],
    ["country", "国家与文明"],
    ["all", "术师"],
    ["all", "城市"],
  ])("restores a valid %s facet %s in catalogue routes", (kind, facet) => {
    for (const view of ["archive", "favorites"])
      expect(
        readRoute(`#/${view}?kind=${kind}&filter=${encodeURIComponent(facet)}`),
      ).toMatchObject({
        view: "search",
        kind,
        facet,
        searchScope: view === "favorites" ? "favorites" : "all",
      });
  });

  it.each([
    ["operator", "领袖"],
    ["enemy", "术师"],
    ["item", "国家与文明"],
    ["world", "活动道具"],
    ["country", "城市"],
    ["all", "constructor"],
    ["all", "__proto__"],
  ])("rejects a facet outside the %s category: %s", (kind, facet) => {
    expect(
      readRoute(`#/archive?kind=${kind}&filter=${encodeURIComponent(facet)}`)
        .facet,
    ).toBe("all");
  });
});

describe("database and atlas navigation", () => {
  let routes: string[];
  let cursor: number;
  let saved: Map<string, string>;
  const travel = (delta: number) => {
    cursor += delta;
    window.location.hash = routes[cursor];
    s().navigate(routes[cursor]);
  };

  beforeEach(() => {
    routes = ["#/archive"];
    cursor = 0;
    saved = new Map();
    const location = { hash: routes[0] };
    vi.stubGlobal("window", {
      location,
      history: {
        pushState: vi.fn((_state: unknown, _title: string, hash: string) => {
          routes = routes.slice(0, cursor + 1);
          routes.push(hash);
          cursor++;
          location.hash = hash;
        }),
        replaceState: vi.fn((_state: unknown, _title: string, hash: string) => {
          routes[cursor] = hash;
          location.hash = hash;
        }),
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => saved.set(key, value)),
    });
    useArchiveStore.setState({
      ...useArchiveStore.getInitialState(),
      view: "archive",
      selected: null,
      atlasSelected: null,
      query: "",
      kind: "all",
      facet: "all",
      releaseFilter: "available",
      preferences: { ...defaultPreferences, favorites: [], visited: [] },
      layers: { ...defaultLayers },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens every kind in the database without forcing the map", () => {
    for (const id of [
      "yan",
      "lungmen",
      "rhodes-island",
      "originium",
      ...newIds,
    ]) {
      s().openEntry(id);
      expect(s().view).toBe("archive");
      expect(s().selected).toBe(id);
      expect(readRoute(window.location.hash).selected).toBe(id);
    }
    s().openEntry(newIds[0]);
    expect(
      s().preferences.visited.filter((id) => id === newIds[0]),
    ).toHaveLength(1);
  });

  it("keeps legacy map selection while routing new records into dossiers", () => {
    s().select("lungmen");
    expect(s()).toMatchObject({
      view: "atlas",
      selected: "lungmen",
      atlasSelected: "lungmen",
    });
    for (const id of newIds) {
      s().select(id);
      expect(s()).toMatchObject({
        view: "archive",
        selected: id,
        atlasSelected: "lungmen",
      });
    }
  });

  it("returns from a dossier to the same region and layers without another map command or visit", () => {
    s().openAtlas("yan");
    s().toggleLayer("relations");
    const focus = s().focusSequence;
    const camera = s().cameraSequence;
    s().openEntry("operator-amiya");
    const visits = [...s().preferences.visited];
    const writes = vi.mocked(localStorage.setItem).mock.calls.length;
    s().returnToAtlas();
    expect(s()).toMatchObject({
      view: "atlas",
      selected: "yan",
      atlasSelected: "yan",
      focusSequence: focus,
      cameraSequence: camera,
    });
    expect(s().layers.relations).toBe(true);
    expect(s().preferences.visited).toEqual(visits);
    expect(localStorage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("opens an explicit atlas overview and ignores invalid or non-geographic map targets", () => {
    s().openAtlas("lungmen");
    for (const id of ["missing", "__proto__", ...newIds]) s().openAtlas(id);
    expect(s().selected).toBe("lungmen");
    s().openAtlas();
    expect(s()).toMatchObject({
      view: "atlas",
      selected: null,
      atlasSelected: null,
    });
    expect(s().preferences.visited).toEqual(["lungmen"]);
  });

  it("restores search and category through browser back and forward without per-keystroke history", () => {
    s().setKind("operator");
    s().setFacet("术师");
    s().setQuery("阿");
    s().setQuery("阿米娅");
    expect(routes).toHaveLength(3);
    expect(
      new URLSearchParams(window.location.hash.split("?")[1]).get("filter"),
    ).toBe("术师");
    s().openEntry("operator-amiya");
    travel(-1);
    expect(s()).toMatchObject({
      view: "search",
      selected: null,
      kind: "operator",
      facet: "术师",
      query: "阿米娅",
    });
    travel(1);
    expect(s()).toMatchObject({
      view: "archive",
      selected: "operator-amiya",
      kind: "operator",
      facet: "术师",
      query: "阿米娅",
    });
    s().openAtlas("yan");
    expect(s()).toMatchObject({
      kind: "operator",
      facet: "术师",
      query: "阿米娅",
    });
    expect(window.location.hash).not.toContain("filter=");
    travel(-1);
    expect(s()).toMatchObject({
      view: "archive",
      selected: "operator-amiya",
      kind: "operator",
      facet: "术师",
      query: "阿米娅",
    });
    travel(-2);
    expect(s()).toMatchObject({ kind: "operator", facet: "all", query: "" });
    travel(1);
    expect(s()).toMatchObject({
      kind: "operator",
      facet: "术师",
      query: "阿米娅",
    });
  });

  it("keeps facet across dossiers and atlas return, and clears only when the category changes", () => {
    s().setKind("operator");
    s().setFacet("术师");
    s().setKind("operator");
    expect(s().facet).toBe("术师");
    s().openAtlas("yan");
    s().openEntry("operator-amiya");
    expect(readRoute(window.location.hash).facet).toBe("术师");
    s().returnToAtlas();
    expect(s().facet).toBe("术师");
    s().setView("favorites");
    expect(readRoute(window.location.hash)).toMatchObject({
      view: "search",
      searchScope: "favorites",
      kind: "operator",
      facet: "术师",
    });
    s().setKind("enemy");
    expect(s().facet).toBe("all");
    expect(window.location.hash).not.toContain("filter=");
    s().setFacet("术师");
    expect(s().facet).toBe("all");
    s().setFacet("领袖");
    expect(readRoute(window.location.hash).facet).toBe("领袖");
    const persisted = JSON.parse(saved.get(STORAGE_KEY)!);
    expect(persisted).not.toHaveProperty("facet");
  });

  it("keeps previews transient across all data types", () => {
    const before = s();
    for (const entry of entries) s().setPreviewEntry(entry.id);
    expect(s().selected).toBe(before.selected);
    expect(s().view).toBe(before.view);
    expect(s().atlasSelected).toBe(before.atlasSelected);
    expect(s().preferences.visited).toEqual([]);
    expect(window.location.hash).toBe("#/archive");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("keeps release visibility through history and atlas round trips", () => {
    s().setReleaseFilter("preview");
    expect(window.location.hash).toContain("status=preview");
    s().openEntry("prts-story-900001");
    expect(s().selected).toBe("prts-story-900001");
    s().openAtlas("yan");
    expect(s().releaseFilter).toBe("preview");
    travel(-1);
    expect(s().releaseFilter).toBe("preview");
    s().setReleaseFilter("all");
    travel(-1);
    expect(s().releaseFilter).toBe("preview");
  });

  it("preserves old favourites alongside the three new data types without migration", () => {
    for (const id of ["yan", "lungmen", ...newIds]) s().favorite(id);
    const restored = readPreferences(saved.get(STORAGE_KEY) ?? null);
    expect(restored.version).toBe(1);
    expect(restored.favorites).toEqual(["yan", "lungmen", ...newIds]);
  });

  it("moves revisited records to the newest position without duplicating them", () => {
    s().select("yan");
    s().openEntry("operator-amiya");
    s().select("lungmen");
    s().openEntry("operator-amiya");
    expect(s().preferences.visited).toEqual([
      "yan",
      "lungmen",
      "operator-amiya",
    ]);
    s().select("yan");
    expect(s().preferences.visited).toEqual([
      "lungmen",
      "operator-amiya",
      "yan",
    ]);
    expect(readPreferences(saved.get(STORAGE_KEY) ?? null).visited).toEqual(
      s().preferences.visited,
    );
  });

  it("preserves camera context on history return and duplicate browser route events", () => {
    s().openAtlas("yan");
    const focus = s().focusSequence;
    s().openEntry("operator-amiya");
    s().navigate("#/atlas?entry=yan");
    s().navigate("#/atlas?entry=yan");
    expect(s().focusSequence).toBe(focus);
    s().navigate("#/atlas?entry=lungmen");
    expect(s().focusSequence).toBe(focus + 1);
    s().select("lungmen");
    expect(s().focusSequence).toBe(focus + 2);
  });

  it("stops an active tour when a dossier opens and validates unknown input", () => {
    s().startTour();
    s().openEntry("enemy-originium-slug");
    expect(s()).toMatchObject({
      view: "archive",
      tourPlaying: false,
      tourIndex: -1,
      introPlaying: false,
    });
    s().openEntry("constructor");
    expect(s().selected).toBe("enemy-originium-slug");
    s().setKind("constructor");
    expect(s().kind).toBe("all");
  });

  it("opens standalone search, preserving context unless an explicit category is requested", () => {
    s().openSearch("operator", "recent");
    s().setFacet("术师");
    s().setQuery("阿米娅");
    s().setSearchPage(3);
    const before = s().searchFocusSequence;
    s().openEntry("operator-amiya");
    s().returnToSearch();
    expect(s()).toMatchObject({
      view: "search",
      selected: null,
      query: "阿米娅",
      kind: "operator",
      facet: "术师",
      searchScope: "recent",
      searchPage: 3,
      searchFocusSequence: before,
    });
    s().openSearch();
    expect(s().searchFocusSequence).toBe(before + 1);
    expect(s().searchPage).toBe(3);
    s().openSearch("enemy");
    expect(s()).toMatchObject({
      kind: "enemy",
      facet: "all",
      query: "",
      searchScope: "all",
      searchPage: 0,
    });
  });

  it("serializes one-based pages and restores them through history", () => {
    s().openSearch("operator");
    s().setSearchPage(4);
    const searchHash = window.location.hash;
    expect(searchHash).toBe("#/search?kind=operator&page=5");
    s().openEntry("operator-amiya");
    travel(-1);
    expect(s()).toMatchObject({ view: "search", searchPage: 4 });
    s().setSearchScope("favorites");
    expect(s().searchPage).toBe(0);
    expect(window.location.hash).toContain("scope=favorites");
    s().setSearchPage(6);
    const count = routes.length;
    s().setSearchPage(1, true);
    expect(routes).toHaveLength(count);
    expect(window.location.hash).toContain("page=2");
  });

  it("normalizes old favorites and invalid search pages without adding history", () => {
    s().navigate("#/favorites?kind=operator&page=1.5");
    expect(s()).toMatchObject({
      view: "search",
      searchScope: "favorites",
      searchPage: 0,
    });
    expect(window.location.hash).toBe("#/search?kind=operator&scope=favorites");
    expect(routes).toHaveLength(1);
    s().setView("home");
    expect(window.location.hash).toBe("#/home");
    s().openEntry("operator-amiya");
    s().returnToSearch();
    expect(s().view).toBe("search");
  });
});

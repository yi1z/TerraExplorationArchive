import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  readRoute,
  useArchiveStore,
  defaultPreferences,
} from "../src/lib/state";
import {
  dossierSections,
  readDossierSection,
  sectionForRecord,
} from "../src/lib/dossier";
import { visualProfileFor } from "../src/data/visual-profiles";
import DossierFrame from "../src/components/DossierFrame";

const store = () => useArchiveStore.getState();
describe("inline reading route compatibility", () => {
  it("keeps legacy entry URLs on the main stage and bounds reading sections", () => {
    expect(readRoute("#/archive?entry=operator-amiya").dossierOpen).toBe(false);
    for (const section of dossierSections) {
      expect(
        readRoute(
          `#/archive?entry=operator-amiya&view=dossier&section=${section}`,
        ),
      ).toMatchObject({
        view: "archive",
        selected: "operator-amiya",
        dossierOpen: true,
        dossierSection: section,
      });
    }
    for (const section of ["constructor", "__proto__", "unknown", null])
      expect(readDossierSection(section)).toBe("overview");
    for (const route of [
      "#/archive?view=dossier",
      "#/archive?entry=bad&view=dossier",
      "#/atlas?entry=yan&view=dossier",
      "#/favorites?entry=yan&view=dossier",
    ])
      expect(readRoute(route).dossierOpen).toBe(false);
  });
  it("maps full-library and curated technical sections without blank panels", () => {
    expect(sectionForRecord("data", true)).toBe("complete");
    expect(sectionForRecord("complete", false)).toBe("data");
    expect(sectionForRecord("details", false)).toBe("data");
    expect(sectionForRecord("gallery", false)).toBe("gallery");
  });
});

describe("reading history and interruption", () => {
  let history: { hash: string; state: unknown }[];
  let cursor: number;
  const travel = (delta: number) => {
    cursor += delta;
    window.location.hash = history[cursor].hash;
    Object.defineProperty(window.history, "state", {
      value: history[cursor].state,
      writable: true,
      configurable: true,
    });
    store().navigate(history[cursor].hash);
  };
  beforeEach(() => {
    history = [{ hash: "#/archive", state: null }];
    cursor = 0;
    vi.stubGlobal("window", {
      location: { hash: history[0].hash },
      history: {
        state: null,
        pushState: (state: unknown, _title: string, hash: string) => {
          history = history.slice(0, cursor + 1);
          history.push({ hash, state });
          cursor++;
          window.location.hash = hash;
          Object.defineProperty(window.history, "state", {
            value: state,
            writable: true,
            configurable: true,
          });
        },
        replaceState: (state: unknown, _title: string, hash: string) => {
          history[cursor] = { hash, state };
          window.location.hash = hash;
          Object.defineProperty(window.history, "state", {
            value: state,
            writable: true,
            configurable: true,
          });
        },
        back: () => travel(-1),
      },
    });
    vi.stubGlobal("localStorage", { setItem: vi.fn(), getItem: () => null });
    useArchiveStore.setState({
      ...useArchiveStore.getInitialState(),
      preferences: { ...defaultPreferences, favorites: [], visited: [] },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("adds one reading entry, replaces section changes, and restores back/forward", () => {
    store().openEntry("operator-amiya");
    store().openDossier("operator-amiya");
    expect(history).toHaveLength(3);
    store().setDossierSection("gallery");
    store().setDossierSection("sources");
    expect(history).toHaveLength(3);
    expect(readRoute(window.location.hash)).toMatchObject({
      dossierOpen: true,
      dossierSection: "sources",
    });
    store().closeDossier();
    expect(store()).toMatchObject({
      selected: "operator-amiya",
      dossierOpen: false,
    });
    expect(cursor).toBe(1);
    travel(1);
    expect(store()).toMatchObject({
      dossierOpen: true,
      dossierSection: "sources",
    });
    expect(store().preferences.visited).toEqual(["operator-amiya"]);
  });
  it("closes direct deep links in place rather than leaving the site", () => {
    history[0] = {
      hash: "#/archive?entry=operator-amiya&view=dossier&section=details",
      state: null,
    };
    window.location.hash = history[0].hash;
    store().navigate(history[0].hash);
    store().closeDossier();
    expect(cursor).toBe(0);
    expect(window.location.hash).toBe("#/archive?entry=operator-amiya");
    expect(store().dossierOpen).toBe(false);
  });
  it("does not duplicate repeated opens and resets on record or map navigation", () => {
    store().openDossier("operator-amiya", "details");
    const count = history.length;
    store().openDossier("operator-amiya", "relations");
    expect(history).toHaveLength(count);
    store().openEntry("operator-silverash");
    expect(store()).toMatchObject({
      selected: "operator-silverash",
      dossierOpen: false,
      dossierSection: "overview",
    });
    store().openDossier("operator-silverash");
    store().openAtlas("yan");
    expect(store()).toMatchObject({ view: "atlas", dossierOpen: false });
    expect(window.location.hash).not.toContain("view=dossier");
  });
  it("does not navigate back using a reading marker retained from a previous page session", () => {
    history[0] = {
      hash: "#/archive?entry=operator-amiya&view=dossier&section=data",
      state: {
        terraDossierEntry: "operator-amiya",
        terraDossierSession: "previous-page-session",
      },
    };
    window.location.hash = history[0].hash;
    Object.defineProperty(window.history, "state", {
      value: history[0].state,
      writable: true,
      configurable: true,
    });
    store().navigate(history[0].hash);
    store().closeDossier();
    expect(cursor).toBe(0);
    expect(store().dossierOpen).toBe(false);
    expect(window.location.hash).toBe("#/archive?entry=operator-amiya");
  });
});

describe("reading presentation", () => {
  it("renders a semantic in-page region with focusable tabs and no modal", () => {
    const html = renderToStaticMarkup(
      createElement(DossierFrame, {
        name: "阿米娅",
        kind: "干员",
        section: "overview",
        tabs: [
          ["overview", "概览"],
          ["sources", "出处"],
        ],
        onClose: () => {},
        children: "记录",
      }),
    );
    expect(html).toContain("dossier-workspace");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("aria-modal");
  });
  it("binds Blacksteel and Leithanien explicitly, without inferring someone's birthplace", () => {
    expect(
      visualProfileFor({ id: "prts-operator-58745", name: "涤火杰西卡" })
        ?.theme,
    ).toBe("blacksteel");
    expect(
      visualProfileFor({ id: "leithanien", name: "莱塔尼亚" })?.theme,
    ).toBe("leithanien");
    expect(visualProfileFor({ name: "泰拉大典:组织/黑钢国际" })?.theme).toBe(
      "blacksteel",
    );
    expect(visualProfileFor({ name: "艾雅法拉" })).toBeUndefined();
  });
});

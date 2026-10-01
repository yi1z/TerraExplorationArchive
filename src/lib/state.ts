import { create } from "zustand";
import { entryById, events } from "../data/archive";
import { tour } from "../data/geography";
import type { AppView, Layers, Preferences } from "../data/types";
import {
  libraryKindNames,
  type LibraryFilter,
  type LibraryReleaseFilter,
} from "../data/library-types";
import {
  getLibrarySnapshot,
  getLibrarySummary,
  isLibraryId,
  libraryFacets,
  resolveLibraryId,
  subscribeLibrary,
} from "./library";
import {
  hydratePersistentPreferences,
  mergeHydratedPreferences,
  onPersistenceError,
  persistPreferences,
  SETTINGS_STORAGE_KEY,
} from "./persistence";
import { permittedFacetFields } from "./library-search-core";
export type ArchiveKindFilter = LibraryFilter;
const archiveKinds = new Set<string>(["all", ...Object.keys(libraryKindNames)]);
function isCatalogueEntry(id: string) {
  return (
    !entryById[id] || ["operator", "enemy", "item"].includes(entryById[id].kind)
  );
}
function readKind(value: string | null): ArchiveKindFilter {
  return value && archiveKinds.has(value)
    ? (value as ArchiveKindFilter)
    : "all";
}
function readFacet(value: string | null, kind: ArchiveKindFilter): string {
  if (!value || value === "all") return "all";
  const valid = libraryFacets(kind).includes(value);
  if (
    !valid &&
    getLibrarySnapshot().status !== "ready" &&
    value.includes(":")
  ) {
    const field = value.slice(0, value.indexOf(":"));
    if (
      permittedFacetFields(kind).includes(field) &&
      value.length <= 160 &&
      !/[<>\u0000-\u001f]/.test(value)
    )
      return value;
  }
  if (
    !valid &&
    getLibrarySnapshot().status !== "ready" &&
    ![
      "all",
      "world",
      "country",
      "city",
      "faction",
      "concept",
      "operator",
      "enemy",
      "item",
    ].includes(kind)
  )
    return value.length <= 80 && !/[<>\u0000-\u001f]/.test(value)
      ? value
      : "all";
  return valid ? value : "all";
}
export const STORAGE_KEY = "terra-exploration.preferences.v1";
export const defaultPreferences: Preferences = {
  version: 1,
  favorites: [],
  visited: [],
  spoilers: false,
  reducedMotion: false,
  sound: false,
};
export const defaultLayers: Layers = {
  countries: true,
  cities: true,
  relations: false,
};
export function readPreferences(raw: string | null): Preferences {
  if (!raw || raw.length > 4000000) return { ...defaultPreferences };
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1) return { ...defaultPreferences };
    const ids = (v: unknown) =>
      Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (id): id is string =>
                  typeof id === "string" &&
                  (!!getLibrarySummary(id) || isLibraryId(id)),
              ),
            ),
          ].slice(0, 50000)
        : [];
    return {
      version: 1,
      favorites: ids(value.favorites),
      visited: ids(value.visited),
      spoilers: value.spoilers === true,
      reducedMotion: value.reducedMotion === true,
      sound: value.sound === true,
    };
  } catch {
    return { ...defaultPreferences };
  }
}
export function readRoute(hash: string) {
  const [path, query = ""] = hash
    .slice(0, 2048)
    .replace(/^#\/?/, "")
    .split("?");
  let view: AppView = ["atlas", "archive", "favorites", "about"].includes(path)
    ? (path as AppView)
    : "archive";
  const params = new URLSearchParams(query);
  const requested = params.get("entry");
  const selected = requested ? resolveLibraryId(requested) : null;
  if (view === "atlas" && selected && isCatalogueEntry(selected))
    view = "archive";
  const kind = readKind(params.get("kind"));
  const facet = readFacet(params.get("filter"), kind);
  const status = params.get("status");
  const releaseFilter: LibraryReleaseFilter =
    status === "preview" || status === "all" ? status : "available";
  const searchQuery = (params.get("q") ?? "").slice(0, 160);
  const specified = params.get("layers");
  const layers =
    specified === null
      ? { ...defaultLayers }
      : (Object.fromEntries(
          Object.keys(defaultLayers).map((key) => [
            key,
            specified.split(",").includes(key),
          ]),
        ) as unknown as Layers);
  return {
    view,
    selected,
    layers,
    kind,
    facet,
    releaseFilter,
    query: searchQuery,
    invalid: !!requested && !selected,
  };
}
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
function preferencesAtStart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const p = readPreferences(raw);
    let savedMotion = false;
    try {
      const settings = JSON.parse(
        localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "null",
      );
      if (settings)
        for (const key of ["spoilers", "reducedMotion", "sound"] as const)
          if (typeof settings[key] === "boolean") p[key] = settings[key];
      savedMotion = typeof settings?.reducedMotion === "boolean";
    } catch {
      /* The v1 backup remains usable. */
    }
    if (!raw && !savedMotion) p.reducedMotion = prefersReducedMotion();
    return { preferences: p, available: true };
  } catch {
    return {
      preferences: {
        ...defaultPreferences,
        reducedMotion: prefersReducedMotion(),
      },
      available: false,
    };
  }
}
const initialPreferences = preferencesAtStart();
function routeAtStart() {
  return typeof window === "undefined"
    ? readRoute("")
    : readRoute(window.location.hash);
}
const initial = routeAtStart();
let progressResetSequence = 0;
type CameraCommand = "reset" | "in" | "out" | "north";
interface Store {
  view: AppView;
  selected: string | null;
  atlasSelected: string | null;
  previewEntry: string;
  setPreviewEntry: (id: string) => void;
  layers: Layers;
  preferences: Preferences;
  query: string;
  kind: ArchiveKindFilter;
  facet: string;
  releaseFilter: LibraryReleaseFilter;
  focusSequence: number;
  introSequence: number;
  introPlaying: boolean;
  replayIntro: () => void;
  finishIntro: () => void;
  cameraCommand: CameraCommand;
  cameraSequence: number;
  tourIndex: number;
  tourPlaying: boolean;
  activeEvent: string | null;
  compare: string[];
  compareOpen: boolean;
  notice: string | null;
  storageAvailable: boolean;
  preferencesHydrated: boolean;
  hydratePreferences: () => Promise<void>;
  select: (id: string, keepTour?: boolean) => void;
  openEntry: (id: string) => void;
  openAtlas: (id?: string) => void;
  returnToAtlas: () => void;
  close: () => void;
  setView: (view: AppView) => void;
  setQuery: (value: string) => void;
  setKind: (value: string) => void;
  setFacet: (value: string) => void;
  setReleaseFilter: (value: LibraryReleaseFilter) => void;
  toggleLayer: (key: keyof Layers) => void;
  togglePreference: (key: "spoilers" | "reducedMotion" | "sound") => void;
  favorite: (id: string) => void;
  navigate: (hash: string) => void;
  camera: (command: CameraCommand) => void;
  startTour: () => void;
  tourStep: (direction: number) => void;
  pauseTour: () => void;
  stopTour: () => void;
  resumeTour: () => void;
  setEvent: (id: string) => void;
  toggleCompare: (id: string) => void;
  setCompareOpen: (open: boolean) => void;
  clearNotice: () => void;
  resetProgress: () => void;
}
function save(preferences: Preferences): boolean {
  return persistPreferences(preferences);
}
function syncUrl(
  state: Pick<
    Store,
    | "view"
    | "selected"
    | "layers"
    | "kind"
    | "facet"
    | "releaseFilter"
    | "query"
  >,
  replace = false,
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.selected) params.set("entry", state.selected);
  if (state.view === "archive" || state.view === "favorites") {
    if (state.kind !== "all") params.set("kind", state.kind);
    if (state.facet !== "all") params.set("filter", state.facet);
    if (state.releaseFilter !== "available")
      params.set("status", state.releaseFilter);
    if (state.query) params.set("q", state.query);
  }
  if (JSON.stringify(state.layers) !== JSON.stringify(defaultLayers))
    params.set(
      "layers",
      Object.entries(state.layers)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(","),
    );
  const hash = "#/" + state.view + (params.size ? "?" + params.toString() : "");
  if (window.location.hash !== hash) {
    if (replace) window.history.replaceState(null, "", hash);
    else window.history.pushState(null, "", hash);
  }
}
export const useArchiveStore = create<Store>((set, get) => ({
  view: initial.view,
  selected: initial.selected,
  atlasSelected: initial.view === "atlas" ? initial.selected : null,
  previewEntry: initial.selected ?? "ursus",
  setPreviewEntry: (id) => {
    if (resolveLibraryId(id) && get().previewEntry !== id)
      set({ previewEntry: id });
  },
  layers: initial.layers,
  preferences: initialPreferences.preferences,
  query: initial.query,
  kind: initial.kind,
  facet: initial.facet,
  releaseFilter: initial.releaseFilter,
  focusSequence: 0,
  introSequence: 0,
  introPlaying:
    initial.view === "atlas" &&
    !initial.selected &&
    !initialPreferences.preferences.reducedMotion,
  finishIntro: () => {
    if (get().introPlaying) set({ introPlaying: false });
  },
  replayIntro: () => {
    set({
      view: "atlas",
      selected: null,
      atlasSelected: null,
      activeEvent: null,
      tourPlaying: false,
      tourIndex: -1,
      introSequence: get().introSequence + 1,
      introPlaying: !get().preferences.reducedMotion,
      focusSequence: get().focusSequence + 1,
    });
    syncUrl(get());
  },
  cameraCommand: "reset",
  cameraSequence: 0,
  tourIndex: -1,
  tourPlaying: false,
  activeEvent: null,
  compare: [],
  compareOpen: false,
  notice: initial.invalid ? "这个档案链接暂不存在，已显示资料总览。" : null,
  storageAvailable: initialPreferences.available,
  preferencesHydrated: false,
  hydratePreferences: async () => {
    if (get().preferencesHydrated) return;
    const before = get().preferences;
    const resetBeforeHydration = progressResetSequence;
    const restored = await hydratePersistentPreferences(before);
    const preferences = mergeHydratedPreferences(
      before,
      get().preferences,
      restored,
    );
    if (resetBeforeHydration !== progressResetSequence)
      preferences.visited = get().preferences.visited;
    set({
      preferences,
      preferencesHydrated: true,
      storageAvailable: save(preferences),
    });
  },
  select: (id, keepTour = false) => {
    const resolved = resolveLibraryId(id);
    if (!resolved) return;
    id = resolved;
    if (isCatalogueEntry(id)) {
      get().openEntry(id);
      return;
    }
    const current = get();
    const preferences = {
      ...current.preferences,
      visited: [
        ...current.preferences.visited.filter((visited) => visited !== id),
        id,
      ],
    };
    set({
      introPlaying: false,
      selected: id,
      atlasSelected: id,
      previewEntry: id,
      view: "atlas",
      focusSequence: current.focusSequence + 1,
      preferences,
      storageAvailable: save(preferences),
      ...(!keepTour
        ? { tourPlaying: false, tourIndex: -1, activeEvent: null }
        : {}),
    });
    syncUrl(get());
  },
  openEntry: (id) => {
    const resolved = resolveLibraryId(id);
    if (!resolved) return;
    id = resolved;
    const current = get();
    const preferences = {
      ...current.preferences,
      visited: [
        ...current.preferences.visited.filter((visited) => visited !== id),
        id,
      ],
    };
    set({
      view: "archive",
      selected: id,
      atlasSelected:
        current.view === "atlas" ? current.selected : current.atlasSelected,
      previewEntry: id,
      preferences,
      storageAvailable: save(preferences),
      introPlaying: false,
      tourPlaying: false,
      tourIndex: -1,
      activeEvent: null,
      compareOpen: false,
    });
    syncUrl(get());
  },
  openAtlas: (id) => {
    if (id !== undefined) {
      if (!entryById[id] || isCatalogueEntry(id)) return;
      get().select(id);
      return;
    }
    set({
      view: "atlas",
      selected: null,
      atlasSelected: null,
      previewEntry: isCatalogueEntry(get().previewEntry)
        ? "ursus"
        : get().previewEntry,
      introPlaying: false,
      tourPlaying: false,
      tourIndex: -1,
      activeEvent: null,
      compareOpen: false,
      focusSequence: get().focusSequence + 1,
    });
    syncUrl(get());
  },
  returnToAtlas: () => {
    const current = get();
    const selected = current.atlasSelected;
    set({
      view: "atlas",
      selected,
      previewEntry: selected ?? "ursus",
      introPlaying: false,
      tourPlaying: false,
      tourIndex: -1,
      activeEvent: null,
      compareOpen: false,
    });
    syncUrl(get());
  },
  close: () => {
    set({
      introPlaying: false,
      selected: null,
      ...(get().view === "atlas" ? { atlasSelected: null } : {}),
      activeEvent: null,
      tourPlaying: false,
      tourIndex: -1,
      focusSequence: get().focusSequence + (get().view === "atlas" ? 1 : 0),
    });
    syncUrl(get());
  },
  setView: (view) => {
    const current = get();
    set({
      view,
      atlasSelected:
        view === "atlas"
          ? null
          : current.view === "atlas"
            ? current.selected
            : current.atlasSelected,
      tourPlaying: false,
      tourIndex: -1,
      introPlaying: false,
      selected: null,
      activeEvent: null,
    });
    syncUrl(get());
  },
  setQuery: (query) => {
    set({ query: query.slice(0, 160) });
    if (get().view === "archive" || get().view === "favorites")
      syncUrl(get(), true);
  },
  setKind: (kind) => {
    const nextKind = readKind(kind);
    set({
      kind: nextKind,
      facet: nextKind === get().kind ? get().facet : "all",
    });
    if (get().view === "archive" || get().view === "favorites") syncUrl(get());
  },
  setFacet: (facet) => {
    set({ facet: readFacet(facet, get().kind) });
    if (get().view === "archive" || get().view === "favorites") syncUrl(get());
  },
  setReleaseFilter: (releaseFilter) => {
    set({
      releaseFilter: ["preview", "all"].includes(releaseFilter)
        ? releaseFilter
        : "available",
    });
    if (get().view === "archive" || get().view === "favorites") syncUrl(get());
  },
  toggleLayer: (key) => {
    set({ layers: { ...get().layers, [key]: !get().layers[key] } });
    syncUrl(get());
  },
  togglePreference: (key) => {
    const preferences = {
      ...get().preferences,
      [key]: !get().preferences[key],
    };
    const event = events.find((e) => e.id === get().activeEvent);
    set({
      preferences,
      storageAvailable: save(preferences),
      ...(key === "reducedMotion" && preferences.reducedMotion
        ? { introPlaying: false }
        : {}),
      ...(key === "spoilers" && !preferences.spoilers && event?.spoiler
        ? { activeEvent: null }
        : {}),
    });
  },
  favorite: (id) => {
    const resolved = resolveLibraryId(id);
    if (!resolved) return;
    id = resolved;
    const p = get().preferences;
    const preferences = {
      ...p,
      favorites: p.favorites.includes(id)
        ? p.favorites.filter((x) => x !== id)
        : [...p.favorites, id],
    };
    set({
      preferences,
      storageAvailable: save(preferences),
      notice: preferences.favorites.includes(id)
        ? "已收入个人档案。"
        : "已从收藏中移除。",
    });
  },
  navigate: (hash) => {
    const r = readRoute(hash);
    const current = get();
    const catalogueView = r.view === "archive" || r.view === "favorites";
    set({
      view: r.view,
      selected: r.selected,
      layers: r.layers,
      kind: catalogueView ? r.kind : current.kind,
      facet: catalogueView ? r.facet : current.facet,
      releaseFilter: catalogueView ? r.releaseFilter : current.releaseFilter,
      query: catalogueView ? r.query : current.query,
      atlasSelected: r.view === "atlas" ? r.selected : current.atlasSelected,
      ...(r.selected ? { previewEntry: r.selected } : {}),
      introPlaying: false,
      focusSequence:
        current.focusSequence +
        (r.view === "atlas" && current.atlasSelected !== r.selected ? 1 : 0),
      tourPlaying: false,
      tourIndex: -1,
      activeEvent: null,
      compareOpen: false,
      notice: r.invalid ? "档案不存在，已显示总览。" : null,
    });
  },
  camera: (cameraCommand) =>
    set({
      cameraCommand,
      introPlaying: false,
      cameraSequence: get().cameraSequence + 1,
      tourPlaying: false,
    }),
  startTour: () => {
    set({ tourIndex: 0, tourPlaying: true });
    get().select(tour[0], true);
  },
  tourStep: (direction) => {
    const index = Math.min(
      tour.length - 1,
      Math.max(0, get().tourIndex + direction),
    );
    set({ tourIndex: index });
    get().select(tour[index], true);
  },
  pauseTour: () => set({ tourPlaying: false }),
  resumeTour: () => {
    if (get().tourIndex < 0) get().startTour();
    else set({ tourPlaying: true });
  },
  stopTour: () => set({ tourPlaying: false, tourIndex: -1 }),
  setEvent: (id) => {
    const event = events.find((e) => e.id === id);
    if (!event || (event.spoiler && !get().preferences.spoilers)) return;
    get().select(event.related[0]);
    set({ activeEvent: id });
  },
  toggleCompare: (id) => {
    if (entryById[id]?.kind !== "country") return;
    const list = get().compare;
    if (list.includes(id)) set({ compare: list.filter((x) => x !== id) });
    else if (list.length < 2) set({ compare: [...list, id] });
    else set({ notice: "最多对比两个地区，请先移除一个。" });
  },
  setCompareOpen: (compareOpen) => set({ compareOpen }),
  clearNotice: () => set({ notice: null }),
  resetProgress: () => {
    progressResetSequence++;
    const preferences = { ...get().preferences, visited: [] };
    set({
      preferences,
      storageAvailable: save(preferences),
      notice: "探索记录已重置，收藏仍然保留。",
    });
  },
}));

onPersistenceError(() => useArchiveStore.setState({ storageAvailable: false }));
subscribeLibrary(() => {
  if (getLibrarySnapshot().status !== "ready") return;
  const state = useArchiveStore.getState();
  const selected = state.selected ? resolveLibraryId(state.selected) : null;
  const facet = readFacet(state.facet, state.kind);
  if (state.selected && !selected)
    useArchiveStore.setState({ notice: "这条记录未包含在当前资料快照中。" });
  else if (selected !== state.selected || facet !== state.facet)
    useArchiveStore.setState({ selected, facet });
});

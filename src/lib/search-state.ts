import type {
  LibraryFilter,
  LibraryReleaseFilter,
} from "../data/library-types";

export type SearchScope = "all" | "favorites" | "recent";
export interface SearchState {
  query: string;
  kind: LibraryFilter;
  facet: string;
  releaseFilter: LibraryReleaseFilter;
  searchScope: SearchScope;
  searchPage: number;
}
export interface SearchPosition {
  scrollTop: number;
  focusedId: string | null;
}
export function readSearchPage(value: string | null): number {
  if (!value || !/^\d{1,9}$/.test(value)) return 0;
  return Math.max(0, Number(value) - 1);
}
export function readSearchScope(value: string | null): SearchScope {
  return value === "favorites" || value === "recent" ? value : "all";
}
export function searchStateKey(state: SearchState): string {
  return JSON.stringify([
    state.query,
    state.kind,
    state.facet,
    state.releaseFilter,
    state.searchScope,
    state.searchPage,
  ]);
}
const positions = new Map<string, SearchPosition>();
export function rememberSearchPosition(key: string, position: SearchPosition) {
  // A browsing session should not retain an unbounded history of typed queries.
  positions.delete(key);
  positions.set(key, {
    ...position,
    scrollTop: Math.max(0, position.scrollTop),
  });
  if (positions.size > 100) positions.delete(positions.keys().next().value!);
}
export function getSearchPosition(key: string): SearchPosition {
  return positions.get(key) ?? { scrollTop: 0, focusedId: null };
}

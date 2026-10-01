import { describe, expect, it } from "vitest";
import {
  getSearchPosition,
  readSearchPage,
  readSearchScope,
  rememberSearchPosition,
  searchStateKey,
  type SearchState,
} from "../src/lib/search-state";
import { readRoute } from "../src/lib/state";

describe("shareable search state", () => {
  it("rejects unsafe page syntax and decodes one-based links", () => {
    for (const value of [
      null,
      "",
      "-2",
      "2.5",
      "1e3",
      "Infinity",
      "999999999999999999999",
      "<svg>",
    ])
      expect(readSearchPage(value)).toBe(0);
    expect(readSearchPage("0")).toBe(0);
    expect(readSearchPage("1")).toBe(0);
    expect(readSearchPage("52")).toBe(51);
    expect(readSearchScope("constructor")).toBe("all");
    expect(
      readRoute(
        "#/search?q=Jessica&kind=operator&scope=recent&page=5&status=all",
      ),
    ).toMatchObject({
      view: "search",
      query: "Jessica",
      kind: "operator",
      searchScope: "recent",
      searchPage: 4,
      releaseFilter: "all",
    });
  });

  it("retains the result position per query, page and reading scope", () => {
    const state: SearchState = {
      query: "A",
      kind: "operator",
      facet: "all",
      releaseFilter: "available",
      searchScope: "all",
      searchPage: 0,
    };
    const key = searchStateKey(state);
    rememberSearchPosition(key, {
      scrollTop: 480,
      focusedId: "operator-amiya",
    });
    expect(getSearchPosition(key)).toEqual({
      scrollTop: 480,
      focusedId: "operator-amiya",
    });
    for (const change of [
      { query: "B" },
      { searchPage: 1 },
      { searchScope: "recent" as const },
      { releaseFilter: "preview" as const },
    ])
      expect(
        getSearchPosition(searchStateKey({ ...state, ...change })),
      ).toEqual({ scrollTop: 0, focusedId: null });
  });

  it("bounds session position history and ignores negative scroll offsets", () => {
    rememberSearchPosition("old", { scrollTop: -40, focusedId: null });
    expect(getSearchPosition("old").scrollTop).toBe(0);
    for (let i = 0; i < 101; i++)
      rememberSearchPosition(`session-${i}`, { scrollTop: i, focusedId: null });
    expect(getSearchPosition("old")).toEqual({ scrollTop: 0, focusedId: null });
    expect(getSearchPosition("session-100").scrollTop).toBe(100);
  });
});

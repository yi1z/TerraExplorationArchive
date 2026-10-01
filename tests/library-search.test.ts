import { describe, expect, it } from "vitest";
import {
  LibrarySearchIndex,
  libraryFacetGroups,
} from "../src/lib/library-search-core";
import type {
  LibrarySearchQuery,
  LibrarySummary,
} from "../src/data/library-types";

function summary(
  id: string,
  overrides: Partial<LibrarySummary> = {},
): LibrarySummary {
  return {
    id,
    name: id,
    kind: "operator",
    aliases: [],
    summary: "",
    summaryStatus: "source",
    tags: [],
    releaseStatus: "released",
    source: { title: id, url: "https://prts.wiki/w/test" },
    detailShard: "data/prts/details/operator-000.json",
    ...overrides,
  };
}
const query = (
  overrides: Partial<LibrarySearchQuery> = {},
): LibrarySearchQuery => ({
  query: "",
  kind: "all",
  facet: "all",
  spoilers: false,
  scope: "all",
  favorites: [],
  visited: [],
  ...overrides,
});

describe("partitioned library search", () => {
  it("normalizes full-width names and ranks exact aliases before body matches", () => {
    const index = new LibrarySearchIndex([
      summary("body", { summary: "An alpha record" }),
      summary("name", { name: "能天使", aliases: ["Alpha"] }),
    ]);
    expect(index.search(query({ query: "ＡＬＰＨＡ" })).ids).toEqual([
      "name",
      "body",
    ]);
  });

  it("ranks an exact character name above modules whose aliases name their owner", () => {
    const index = new LibrarySearchIndex([
      summary("module", {
        kind: "module",
        name: "落叶四季",
        aliases: ["缪尔赛思"],
      }),
      summary("operator", { name: "缪尔赛思", en: "Muelsyse" }),
    ]);
    expect(index.search(query({ query: "缪尔赛思" })).ids).toEqual([
      "operator",
      "module",
    ]);
  });
  it("indexes loaded body text without revealing spoiler-only matches", () => {
    const index = new LibrarySearchIndex([summary("story", { kind: "story" })]);
    index.addDocument({
      id: "story",
      text: "乌萨斯的孩子们",
      spoilerText: "继承的责任",
    });
    expect(index.search(query({ query: "乌萨斯" })).ids).toEqual(["story"]);
    expect(index.search(query({ query: "继承的责任" })).ids).toEqual([]);
    expect(
      index.search(query({ query: "继承的责任", spoilers: true })).ids,
    ).toEqual(["story"]);
    expect(index.search(query({ query: "乌" })).ids).toEqual(["story"]);
  });

  it("keeps compact postings equivalent and accepts additional source documents", () => {
    const index = new LibrarySearchIndex([
      summary("one", { name: "测试条目一" }),
      summary("two", { name: "测试条目二" }),
    ]);
    index.addDocument({ id: "two", text: "另一个共同条目" });
    const before = index.search(query({ query: "条目" }));
    index.compact();
    expect(index.search(query({ query: "条目" }))).toEqual(before);
    index.addDocument({ id: "one", text: "新的共同条目" });
    index.compact();
    expect(index.search(query({ query: "共同条目" })).ids).toEqual([
      "one",
      "two",
    ]);
  });
  it("combines typed facets, old plain facets, scope and newest-first reading order", () => {
    const index = new LibrarySearchIndex([
      summary("caster", { facets: { profession: ["术师"], rarity: ["6"] } }),
      summary("medic", { facets: { profession: ["医疗"], rarity: ["6"] } }),
      summary("enemy", { kind: "enemy", facets: { rank: ["领袖"] } }),
    ]);
    expect(
      index.search(query({ kind: "operator", facet: "profession:术师" })).ids,
    ).toEqual(["caster"]);
    expect(
      index.search(query({ kind: "operator", facet: "术师" })).ids,
    ).toEqual(["caster"]);
    expect(index.search(query({ facet: "kind:enemy" })).ids).toEqual(["enemy"]);
    expect(
      index.search(
        query({ facet: "rarity:6", scope: "favorites", favorites: ["medic"] }),
      ).ids,
    ).toEqual(["medic"]);
    expect(
      index.search(query({ scope: "recent", visited: ["medic", "caster"] }))
        .ids,
    ).toEqual(["caster", "medic"]);
  });
  it("hides test, unreleased and unknown records unless explicitly requested", () => {
    const records = (
      ["released", "historical", "test", "unreleased", "unknown"] as const
    ).map((releaseStatus) => summary(releaseStatus, { releaseStatus }));
    const index = new LibrarySearchIndex(records);
    expect(index.search(query()).ids).toEqual(["released", "historical"]);
    expect(index.search(query({ releaseFilter: "preview" })).ids).toEqual([
      "test",
      "unreleased",
    ]);
    expect(index.search(query({ releaseFilter: "all" })).total).toBe(5);
  });
  it("groups old geographic kinds with new world records", () => {
    const index = new LibrarySearchIndex([
      summary("yan", { kind: "country" }),
      summary("lore", { kind: "world" }),
      summary("amiya"),
    ]);
    expect(index.search(query({ kind: "world" })).ids).toEqual(["yan", "lore"]);
    expect(index.search(query()).counts.world).toBe(2);
  });
  it("offers only category facets in all, and clearly separated operator dimensions", () => {
    const records = [
      summary("amiya", {
        facets: {
          profession: ["术师"],
          branch: ["中坚术师"],
          rarity: ["5"],
          owner: ["must not appear"],
        },
      }),
    ];
    const all = libraryFacetGroups(records, "all");
    expect(all).toHaveLength(1);
    expect(all[0].options).toHaveLength(13);
    expect(
      libraryFacetGroups(records, "operator").map((group) => group.field),
    ).toEqual(["profession", "branch", "rarity"]);
    expect(
      libraryFacetGroups(
        [summary("yan", { kind: "world", facets: { type: ["country"] } })],
        "world",
      )[0].options[0].label,
    ).toBe("国家与文明");
  });
  it("bounds rendering pages for thirty thousand records and finds a late entry", () => {
    const index = new LibrarySearchIndex(
      Array.from({ length: 30000 }, (_, i) =>
        summary(`prts-item-${i}`, { kind: "item", name: `档案记录 ${i}` }),
      ),
    );
    expect(index.search(query({ limit: 10000 })).ids).toHaveLength(80);
    expect(index.search(query({ offset: 96, limit: 48 })).ids[0]).toBe(
      "prts-item-96",
    );
    expect(index.search(query()).total).toBe(30000);
    expect(index.search(query({ query: "档案记录 29999" })).ids).toEqual([
      "prts-item-29999",
    ]);
  });
});

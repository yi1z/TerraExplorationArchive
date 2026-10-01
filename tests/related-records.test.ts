import { describe, expect, it } from "vitest";
import { entryById } from "../src/data/archive";
import type { ArchiveEntry } from "../src/data/types";
import type { LibrarySummary } from "../src/data/library-types";
import { getLibrarySummary } from "../src/lib/library";
import { relatedMapTarget, relatedRecords } from "../src/lib/related-records";

const source: ArchiveEntry = {
  ...entryById.yan,
  related: [],
  relationships: [],
};
const record = (
  id: string,
  extra: Partial<LibrarySummary> = {},
): LibrarySummary => ({
  ...getLibrarySummary("yan")!,
  id,
  name: id,
  legacyId: undefined,
  ...extra,
});
const world = record("prts-world-900001", {
  kind: "world",
  artwork: undefined,
});
const second = record("prts-world-900002", { kind: "world" });
const targets = new Map([
  [source.id, record(source.id)],
  [world.id, world],
  ["old-world-alias", world],
  [second.id, second],
]);
const options = {
  incomingEntries: [],
  resolve: (id: string) => targets.get(id),
};

describe("curated and full-library relationships", () => {
  it("resolves new unpictured world records and deduplicates canonical aliases", () => {
    const result = relatedRecords(
      {
        ...source,
        relationships: [{ target: "old-world-alias", label: "旧线索" }],
      },
      false,
      {
        id: source.id,
        relationships: [
          { target: world.id, label: "地区下辖" },
          { target: second.id, label: "关联地区" },
        ],
      },
      options,
    );
    expect(result.map(({ target, label }) => ({ target, label }))).toEqual([
      { target: world.id, label: "地区下辖" },
      { target: second.id, label: "关联地区" },
    ]);
    expect(result[0].record.artwork).toBeUndefined();
  });

  it("does not attach a previous selection's asynchronously loaded relationships", () => {
    expect(
      relatedRecords(
        source,
        false,
        {
          id: "ursus",
          relationships: [{ target: world.id, label: "其他地区" }],
        },
        options,
      ),
    ).toEqual([]);
    expect(
      relatedRecords(
        source,
        false,
        {
          id: "prts-world-source",
          legacyId: source.id,
          relationships: [{ target: world.id, label: "当前地区" }],
        },
        options,
      ),
    ).toHaveLength(1);
  });

  it("keeps story-only relationships hidden even when duplicate links lack flags", () => {
    const entry = {
      ...source,
      relationships: [{ target: world.id, label: "历史", spoiler: true }],
    };
    const detail = {
      id: source.id,
      relationships: [
        { target: world.id, label: "来源关联" },
        { target: second.id, label: "公开关系" },
      ],
    };
    expect(
      relatedRecords(entry, false, detail, options).map((link) => link.target),
    ).toEqual([second.id]);
    expect(
      relatedRecords(entry, true, detail, options).map((link) => link.target),
    ).toEqual([world.id, second.id]);
  });

  it("merges visible incoming curated links without overriding explicit labels", () => {
    const first: ArchiveEntry = {
      ...entryById["operator-amiya"],
      id: world.id,
      related: [],
      relationships: [{ target: source.id, label: "所属势力" }],
    };
    const hidden: ArchiveEntry = {
      ...first,
      id: second.id,
      relationships: [{ target: source.id, label: "历史", spoiler: true }],
    };
    const incoming = { ...options, incomingEntries: [first, hidden] };
    const result = relatedRecords(source, false, null, incoming);
    expect(result.map(({ target, label }) => ({ target, label }))).toEqual([
      { target: world.id, label: "所属干员 / 关联记录" },
    ]);
    const own = relatedRecords(
      { ...source, relationships: [{ target: world.id, label: "明确关系" }] },
      false,
      null,
      incoming,
    );
    expect(own[0].label).toBe("明确关系");
  });

  it("omits unresolved targets and self-links from both sources", () => {
    expect(
      relatedRecords(
        {
          ...source,
          related: ["missing", source.id],
          relationships: undefined,
        },
        false,
        {
          id: source.id,
          relationships: [{ target: "constructor", label: "无效" }],
        },
        options,
      ),
    ).toEqual([]);
  });

  it("navigates only known curated geography on the map", () => {
    expect(relatedMapTarget(record("lungmen"))).toBe("lungmen");
    expect(
      relatedMapTarget(record("canonical-lungmen", { legacyId: "lungmen" })),
    ).toBe("lungmen");
    expect(relatedMapTarget(getLibrarySummary("operator-amiya")!)).toBeNull();
    expect(relatedMapTarget(world)).toBeNull();
    expect(
      relatedMapTarget(record("prts-item-900001", { kind: "item" })),
    ).toBeNull();
  });
});

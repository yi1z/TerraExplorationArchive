import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyLibraryDetailOverrides,
  libraryDetailOverrides,
} from "../src/data/library-overrides";
import { entryById, visibleSections } from "../src/data/archive";
import type { LibraryDetail } from "../src/data/library-types";
import { readableValue } from "../src/components/LibraryDossier";

const fixture = (
  id: string,
  kind: LibraryDetail["kind"] = "operator",
): LibraryDetail => ({
  id,
  kind,
  name: id,
  aliases: [],
  summary: "Snapshot summary",
  summaryStatus: "source",
  tags: [],
  releaseStatus: "released",
  source: { title: "Snapshot", url: "https://prts.wiki/w/example" },
  detailShard: "",
  facts: [],
  sections: [],
  relationships: [],
  fields: { retained: true },
  templates: [],
  artworkRefs: [],
});
describe("reviewed snapshot amendments", () => {
  it("preserves imported Jessica verification without restoring the obsolete pending warning", () => {
    const original = fixture("prts-operator-1719");
    original.fields = {
      attributes: {
        潜能提升: [
          { 属性: "攻击", 变化: "24" },
          { 属性: "re_deploy", 变化: "-4" },
        ],
      },
    };
    original.templates = [{ name: "潜能提升", params: { 潜能4: "攻击力+23" } }];
    original.sections = [
      {
        title: "潜能数值核验",
        body: "国服固定版本数值+24，PRTS旧模板+23，已交叉核验。",
        sourceKind: "gameplay",
      },
    ];
    original.missingFacts = ["既有缺失说明"];
    const corrected = applyLibraryDetailOverrides(original);
    expect(corrected.fields).toBe(original.fields);
    expect(corrected.templates).toBe(original.templates);
    expect(corrected.sections).toBe(original.sections);
    expect(corrected.missingFacts).toContain("既有缺失说明");
    expect(
      corrected.missingFacts?.some((note) => note.includes("待核验")),
    ).toBe(false);
    expect(applyLibraryDetailOverrides(corrected).missingFacts).toHaveLength(1);
    expect(readableValue("re_deploy")).toBe("再部署时间变化（秒）");
  });
  it("preserves downloaded source and gameplay fields while adding reciprocal spoiler links", () => {
    for (const id of Object.keys(libraryDetailOverrides)) {
      const original = fixture(id);
      const corrected = applyLibraryDetailOverrides(original);
      expect(corrected.source).toBe(original.source);
      expect(corrected.fields).toBe(original.fields);
      expect(corrected.relationships).toHaveLength(1);
      expect(corrected.relationships[0].spoiler).toBe(true);
      expect(
        libraryDetailOverrides[corrected.relationships[0].target]
          .relationships[0].target,
      ).toBe(id);
      expect(original.relationships).toHaveLength(0);
      expect(applyLibraryDetailOverrides(corrected).relationships).toHaveLength(
        1,
      );
    }
  });
  it("points to real snapshot IDs and keeps amendment revisions explicit", () => {
    const manifest = JSON.parse(
      readFileSync("public/data/prts/manifest.json", "utf8"),
    );
    const ids = new Set(
      manifest.detailShards.flatMap((shard: { ids: string[] }) => shard.ids),
    );
    for (const [id, override] of Object.entries(libraryDetailOverrides)) {
      expect(ids.has(id)).toBe(true);
      expect(override.source.revisionId).toBeGreaterThan(0);
      for (const relation of override.relationships)
        expect(ids.has(relation.target)).toBe(true);
    }
  });
  it("makes Leithanien facts readable without exposing its historical spoiler section", () => {
    const original = fixture("leithanien", "country");
    const corrected = applyLibraryDetailOverrides(original);
    expect(
      corrected.facts.some(
        (f) => f.label === "首都" && f.value.includes("崔林特尔梅"),
      ),
    ).toBe(true);
    expect(
      corrected.facts.some(
        (f) => f.label === "行政分区" && f.value.includes("九个"),
      ),
    ).toBe(true);
    expect(
      corrected.sections.find((s) => s.title === "历史追记")?.spoiler,
    ).toBe(true);
    expect(
      visibleSections(entryById.leithanien, false).some(
        (s) => s.title === "历史追记",
      ),
    ).toBe(false);
    expect(corrected.source).toBe(original.source);
    expect(corrected.additionalSources?.[0].revisionId).toBe(337057);
    expect(
      applyLibraryDetailOverrides(corrected).additionalSources,
    ).toHaveLength(1);
  });
  it("leaves unlisted names and object prototype keys untouched", () => {
    const original = fixture("toString");
    expect(applyLibraryDetailOverrides(original)).toBe(original);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyAuthoredRelationships,
  applyReviewedAmendments,
  linkPotentialTokens,
} from "../scripts/prts/amendments.mjs";
import { buildRecord, loadLegacy } from "../scripts/prts/normalize.mjs";

const record = (id, kind, name, aliases = []) => ({
  id,
  kind,
  name,
  aliases,
  source: {
    pageId: 1,
    revisionId: 12,
    title: name,
    url: `https://prts.wiki/w/${name}`,
  },
  relationships: [],
  fields: {},
  templates: [],
  facts: [],
  sections: [],
  facets: {},
});
const operator = (id, name, gameId) => record(id, "operator", name, [gameId]);
function token(id, name, gameId, kernel = false) {
  const entry = record(id, "item", `${name}的${kernel ? "中坚" : ""}信物`);
  entry.templates = [
    {
      name: "道具信息",
      params: {
        itemId: `${kernel ? "class_" : ""}p_${gameId}`,
        分类: kernel ? "中坚信物" : "信物",
        用途: `用于提升${name}的潜能。`,
      },
    },
  ];
  return entry;
}
describe("potential token identity reconciliation", () => {
  it("links ordinary and kernel tokens separately in both directions", () => {
    const owner = operator("jessica", "杰西卡", "char_235_jesica");
    const entries = [
      owner,
      token("ordinary", owner.name, owner.aliases[0]),
      token("kernel", owner.name, owner.aliases[0], true),
    ];
    const audit = linkPotentialTokens(entries);
    expect([audit.ordinary, audit.kernel, audit.unresolved.length]).toEqual([
      1, 1, 0,
    ]);
    expect(owner.relationships).toEqual([
      { target: "ordinary", label: "信物" },
      { target: "kernel", label: "中坚信物" },
    ]);
    expect(entries[1].relationships).toEqual([
      { target: owner.id, label: "潜能提升干员" },
    ]);
    linkPotentialTokens(entries);
    expect(owner.relationships).toHaveLength(2);
  });
  it("disambiguates Mon3tr and Shalem by game ID, not matching names", () => {
    const entries = [
      operator("shalem-is", "暮落", "char_512_aprot"),
      operator("shalem", "暮落", "char_4025_aprot2"),
      operator("mon3tr-summon", "Mon3tr", "token_10002_kalts_mon3tr"),
      operator("mon3tr", "Mon3tr", "char_4179_monstr"),
      token("shalem-token", "暮落", "char_4025_aprot2"),
      token("mon3tr-token", "Mon3tr", "char_4179_monstr"),
    ];
    expect(
      linkPotentialTokens(entries).matched.map((entry) => entry.target),
    ).toEqual(["shalem", "mon3tr"]);
    expect(entries[0].relationships).toEqual([]);
    expect(entries[2].relationships).toEqual([]);
  });
  it("accepts an omitted final full stop without weakening the identity check", () => {
    const owner = operator("blemishine", "瑕光", "char_423_blemsh");
    const item = token("blemishine-token", owner.name, owner.aliases[0]);
    item.templates[0].params.用途 = "用于提升瑕光的潜能";
    expect(linkPotentialTokens([owner, item]).ordinary).toBe(1);
  });
  it("refuses conflicting purpose, duplicate IDs and mismatched kernel classification", () => {
    const owner = operator("one", "杰西卡", "char_235_jesica");
    const wrong = token("wrong", "涤火杰西卡", owner.aliases[0]);
    const kernel = token("kernel", owner.name, owner.aliases[0], true);
    kernel.templates[0].params.分类 = "信物";
    expect(linkPotentialTokens([owner, wrong, kernel]).unresolved).toHaveLength(
      2,
    );
    const duplicate = operator("two", owner.name, owner.aliases[0]);
    expect(
      linkPotentialTokens([
        owner,
        duplicate,
        token("duplicate", owner.name, owner.aliases[0]),
      ]).unresolved,
    ).toHaveLength(1);
    expect(owner.relationships).toEqual([]);
  });
});

describe("reviewed relationships", () => {
  it("copies spoiler gates to reverse links without publishing author-only fields", () => {
    const entries = [record("a", "world", "A"), record("b", "country", "B")];
    const authored = [
      {
        id: "a",
        relationships: [
          {
            target: "b",
            label: "领袖",
            reverseLabel: "统辖地区",
            spoiler: true,
          },
        ],
      },
    ];
    applyAuthoredRelationships(entries, authored);
    applyAuthoredRelationships(entries, authored);
    expect(entries[0].relationships).toEqual([
      { target: "b", label: "领袖", spoiler: true },
    ]);
    expect(entries[1].relationships).toEqual([
      { target: "a", label: "统辖地区", spoiler: true },
    ]);
    expect(entries[0].sections).toEqual([]);
    expect(entries[0].summaryStatus).toBeUndefined();
  });
  it("rejects unknown targets instead of publishing dangling links", () => {
    expect(() =>
      applyAuthoredRelationships(
        [record("a", "world", "A")],
        [{ id: "a", relationships: [{ target: "missing", label: "关联" }] }],
      ),
    ).toThrow("Invalid relationship");
  });
});

describe("Jessica fixed-source amendments", () => {
  const evidence = JSON.parse(
    readFileSync("data/prts/structured-amendments.json", "utf8"),
  );
  function fixtures() {
    const jessica = operator("prts-operator-1719", "杰西卡", "char_235_jesica");
    jessica.source.pageId = 1719;
    jessica.fields.attributes = {
      潜能提升: [
        { 属性: "部署费用", 变化: "-1" },
        { 属性: "re_deploy", 变化: "-4" },
        { 属性: "攻击", 变化: "24" },
      ],
    };
    jessica.templates = [{ name: "潜能提升", params: { 潜能4: "攻击力+23" } }];
    const stage = record("prts-stage-2073", "stage", "TR-3 精确打击");
    stage.fields.drops = [{ 类型: "首次", 道具: "杰西卡", 条件: "固定掉落" }];
    const alternate = operator(
      "prts-operator-58745",
      "涤火杰西卡",
      "char_1034_jesca2",
    );
    const raw = new Map([
      [
        1719,
        {
          revisions: [
            {
              slots: {
                main: {
                  "*": "{{干员获得方式|获得方式=主线剧情|覆盖=主线剧情（[[TR-3_精确打击|TR-3]]）}}",
                },
              },
            },
          ],
        },
      ],
    ]);
    return { entries: [jessica, stage, alternate], raw };
  }
  it("records +24 from both game description and ATK modifier while retaining PRTS +23", () => {
    const { entries, raw } = fixtures();
    const audit = applyReviewedAmendments(entries, evidence, raw);
    expect(audit.potential[0].value).toBe(24);
    expect(entries[0].fields.attributes.潜能提升[2].变化).toBe("24");
    expect(entries[0].templates[0].params.潜能4).toBe("攻击力+23");
    expect(entries[0].sections[0].body).toContain(
      evidence.potential[0].gameSource.commit,
    );
    expect(entries[0].sections[0].body).toContain("攻击力+23");
    expect(evidence.potential[0].gameSource.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      entries[0].additionalSources.some((source) =>
        source.url.includes("character_table.json"),
      ),
    ).toBe(true);
  });
  it("uses both acquisition-page link and first-clear drop, with reciprocal stage relationships", () => {
    const { entries, raw } = fixtures();
    applyReviewedAmendments(entries, evidence, raw);
    expect(entries[0].fields.acquisition.主线首次奖励).toBe(
      "TR-3 精确打击（首次通关固定获得）",
    );
    expect(entries[1].relationships).toContainEqual({
      target: entries[0].id,
      label: "首次通关干员奖励",
    });
    expect(entries[2].relationships).toContainEqual({
      target: entries[0].id,
      label: "同一人物的早期干员档案",
      spoiler: true,
    });
  });
  it("rejects a stage link lacking matching first-clear evidence", () => {
    const { entries, raw } = fixtures();
    entries[1].fields.drops = [];
    expect(() => applyReviewedAmendments(entries, evidence, raw)).toThrow(
      "Acquisition evidence mismatch",
    );
  });
});

describe("curated archive ingestion", () => {
  it("reads current TypeScript content and preserves curated facts and sections in the generated detail", () => {
    const archive = loadLegacy();
    const curated = archive.entries.find((entry) => entry.id === "leithanien");
    const title = "泰拉大典:地理/莱塔尼亚";
    const generated = buildRecord(
      { pageId: 21739, title, ns: 3000, kinds: ["world"], categories: [] },
      {
        revisions: [
          {
            revid: 337057,
            slots: { main: { "*": "==地理==\n{{信息框|名称=莱塔尼亚}}" } },
          },
        ],
      },
      {},
      new Map([[title, curated]]),
    );
    expect(generated.id).toBe("leithanien");
    expect(generated.facts).toEqual(expect.arrayContaining(curated.facts));
    expect(
      generated.facts.find((fact) => fact.label === "政体")?.value,
    ).toContain("选举君主制");
    for (const section of curated.sections)
      expect(generated.sections).toContainEqual({
        ...section,
        sourceKind: "curated",
      });
    expect(generated.sections.map((section) => section.title)).toContain(
      "经济与产业",
    );
    expect(
      generated.sections.filter((section) => section.spoiler).length,
    ).toBeGreaterThan(0);
  });
});

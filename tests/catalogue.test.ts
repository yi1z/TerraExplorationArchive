import { describe, expect, it } from "vitest";
import {
  catalogueEntries,
  catalogueSources,
  enemies,
  items,
  operators,
} from "../src/data/catalogue";
import { entryById, searchEntries, visibleSections } from "../src/data/archive";

describe("curated dossier data", () => {
  it("keeps the agreed editorial roster complete and separately typed", () => {
    expect(operators).toHaveLength(24);
    expect(enemies).toHaveLength(16);
    expect(items).toHaveLength(24);
    expect(catalogueEntries).toHaveLength(64);
    expect(new Set(catalogueEntries.map((entry) => entry.id)).size).toBe(64);
    expect(
      operators.some((entry) => entry.operator.profession === "特种"),
    ).toBe(true);
    expect(
      new Set(operators.map((entry) => entry.operator.profession)).size,
    ).toBe(8);
  });

  it("retains a traceable dated source for every locally stored new dossier", () => {
    for (const entry of catalogueEntries) {
      expect(entry.checkedAt).toBe("2026-09-30");
      expect(entry.sources).toHaveLength(1);
      const source = catalogueSources[entry.sources[0]];
      expect(new URL(source.url).hostname).toBe("prts.wiki");
      expect(decodeURIComponent(source.url)).toContain("/w/");
      expect(source.checkedAt).toBe(entry.checkedAt);
      expect(source.note).toContain("本地核验快照");
    }
  });

  it("uses base operator values with an explicit level and modifier policy", () => {
    for (const entry of operators) {
      expect(entry.operator.stats?.basis).toContain("潜能一");
      expect(entry.operator.stats?.basis).toContain("不计天赋与技能");
      expect(entry.operator.skills.length).toBeGreaterThanOrEqual(2);
      expect(
        entry.operator.skills.every((skill) =>
          skill.summary.startsWith("七级"),
        ),
      ).toBe(true);
      expect(entry.operator.stats?.hp).toBeGreaterThan(0);
    }
    const amiya = operators.find((entry) => entry.id === "operator-amiya")!;
    expect(amiya.operator.stats).toMatchObject({
      hp: 1480,
      atk: 612,
      def: 121,
      res: 20,
    });
    expect(amiya.operator.stats?.basis).toContain("80级");
    expect(
      amiya.sections.some((section) => section.body.includes("升变")),
    ).toBe(true);
    const reed = operators.find((entry) => entry.id === "operator-reed")!;
    expect(reed.operator.stats?.res).toBe(0);
    expect(reed.operator.talents.join(" ")).toContain("20");
  });

  it("keeps birthplace, affiliation, and geographic anchors distinct", () => {
    const texas = operators.find((entry) => entry.id === "operator-texas")!;
    expect(texas.operator.birthplace).toBe("哥伦比亚");
    expect(texas.operator.affiliation).toBe("企鹅物流");
    expect(texas.relationships).toContainEqual({
      target: "columbia",
      label: "出身地",
    });
    expect(operators.every((entry) => entry.regionId === undefined)).toBe(true);
  });

  it("keeps alters, same-name enemies, and originium lore as separate entities", () => {
    expect(entryById["operator-specter"].kind).toBe("operator");
    expect(entryById["operator-specter-unchained"].kind).toBe("operator");
    expect(entryById["operator-specter"].related).toContain(
      "operator-specter-unchained",
    );
    expect(entryById["enemy-mudrock"].name).toBe("泥岩（敌方）");
    expect(entryById["enemy-crownslayer"].kind).toBe("enemy");
    expect(entryById.originium.kind).toBe("concept");
    expect(entryById["item-originite-prime"].kind).toBe("item");
  });

  it("does not fold enemy phases or innate buffs into level-zero base stats", () => {
    const patriot = enemies.find((entry) => entry.id === "enemy-patriot")!;
    expect(patriot.enemy.stats).toMatchObject({
      hp: 45000,
      atk: 1600,
      def: 500,
      res: 45,
    });
    expect(patriot.enemy.stages).toHaveLength(3);
    expect(patriot.enemy.stats?.basis).toContain("级别0");
    expect(patriot.enemy.stats?.basis).toContain("不含天赋");
    const firstToTalk = enemies.find(
      (entry) => entry.id === "enemy-first-to-talk",
    )!;
    expect(firstToTalk.enemy.rank).toBe("精英");
    expect(
      enemies.find((entry) => entry.id === "enemy-monster")!.enemy.stats?.atk,
    ).toBe(0);
  });

  it("preserves exact guaranteed quantities along the complete orirock chain", () => {
    const expected = [
      ["item-orirock-cube", "item-orirock", 3, 100],
      ["item-orirock-cluster", "item-orirock-cube", 5, 200],
      ["item-orirock-concentration", "item-orirock-cluster", 4, 300],
    ] as const;
    for (const [productId, ingredientId, quantity, cost] of expected) {
      const product = items.find((entry) => entry.id === productId)!;
      expect(product.item.recipe?.quantity).toBe(1);
      expect(product.item.recipe?.cost).toBe(cost);
      expect(product.item.recipe?.ingredients).toHaveLength(1);
      expect(product.item.recipe?.ingredients[0]).toMatchObject({
        entryId: ingredientId,
        quantity,
      });
      expect(entryById[ingredientId].related).toContain(productId);
    }
  });

  it("links out to real source pages for ingredients outside the selection", () => {
    const steel = items.find((entry) => entry.id === "item-d32-steel")!;
    expect(
      steel.item.recipe?.ingredients.map((ingredient) => ingredient.name),
    ).toEqual(["三水锰矿", "五水研磨石", "RMA70-24"]);
    for (const product of items) {
      for (const ingredient of product.item.recipe?.ingredients ?? []) {
        expect(ingredient.quantity).toBeGreaterThan(0);
        if (ingredient.entryId)
          expect(entryById[ingredient.entryId]?.kind).toBe("item");
        else expect(new URL(ingredient.url!).hostname).toBe("prts.wiki");
      }
    }
  });

  it("labels all six event objects as historical without implying live availability", () => {
    const historical = items.filter((entry) => entry.item.historical);
    expect(historical).toHaveLength(6);
    for (const entry of historical) {
      expect(
        entry.sections.find((section) => section.title === "历史记录")?.body,
      ).toContain("不表示当前");
      expect(entry.item.category).toBe("活动道具");
    }
  });

  it("keeps spoiler text outside ordinary search while exposing English and type searches", () => {
    expect(
      searchEntries("继承的责任", false).map((entry) => entry.id),
    ).not.toContain("operator-amiya");
    expect(
      searchEntries("继承的责任", true).map((entry) => entry.id),
    ).toContain("operator-amiya");
    expect(
      searchEntries("ＥＸＵＳＩＡＩ", false, "operator").map(
        (entry) => entry.id,
      ),
    ).toContain("operator-exusiai");
    expect(searchEntries("", false, "world")).toHaveLength(39);
    expect(
      visibleSections(entryById["operator-amiya"], false).every(
        (section) => !section.spoiler,
      ),
    ).toBe(true);
  });

  it("searches visible gameplay records, identifiers, biography facts and recipe ingredients", () => {
    const matches = (query: string, kind: string) =>
      searchEntries(query, false, kind).map((entry) => entry.id);
    expect(matches("B1", "enemy")).toContain("enemy-originium-slug");
    expect(matches("真银斩", "operator")).toContain("operator-silverash");
    expect(matches("哥伦比亚", "operator")).toContain("operator-texas");
    expect(matches("突破能力有技能周期", "enemy")).toContain(
      "enemy-crownslayer",
    );
    expect(matches("第三形态", "enemy")).toContain("enemy-quintus");
    expect(matches("三水锰矿", "item")).toContain("item-d32-steel");
  });

  it("does not reveal Texas's hidden regional relationship through previews or search", () => {
    const texas = entryById["operator-texas"];
    expect(texas.relationships).toContainEqual({
      target: "siracusa",
      label: "过往关联",
      spoiler: true,
    });
    expect(texas.summary).not.toContain("叙拉古");
    expect(
      searchEntries("叙拉古", false, "operator").map((entry) => entry.id),
    ).not.toContain(texas.id);
    // Relationship metadata itself is excluded from the full-text index.
    expect(
      searchEntries("过往关联", true, "operator").map((entry) => entry.id),
    ).not.toContain(texas.id);
  });

  it("has named relationship edges that resolve without fabricated map positions", () => {
    for (const entry of catalogueEntries) {
      // Materials with external-only ingredients need not invent a local faction relation.
      if (entry.kind !== "item")
        expect(entry.relationships?.length).toBeGreaterThan(0);
      for (const relationship of entry.relationships ?? []) {
        expect(entryById[relationship.target]).toBeDefined();
        expect(relationship.label.length).toBeGreaterThan(0);
      }
      expect(entry.regionId).toBeUndefined();
    }
  });
});

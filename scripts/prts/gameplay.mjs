import { clean, parseTemplates } from "./wikitext.mjs";

/** Keep mechanical effects while excluding event scripts and collectible flavour text. */
export function gameplayFields(page, templates, tables) {
  const fields = {};
  const relics = templates.filter(
    (t) => t.name === "收藏品" && t.params["名称"],
  );
  if (relics.length)
    fields.收藏品 = relics.map(({ params: p }) =>
      Object.fromEntries(
        ["名称", "主题", "ID", "效果", "售价", "条件", "备注"]
          .filter((key) => p[key])
          .map((key) => [key, clean(p[key])]),
      ),
    );
  const coins = templates.filter(
    (t) => t.name === ":岁的界园志异/通宝" && t.params["名称"],
  );
  if (coins.length)
    fields.通宝 = coins.map(({ params: p }) =>
      Object.fromEntries(
        ["名称", "币制", "效果", "条件", "获取"]
          .filter((key) => p[key])
          .map((key) => [key, clean(p[key])]),
      ),
    );
  const events = templates.filter(
    (t) => t.name === "ISEvent/scene" && t.params["选项"],
  );
  if (events.length)
    fields.事件选项效果 = events
      .map(({ params: p }) => ({
        名称: clean(p["3"] ?? ""),
        类型: clean(p.etype ?? ""),
        区域: clean(p.floor ?? ""),
        选项: parseTemplates(p["选项"])
          .filter((t) => t.name === "ISEvent/choose")
          .map(({ params: q }) =>
            Object.fromEntries(
              Object.entries(q)
                .filter(([key]) => /^desc\d+$/.test(key))
                .map(([key, value]) => [
                  key === "desc1" ? "效果" : `条件说明${key.slice(4)}`,
                  clean(value),
                ]),
            ),
          )
          .filter((r) => Object.keys(r).length),
      }))
      .filter((r) => r.选项.length);
  const oldEvents = templates.filter((t) => t.name === "集成战略事件");
  if (oldEvents.length)
    fields.事件选项效果 = oldEvents.map((t, index) => ({
      名称: `事件 ${index + 1}`,
      选项: parseTemplates(t.params["选项"] ?? "")
        .filter((t) => t.name === "集成战略事件/选项")
        .map(({ params: p }) => ({
          效果: clean(p["选项"] ?? ""),
          道具: clean(p["道具"] ?? ""),
        })),
    }));
  const rivals = templates.filter((t) => t.name === "EnemyDataMini");
  if (rivals.length)
    fields.参赛单位 = rivals.map(({ params: p }) =>
      Object.fromEntries(
        Object.entries(p)
          .filter(([key]) => !/^(importcss|描述|图标|图片)$/.test(key))
          .map(([key, value]) => [key, clean(value)]),
      ),
    );
  const strategies = templates.filter(
    (t) => t.name === ":卫戍协议/策略" && t.params["策略"],
  );
  if (strategies.length)
    fields.策略 = strategies.map(({ params: p }) =>
      Object.fromEntries(
        ["发起人", "策略", "血量", "效果", "解锁条件", "备注"]
          .filter((key) => p[key])
          .map((key) => [key, clean(p[key])]),
      ),
    );
  if (page.title === "后勤技能一览")
    fields.后勤技能 = (tables.building_skill2 ?? []).map((row) => ({
      技能名: row.name,
      设施: row.room,
      效果: clean(row.description ?? ""),
    }));
  if (page.title === "分支一览")
    fields.职业分支 = [
      ...new Map(
        (tables.chara ?? []).map((row) => [
          `${row.profession}:${row.subProfession}`,
          { 职业: row.profession, 分支: row.subProfession },
        ]),
      ).values(),
    ].filter((row) => row.分支);
  return fields;
}

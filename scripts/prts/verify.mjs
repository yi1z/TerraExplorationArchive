import assert from "node:assert/strict";
import path from "node:path";
import { PUBLIC, ROOT, json } from "./api.mjs";
import {
  parseTemplates,
  splitTop,
  clean,
  parseTables,
  tableCell,
  rawContent,
} from "./wikitext.mjs";
import { gameplayFields } from "./gameplay.mjs";
import { taskMapRules } from "./support.mjs";

assert.deepEqual(splitTop("a|{{color|red|x=y}}|[[target|label]]"), [
  "a",
  "{{color|red|x=y}}",
  "[[target|label]]",
]);
const nested = parseTemplates(
  "{{技能|名=A|描述={{color|red|x=y}}|图=<tabber>甲=a\n|-|\n乙=b</tabber>|费用=0}}",
)[0];
assert.equal(nested.params["描述"], "{{color|red|x=y}}");
assert.equal(nested.params["费用"], "0");
assert.match(nested.params["图"], /乙=b/);
assert.equal(clean("攻击速度{{+|30|{{color|#0098DC|+30}}}}"), "攻击速度+30");
assert.equal(clean("{{变动数值|150|+}}"), "150");
assert.equal(clean("{{变动数值lite|up|蓝|60%}}"), "60%");
assert.equal(clean("{{材料消耗|D32钢|4}}"), "D32钢 × 4");
assert.equal(clean("{{道具图标|合成玉|100|50px}}"), "合成玉 × 100");
assert.equal(
  clean("{{关卡报酬|飞行数据记录芯片|三星获得|60px|n=30}}"),
  "飞行数据记录芯片 × 30（三星获得）",
);
assert.equal(clean("效果{{fa|plus-circle|color=blue}}增加"), "效果增加");
assert.equal(clean("效果{{mdi|plus-circle}}增加"), "效果增加");
assert.deepEqual(
  taskMapRules(
    '<div class="node_r2_score"><svg></svg>20</div><div class="text_warp"><div class="a">指标一</div><div class="b">攻击力提升30%</div></div>',
  ),
  [{ 名称: "指标一", 效果: "攻击力提升30%", 分值: 20 }],
);
assert.deepEqual(
  taskMapRules(
    '<div class="a" style="color:red"><b>任务一</b></div><div class="b">携带指定指标</div></div><div style="position:absolute;"><div class="a" style="color:red"><b>指标二</b></div><div class="b">生命+30%</div></div><div class="node_r2_score"><svg></svg>10</div>',
  ),
  [
    { 名称: "任务一", 效果: "携带指定指标" },
    { 名称: "指标二", 效果: "生命+30%", 分值: 10 },
  ],
);
assert.equal(
  tableCell("[[文件:任务 印章.png|20px]][[文件:任务 印章.png|20px]]"),
  "任务印章 × 2",
);
assert.equal(tableCell("[[文件:精英 2.png|x20px|link=]] Lv.40"), "精英2 Lv.40");
assert.equal(tableCell("[[文件:集成战略_5_层级_3.png|x25px|link=]]"), "第3层");
assert.equal(clean("改变<阻挡路线><br/>规则"), "改变<阻挡路线>\n规则");
assert.equal(clean("[[文件:道具.png|link=龙门币]]×40"), "龙门币×40");
const polluted = parseTemplates("{{A|__proto__=safe|constructor=also-safe}}")[0]
  .params;
assert.equal(Object.getPrototypeOf(polluted), null);
assert.equal(polluted.__proto__, "safe");
const comment = "<!-- {{ignored|x=y}} -->{{真实|值=1}}";
assert.equal(parseTemplates(comment).length, 1);
assert.equal(parseTemplates(comment)[0].start, comment.indexOf("{{真实"));
assert.equal(
  parseTemplates("{{A|表={{{!}}x{{!}}}\n}}\n{{道具信息|名称=材料}}").at(-1)
    .name,
  "道具信息",
);
const table = parseTables(
  "==奖励==\n{|\n!材料!!数量\n|-\n|{{材料消耗|D32钢|4}}||4\n|}",
)[0];
assert.equal(table.title, "奖励");
assert.equal(table.rows[1].length, 2);
assert.equal(parseTables("|}\n{|\n|A\n|}").length, 1);
assert.equal(parseTables("|}\n{|\n|A\n|}").warnings.length, 1);
assert.equal(
  parseTables("::{|\n!等级!!希望\n|-\n|2||4\n|}")[0].rows[1][1],
  "4",
);
const eventRules = gameplayFields(
  { title: "示例/事件一览" },
  parseTemplates(
    "{{ISEvent/scene|开始|图片|测试事件|秘密剧情正文|选项={{ISEvent/choose|simple|剧情选项对白|gold|desc1=获得4源石锭|dest=1}}}}",
  ),
  {},
);
assert.equal(eventRules.事件选项效果[0].选项[0].效果, "获得4源石锭");
assert.ok(
  !JSON.stringify(eventRules).includes("秘密剧情正文") &&
    !JSON.stringify(eventRules).includes("剧情选项对白"),
);

const manifest = await json(path.join(PUBLIC, "manifest.json"));
assert.ok(
  manifest.coverage.path.includes(`/snapshots/${manifest.snapshotId}/`),
  "Coverage belongs to the immutable snapshot",
);
const coverage = await json(path.resolve("public", manifest.coverage.path));
assert.deepEqual(
  coverage.counts,
  manifest.counts,
  "Coverage and manifest counts match",
);
const records = [];
for (const shard of manifest.detailShards) {
  const data = await json(path.resolve("public", shard.path));
  assert.equal(data.records.length, shard.count, `Detail count ${shard.path}`);
  for (const record of data.records) {
    assert.ok(shard.ids.includes(record.id));
    records.push(record);
  }
}
const ids = new Set(records.map((record) => record.id));
assert.equal(ids.size, records.length, "Unique canonical IDs");
assert.equal(
  records.length,
  Object.values(manifest.counts).reduce((a, b) => a + b, 0),
);
const pendingWorld = await json(
  path.join(ROOT, "editorial-world-pending.json"),
);
const registry = await json(path.join(ROOT, "embedded-identities.json"));
assert.equal(
  new Set(pendingWorld.map((row) => row.id)).size,
  pendingWorld.length,
  "Every embedded source identity has a separate route",
);
for (const row of pendingWorld)
  assert.equal(registry.identities[row.identityKey], row.id);
assert.equal(
  pendingWorld.filter(
    (row) => row.name === "神明" && row.introType === "剧情角色",
  ).length,
  3,
);
assert.equal(
  pendingWorld.filter(
    (row) => row.name === "巴顿" && row.introType === "剧情角色",
  ).length,
  2,
);
assert.ok(
  !records.some((record) => record.source.title === "卫戍协议/策略"),
  "Implementation demonstrations are not game facts",
);
assert.ok(
  records.some(
    (record) =>
      record.source.title === "崔林特尔梅之金" && record.kind === "event",
  ),
  "An event with a transclusion fragment is still an event",
);
const allIds = [];
for (const shard of manifest.indexShards) {
  const data = await json(path.resolve("public", shard.path));
  assert.equal(data.records.length, shard.count);
  allIds.push(...data.records.map((record) => record.id));
}
assert.deepEqual(
  [...new Set(allIds)].sort(),
  [...ids].sort(),
  "Index/detail parity",
);
const text = JSON.stringify(records);
assert.ok(
  !text.includes('"rawParams"'),
  "Raw technical template duplicate is not public",
);
assert.ok(
  !text.includes("hiddenFaction") && !text.includes('"隐藏势力"'),
  "Hidden faction is not public",
);
assert.ok(!text.includes('"文本数据"'), "Full script is not public");
const search = new Map();
for (const shard of manifest.searchShards)
  for (const record of (await json(path.resolve("public", shard.path))).records)
    search.set(record.id, record);
for (const record of records) {
  assert.ok(
    record.name && record.source.url.startsWith("https://"),
    `Named and sourced ${record.id}`,
  );
  assert.equal(
    new Set(
      record.relationships.map(
        (r) => `${r.target}:${r.label}:${Boolean(r.spoiler)}`,
      ),
    ).size,
    record.relationships.length,
    `Unique relations ${record.id}`,
  );
  for (const relation of record.relationships)
    assert.ok(
      ids.has(relation.target),
      `Valid relation ${record.id}→${relation.target}`,
    );
  for (const section of record.sections.filter(
    (section) => section.spoiler && section.body.length > 12,
  )) {
    assert.ok(
      search.get(record.id)?.spoilerText.includes(section.body),
      `Spoiler narrative searchable when enabled ${record.id}`,
    );
    assert.ok(
      !search
        .get(record.id)
        ?.text.includes(section.body.normalize("NFKC").toLowerCase()),
      `Spoiler narrative not in ordinary index ${record.id}`,
    );
  }
}
const amiya = records.find((record) => record.id === "operator-amiya");
assert.equal(amiya.fields.identity["稀有度"], 5);
assert.equal(amiya.fields.skills[0].levels.length, 10);
assert.equal(amiya.fields.skills[0].levels[9].label, "专精三");
assert.equal(amiya.fields.skills[0].levels[0].description, "攻击速度+30");
assert.equal(amiya.fields.skills[0].recovery, "自动回复");
assert.ok(amiya.fields.baseSkills.length);
let inheritedCases = 0;
for (const enemy of records.filter(
  (record) => record.kind === "enemy" && record.levels?.length > 1,
)) {
  const source = await json(
    path.join(ROOT, "raw/pages", `${enemy.source.pageId}.json`),
  );
  const levels = parseTemplates(rawContent(source)).filter(
    (t) => t.name === "敌人信息/levelcontent",
  );
  let inherited = {};
  levels.forEach((template, index) => {
    inherited = template.params.reindex
      ? { ...template.params }
      : { ...inherited, ...template.params };
    for (const [key, value] of Object.entries(enemy.levels[index].fields))
      assert.equal(
        value,
        clean(inherited[key]),
        `Enemy LEVEL inheritance ${enemy.id}/${index}/${key}`,
      );
    if (index && !template.params.reindex) inheritedCases++;
  });
}
assert.ok(
  inheritedCases > 100,
  "Validated inherited LEVEL fields against raw templates",
);
for (const module of records.filter((record) => record.kind === "module")) {
  assert.equal(module.levels.length, 3);
  assert.ok(!("hp" in module.fields));
  assert.ok(
    module.levels.every((level) => !String(level.fields["攻击"]).includes(";")),
  );
  for (const level of module.levels)
    for (const field of ["特性调整", "天赋调整"])
      if (level.fields[field]) {
        assert.ok(
          search
            .get(module.id)
            .text.includes(level.fields[field].normalize("NFKC").toLowerCase()),
          `Module level effects are searchable ${module.id}`,
        );
      }
}
assert.equal(
  records.find((r) => r.id === "prts-module-bff556d888b5136d").narrativeStatus,
  "curated",
  "Duplicate Cargo rows do not erase authored content",
);
assert.ok(
  !records.some(
    (record) =>
      record.kind === "stage" &&
      record.artworkRefs?.some((art) => art.url?.endsWith("/st_10-01.png")),
  ),
  "Noncombat story nodes do not invent a default battle map",
);
assert.ok(
  records.find((record) => record.id === "prts-mode-55284").fields.任务指标
    .length > 20,
  "Task-map widget rules were parsed",
);
const penguinTheme = records.find(
  (record) => record.id === "prts-furniture-theme-10135",
);
assert.equal(
  penguinTheme.fields.家具清单.length,
  14,
  "Furniture themes contain their source item list",
);
assert.equal(penguinTheme.fields.氛围总计["氛围值总计"], "5000");
assert.equal(
  penguinTheme.relationships.filter((relation) => relation.label === "主题家具")
    .length,
  14,
);
assert.ok(
  penguinTheme.sections.some(
    (section) =>
      section.sourceKind === "source" && section.body.includes("企鹅物流"),
  ),
);
const curtain = records.find((record) => record.id === "prts-furniture-10125");
assert.equal(curtain.fields.identity["稀有度"], "3");
assert.equal(
  curtain.templates.find((template) => template.name === "家具信息").params[
    "稀有度"
  ],
  "3",
);
assert.equal(
  records.find((record) => record.id === "prts-outfit-c9989ec4e7446450").fields[
    "时装系列"
  ],
  "斗争血脉/I",
);
assert.equal(
  records.find((record) => record.id === "prts-outfit-49c20c1b203d5b5a").fields[
    "时装系列"
  ],
  "0011/飙系列/IV",
);
const loneTrail = records.find((record) => record.id === "prts-event-53942");
const outfits = records.filter((record) => record.kind === "outfit");
assert.equal(outfits.length, 520);
assert.ok(
  outfits.every(
    (record) =>
      record.acquisitionHistory?.length &&
      record.structuralStatus === "complete",
  ),
);
const offers = outfits.flatMap((record) => record.acquisitionHistory);
assert.equal(
  offers.length,
  1499,
  "All outfit acquisition, rerun and review records are retained",
);
assert.ok(
  offers.every((offer) => offer.source.revisionId && offer.acquisition),
);
assert.ok(
  offers
    .filter((offer) => offer.priceStatus === "not-stated")
    .every((offer) => offer.amount === null && !offer.amountText),
  "Unstated prices never become zero",
);
assert.ok(
  offers
    .filter((offer) => offer.currencyBasis === "template-default")
    .every((offer) => offer.currencySource?.revisionId),
  "Default currency is backed by a versioned template",
);
assert.ok(
  offers.some((offer) => offer.amountText === "18→15" && offer.amount === null),
  "Price transitions are not collapsed into one guessed price",
);
const alternative = offers.find(
  (offer) =>
    offer.alternativeGroup &&
    offer.currency === "高级凭证" &&
    offer.amount === 40,
);
assert.ok(
  alternative &&
    offers.some(
      (offer) =>
        offer.alternativeGroup === alternative.alternativeGroup &&
        offer.currency === "通用凭证" &&
        offer.amount === 400,
    ),
);
assert.ok(
  loneTrail.fields.tables.length > 3 &&
    loneTrail.relationships.some((relation) => relation.label === "活动关卡"),
);
assert.equal(
  loneTrail.structuralStatus,
  "partial",
  "Unparsed dynamic event shop is explicitly incomplete",
);
assert.equal(records.find((record) => record.id === "trimounts").kind, "city");
for (const id of Object.keys(manifest.legacyAliases))
  assert.ok(ids.has(id), `Legacy ID ${id}`);
console.log(
  `Verified balanced parser, privacy, ${records.length} records, legacy IDs, relationships, index/detail/search parity, spoiler gating, ${inheritedCases} inherited enemy LEVEL cases, module levels, and Amiya's 10 skill levels.`,
);

import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ROOT, PUBLIC, json, save, digest, wiki } from "./api.mjs";
import {
  parseTemplates,
  parseTables,
  tableCell,
  clean,
  rawContent,
  artworkRefs,
} from "./wikitext.mjs";
import { expandEmbedded } from "./embedded.mjs";
import {
  collectNarrativeSources,
  collectProfileSources,
} from "./narrative-sources.mjs";
import { gameplayFields } from "./gameplay.mjs";
import { taskMapRules } from "./support.mjs";
import {
  applyAuthoredRelationships,
  applyReviewedAmendments,
  linkPotentialTokens,
} from "./amendments.mjs";

const dictionary = {
  operator: "干员",
  enemy: "敌人",
  item: "道具",
  world: "世界观",
  stage: "关卡",
  story: "剧情",
  event: "活动",
  module: "模组",
  outfit: "时装",
  furniture: "家具",
  "furniture-theme": "家具主题",
  mode: "玩法",
  mechanic: "机制",
};
const technical =
  /^(CharinfoV2|召唤物(?:信息|天赋|技能)|装置(?:信息|技能)|属性|技能\d*|技能升级材料|天赋列表\d*|潜能提升|精英化\d*|模组|道具信息|道具配方\/.*|道具价格|家具信息.*|家具主题信息.*|.*关卡信息|关卡装置|编队单位|敌方情报.*|敌人信息\/.*|活动信息(?:\/info)?|.*活动信息|基建技能.*|后勤技能.*|保全派驻信息(?:\/Ver\d+)?|保全派驻定向导能元件|集成战略道具|危机合约词条|测试指标|合约详情|沙盘推演|商店列表|充值组合包\/.*|寻访模拟器\d*|关卡报酬|活动里程碑2|活动信赖获取提升干员)$/;
const privateParam =
  /^(文本数据|剧情|故事|故事内容|基础信息|介绍|描述|人物介绍|档案资料|档案[一二三四五六123456]|精英\d介绍|时装\d+介绍|剧情简介|履历|隐藏势力|hiddenFaction)$/;
function publicTemplates(templates) {
  return templates
    .filter((t) => t.depth === 0 && technical.test(t.name))
    .map(({ name, params: originalParams }) => {
      const rawParams = Object.fromEntries(
        Object.entries(originalParams).filter(
          ([key]) =>
            !privateParam.test(key) &&
            !/^(人物档案|语音|台词|模组故事)/.test(key),
        ),
      );
      if (/^保全派驻信息/.test(name)) delete rawParams["3"];
      const params = Object.fromEntries(
        Object.entries(rawParams).map(([key, value]) => [
          key,
          key === "稀有度" && /^\d+$/.test(value)
            ? String(Number(value) + 1)
            : clean(value),
        ]),
      );
      if (name === "属性") {
        const labels = {
          hp: "生命上限",
          atk: "攻击",
          def: "防御",
          res: "法术抗性",
          cost: "部署费用",
          redeploy: "再部署",
          buff: "天赋",
        };
        const types = (rawParams["潜能类型"] ?? "").split(",");
        const changes = (rawParams["潜能"] ?? "").split(",");
        params["潜能提升"] = types
          .filter(Boolean)
          .map(
            (type, index) =>
              `${labels[type] ?? type} ${changes[index] || "效果增强"}`,
          )
          .join("；");
        delete params["潜能"];
        delete params["潜能类型"];
        for (const key of Object.keys(params))
          if (/^模组\d+数据$/.test(key)) delete params[key];
      }
      return { name, params };
    });
}
export function loadLegacy() {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const require = (specifier) =>
      load(path.resolve(path.dirname(filename), specifier + ".ts"));
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require,
      URL,
      Object,
      Set,
      Map,
    });
    cache.set(filename, module.exports);
    return module.exports;
  }
  return load(path.resolve("src/data/archive.ts"));
}
function chooseKind(page, templates) {
  if (
    /\/(?:sandbox\d*(?:\/|$)|doc$|devdata$|data$|extra$|[^/]*图标$|[^/]*预览$|PRTS[^/]*记录$)/i.test(
      page.title,
    )
  )
    return null;
  const names = templates.map((t) => t.name);
  if (names.includes("CharinfoV2")) return "operator";
  if (names.some((n) => n.startsWith("敌人信息/common"))) return "enemy";
  if (names.some((n) => /关卡信息$/.test(n))) return "stage";
  if (names.some((n) => /家具信息/.test(n))) return "furniture";
  if (names.includes("道具信息")) return "item";
  if (page.kinds.includes("story") || names.includes("剧情模拟器"))
    return "story";
  if (
    page.kinds.includes("mode") &&
    !names.some((name) => /活动信息/.test(name))
  )
    return "mode";
  return [
    "operator",
    "enemy",
    "item",
    "story",
    "stage",
    "furniture",
    "furniture-theme",
    "event",
    "world",
    "mode",
    "mechanic",
  ].find((kind) => page.kinds.includes(kind));
}
const first = (templates, pattern) =>
  templates.find((template) => pattern.test(template.name))?.params ?? {};
function releaseStatus(page, raw, cargo) {
  const categories = [
    ...(page.categories ?? []),
    ...(raw?.categories ?? []).map((c) => c.title.replace(/^分类:/, "")),
  ];
  if (
    categories.some((c) => /内测|测试/.test(c)) ||
    /测试道具/.test(cargo?.itemCategory ?? "")
  )
    return "test";
  if (
    categories.some((c) => /未实装|尚未实装/.test(c)) ||
    cargo?.itemCategory === "未实装道具"
  )
    return "unreleased";
  if (categories.some((c) => /复刻|往期|历史/.test(c))) return "historical";
  return "released";
}
function fact(label, value) {
  return value === undefined || value === null || value === ""
    ? null
    : { label, value: clean(Array.isArray(value) ? value.join(" · ") : value) };
}
function sourceFor(page, raw) {
  const revision = raw?.revisions?.[0];
  return {
    title: page.title,
    url: wiki(page.title),
    pageId: page.pageId,
    ...(revision
      ? { revisionId: revision.revid, timestamp: revision.timestamp }
      : {}),
    publisher: "PRTS 玩家社区 / 游戏资料",
  };
}
function valuesFor(params, keys) {
  return keys.map((key) => fact(key, params[key])).filter(Boolean);
}
function structuralIssues(record) {
  if (!record.source.revisionId && !record.legacyId) return ["来源版本未缓存"];
  if (record.fields.parseWarnings?.length)
    return ["部分表格依赖外层模板；已保留可解析单元格，其余内容尚待结构化"];
  const has = (name) =>
    record.templates.some((template) => template.name === name);
  if (record.kind === "operator")
    return has("CharinfoV2") || has("召唤物信息") || record.legacyId
      ? []
      : ["缺少干员或召唤物属性模板"];
  if (record.kind === "enemy")
    return record.levels?.length || record.fields.variants?.length
      ? []
      : ["缺少敌人属性级别"];
  if (record.kind === "item")
    return has("道具信息") || record.legacyId || record.fields.variants?.length
      ? []
      : ["缺少道具信息模板"];
  if (record.kind === "stage")
    return record.fields.variants?.length ? [] : ["缺少关卡数值模板"];
  if (record.kind === "furniture")
    return has("家具信息") ? [] : ["缺少家具信息模板"];
  if (record.kind === "furniture-theme")
    return record.fields.家具清单?.length && record.fields.tables?.length
      ? []
      : ["主题家具清单或氛围数值尚未结构化"];
  if (record.kind === "event") {
    const issues = [];
    if (!record.templates.some((t) => /活动信息/.test(t.name)))
      issues.push("活动页面未使用结构化活动信息模板");
    if (!record.fields.tables?.length)
      issues.push("活动任务、关卡或奖励明细尚未结构化");
    if (record.fields.待核验项目?.length)
      issues.push("活动含动态商店或组件；其完整内容尚未独立对账");
    return issues;
  }
  if (record.kind === "outfit")
    return record.acquisitionHistory?.length
      ? (record.acquisitionIssues ?? [])
      : ["已整理时装身份与系列；获取渠道及售价尚未对账"];
  if (["mode", "mechanic"].includes(record.kind)) {
    if (record.fields.任务指标)
      return ["已整理任务与指标；图中指标之间的解锁连线尚未结构化"];
    if (record.facets.type?.includes("寻访模拟"))
      return ["已缓存模拟索引；正式寻访概率、范围与保底数据尚待独立对账"];
    return record.templates.length ||
      record.fields.tables?.length ||
      record.fields.gameplay
      ? []
      : ["规则正文或动态子模块尚未结构化"];
  }
  return [];
}
function textValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(textValues);
  return [];
}
export function buildRecord(page, raw, tables, legacyMap) {
  const text = rawContent(raw),
    templates = parseTemplates(text);
  // Main-namespace helper pages contain demonstration values, including jokes.
  // Their transclusions are parsed on actual game pages, never as game entities.
  if (
    /<includeonly>[\s\S]*<\/includeonly>/i.test(text) &&
    !templates.some((template) =>
      /^(CharinfoV2|道具信息|家具信息|敌人信息\/common|.*关卡信息|.*活动信息)(?:\/info)?$/.test(
        template.name,
      ),
    )
  )
    return null;
  const kind = chooseKind(page, templates);
  if (!kind) return null;
  const source = sourceFor(page, raw);
  const baseRow =
    (
      tables[
        kind === "operator"
          ? "chara"
          : kind === "item"
            ? "item"
            : kind === "story"
              ? "story"
              : kind === "furniture-theme"
                ? "furniture_themes"
                : ""
      ] ?? []
    ).find((r) => Number(r.pageId) === page.pageId) ?? {};
  const candidate = legacyMap.get(page.title);
  const legacy =
    candidate &&
    (candidate.kind === kind ||
      (["country", "city", "faction", "concept"].includes(candidate.kind) &&
        kind === "world" &&
        page.title.endsWith("/" + candidate.name)))
      ? candidate
      : null;
  const status = releaseStatus(page, raw, baseRow);
  const record = {
    id: legacy?.id ?? `prts-${kind}-${page.pageId}`,
    kind,
    name: baseRow.cn ?? baseRow.name ?? page.title.replace(/^泰拉大典:/, ""),
    en: baseRow.en ?? "",
    aliases: [
      ...new Set(
        [
          page.title,
          baseRow.charId,
          baseRow.itemId,
          baseRow.en,
          baseRow.jp,
        ].filter(Boolean),
      ),
    ],
    summary: "",
    summaryStatus: "missing",
    tags: [],
    releaseStatus: status,
    source,
    facts: [],
    sections: [],
    relationships: [],
    fields: {},
    templates: publicTemplates(templates),
    artworkRefs: artworkRefs(text),
    facets: {},
    missingFacts: [],
  };
  if (!raw?.revisions?.length)
    record.missingFacts.push(
      "原始页面尚未下载成功；仅保留已获得的结构化索引。",
    );
  if (kind === "operator" && page.categories.includes("召唤物")) {
    const info = first(templates, /^召唤物信息$/);
    record.name = info["中文名称"] ?? record.name;
    record.en = info["外文名称"] ?? "";
    record.fields = {
      identity: Object.fromEntries(
        Object.entries(info)
          .filter(([key]) => !/头像|tabber|^Character$/.test(key))
          .map(([key, value]) => [key, clean(value)]),
      ),
      talents: first(templates, /^召唤物天赋$/),
    };
    record.summary = `${record.name}是${info["持有者"] ?? ""}使用的召唤物。${info["部署位置"] ? `部署位置为${info["部署位置"]}。` : ""}`;
    record.summaryStatus = Object.keys(info).length ? "source" : "missing";
    record.facets = { type: ["召唤物"] };
    record.facet = "召唤物";
    record.tags = ["召唤物", info["持有者"]].filter(Boolean);
    record.facts = valuesFor(info, [
      "持有者",
      "使用条件",
      "部署位置",
      "部署费用",
      "阻挡数",
      "再部署时间",
      "部署占用数",
    ]);
    if (info["特性"])
      record.sections.push({
        title: "特性",
        body: clean(info["特性"]),
        sourceKind: "gameplay",
      });
  } else if (kind === "operator") {
    const info = first(templates, /^CharinfoV2$/),
      stats = first(templates, /^属性$/);
    const data =
      (tables.chara_data ?? []).find((r) => Number(r.pageId) === page.pageId) ??
      {};
    const extra =
      (tables.chara_extra_info ?? []).find(
        (r) => Number(r.pageId) === page.pageId,
      ) ?? {};
    const profession = info["职业"] ?? baseRow.profession,
      branch = info["分支"] ?? baseRow.subProfession;
    const rarity = Number(info["稀有度"] ?? baseRow.rarity) + 1;
    record.tags = [
      profession,
      branch,
      Number.isFinite(rarity) ? `${rarity}星` : null,
      baseRow.nation,
      baseRow.org,
      baseRow.team,
    ].filter(Boolean);
    record.summary = `${record.name}是${Number.isFinite(rarity) ? `${rarity}星` : ""}${profession ?? ""}干员${branch ? `，分支为${branch}` : ""}。${baseRow.position ? `可部署于${baseRow.position}。` : ""}`;
    record.summaryStatus = "source";
    record.facts = [
      fact("职业", profession),
      fact("分支", branch),
      fact("稀有度", Number.isFinite(rarity) ? `${rarity}星` : null),
      fact("所属国家", baseRow.nation),
      fact("所属组织", baseRow.org),
      fact("所属团队", baseRow.team),
      fact("种族", extra.race),
      fact("出身地", extra.birthPlace),
      fact("生日", extra.dateOfBirth),
      fact("身高", extra.height),
    ].filter(Boolean);
    const potentialLabels = {
      hp: "生命上限",
      atk: "攻击",
      def: "防御",
      res: "法术抗性",
      cost: "部署费用",
      redeploy: "再部署",
      buff: "天赋",
    };
    const potentialTypes = (
      stats["潜能类型"] ??
      data.potential?.split("`")[0] ??
      ""
    ).split(",");
    const potentialValues = (
      stats["潜能"] ??
      data.potential?.split("`")[1] ??
      ""
    ).split(",");
    const potential = potentialTypes.filter(Boolean).map((type, i) => ({
      属性: potentialLabels[type] ?? type,
      变化: potentialValues[i] || "天赋效果增强",
    }));
    const trust = (data.trust ?? "").split(",");
    record.fields = {
      identity: {
        稀有度: rarity,
        职业: profession,
        分支: branch,
        所属国家: baseRow.nation,
        所属组织: baseRow.org,
        所属团队: baseRow.team,
        种族: extra.race,
        出身地: extra.birthPlace,
        生日: extra.dateOfBirth,
        身高: extra.height,
        性别: extra.sex,
        战斗经验: extra.combatExperience,
      },
      attributes: {
        ...Object.fromEntries(
          Object.entries(stats).filter(
            ([key]) =>
              !privateParam.test(key) &&
              !/^(潜能|潜能类型|模组\d+数据)/.test(key),
          ),
        ),
        潜能提升: potential,
        信赖加成: {
          生命上限: Number(trust[0] || 0),
          攻击: Number(trust[1] || 0),
          防御: Number(trust[2] || 0),
        },
      },
    };
    record.facets = {
      profession: [profession].filter(Boolean),
      branch: [branch].filter(Boolean),
      rarity: Number.isFinite(rarity) ? [String(rarity)] : [],
    };
    record.facet = profession;
    if (info["特性"])
      record.sections.push({
        title: "特性",
        body: clean(info["特性"]),
        sourceKind: "gameplay",
      });
    const forms = templates.filter(
      (t) => /^技能\d*$/.test(t.name) && t.params["技能名"],
    );
    record.fields.skills = forms.map((t) => ({
      name: clean(t.params["技能名"]),
      recovery: t.params["技能类型1"],
      trigger: t.params["技能类型2"],
      levels: Array.from({ length: 10 }, (_, i) => {
        const prefix = i < 7 ? `技能${i + 1}` : `技能专精${i - 6}`;
        return {
          level: i + 1,
          label: i < 7 ? `等级 ${i + 1}` : `专精${["一", "二", "三"][i - 7]}`,
          description: clean(t.params[`${prefix}描述`] ?? ""),
          initial: t.params[`${prefix}初始`],
          cost: t.params[`${prefix}消耗`],
          duration: t.params[`${prefix}持续`],
        };
      }).filter((level) => level.description),
    }));
    record.fields.acquisition = Object.fromEntries(
      Object.entries(
        (tables.char_obtain ?? []).find(
          (row) => Number(row.pageId) === page.pageId,
        ) ?? {},
      )
        .filter(([key]) => !/page|precision/.test(key))
        .map(([key, value]) => [key, clean(value)]),
    );
    record.fields.baseSkills = (tables.char_building_skill ?? [])
      .filter((row) => Number(row.pageId) === page.pageId)
      .map((row) => {
        const skill =
          (tables.building_skill2 ?? []).find(
            (skill) =>
              skill.name === row.name + (row.phase ? `(${row.phase})` : ""),
          ) ??
          (tables.building_skill2 ?? []).find(
            (skill) => skill.name === row.name,
          );
        return {
          技能名: row.name,
          解锁精英化: row.phase,
          解锁等级: row.level,
          设施: skill?.room,
          效果: skill ? clean(skill.description) : undefined,
        };
      });
    record.facets.type = [
      page.categories.includes("专属干员")
        ? "模式专属"
        : page.categories.includes("异格干员")
          ? "异格干员"
          : "可获得干员",
    ];
    record.artworkRefs.unshift(
      { title: `文件:立绘 ${record.name} 1.png`, role: "portrait" },
      { title: `文件:头像 ${record.name}.png`, role: "thumbnail" },
    );
  } else if (kind === "enemy") {
    const common = first(templates, /^敌人信息\/common/);
    const levels = templates.filter((t) => t.name === "敌人信息/levelcontent");
    let inherited = {};
    record.levels = levels.map((t) => {
      inherited = t.params.reindex
        ? { ...t.params }
        : { ...inherited, ...t.params };
      return {
        id: `LEVEL${t.params.index ?? ""}`,
        fields: Object.fromEntries(
          Object.entries(inherited)
            .filter(([key]) => !privateParam.test(key))
            .map(([key, value]) => [key, clean(value)]),
        ),
      };
    });
    record.name = common["名称"] ?? record.name;
    record.tags = [
      common["地位级别"],
      common["种类"],
      common["攻击方式"],
      common["伤害类型"],
      common["行动方式"],
    ].filter(Boolean);
    record.aliases.push(...[common.index, common.id].filter(Boolean));
    record.summary = `${record.name}${common.index ? `（${common.index}）` : ""}是${common["地位级别"] ?? ""}敌人。${common["攻击方式"] ? `攻击方式：${clean(common["攻击方式"])}。` : ""}${levels.length ? `资料含${levels.length}个属性级别。` : ""}`;
    record.summaryStatus = "source";
    record.fields = { identity: common };
    delete record.fields.identity["描述"];
    record.facts = valuesFor(common, [
      "index",
      "地位级别",
      "种类",
      "行动方式",
      "攻击方式",
      "伤害类型",
      "登场活动",
    ]);
    record.facets = {
      rank: [common["地位级别"]].filter(Boolean),
      species: [common["种类"]].filter(Boolean),
    };
    record.facet = common["地位级别"];
    record.sections.push({
      title: "属性口径",
      body: "各级别保留来源模板的继承关系；级别不等于战斗阶段，关卡与天赋附加值另计。",
      sourceKind: "editorial",
    });
  } else if (kind === "item") {
    const info = first(templates, /^道具信息$/);
    record.name = info["名称"] ?? baseRow.name ?? record.name;
    const category = info["分类"] ?? baseRow.category1 ?? "其他道具";
    record.summary = `${record.name}属于${category}。${baseRow.itemCategory && baseRow.itemCategory !== "道具" ? `资料状态：${baseRow.itemCategory}。` : ""}`;
    record.summaryStatus = "source";
    record.tags = [category, baseRow.category2, baseRow.category3].filter(
      Boolean,
    );
    record.facts = [
      fact("分类", category),
      fact(
        "稀有度",
        Number.isFinite(Number(info["稀有度"] ?? baseRow.rarity))
          ? `T${Number(info["稀有度"] ?? baseRow.rarity) + 1}`
          : undefined,
      ),
      fact("获得方式", info["获得方式"] ?? baseRow.obtain_method),
    ].filter(Boolean);
    record.fields = {
      identity: {
        名称: record.name,
        分类: category,
        稀有度: Number(info["稀有度"] ?? baseRow.rarity) + 1,
        获取途径: clean(info["获得方式"] ?? baseRow.obtain_method ?? ""),
        资料分类: baseRow.itemCategory,
      },
    };
    if (info["用途"])
      record.sections.push({
        title: "用途",
        body: clean(info["用途"]),
        sourceKind: "gameplay",
      });
    record.fields.purchasePrices = (tables.item_purchase_price ?? [])
      .filter((row) => Number(row.pageId) === page.pageId)
      .map((row) => ({
        支付道具: row["purchase item"],
        获得数量: row["purchase qty"],
        售价: row["purchase price"],
        商店参考数量: row["param model qty"],
        商店参考售价: row["param model price"],
      }));
    record.facets = {
      category: [category],
      type: [baseRow.itemCategory].filter(Boolean),
    };
    record.facet = category;
    const recipes = templates.filter((t) => /^道具配方\//.test(t.name));
    record.fields.recipes = recipes.map((t) => ({
      facility: t.name.split("/")[1],
      ...Object.fromEntries(
        Object.entries(t.params).map(([key, value]) => [key, clean(value)]),
      ),
    }));
  } else if (kind === "stage") {
    const variants = templates.filter((t) => /关卡信息$/.test(t.name));
    const info = variants[0]?.params ?? {};
    record.name =
      [info["关卡代号"], info["关卡名"]].filter(Boolean).join(" ") ||
      record.name;
    record.aliases.push(...[info["关卡代号"], info["关卡id"]].filter(Boolean));
    record.tags = [info["关卡类型"], info["所属区域"]].filter(Boolean);
    record.summary = `${record.name}。${info["所属区域"] ? `所属区域：${info["所属区域"]}。` : ""}${info["作战消耗"] ? `作战消耗${info["作战消耗"]}理智。` : ""}`;
    record.summaryStatus = variants.length ? "source" : "missing";
    record.facts = valuesFor(info, [
      "关卡代号",
      "所属区域",
      "关卡类型",
      "推荐等级",
      "部署上限",
      "初始COST",
      "目标点耐久",
      "敌人数量",
      "地图大小",
      "作战消耗",
    ]);
    record.fields = {
      variants: variants.map((t) => ({
        name: t.name,
        ...Object.fromEntries(
          Object.entries(t.params).map(([key, value]) => [key, clean(value)]),
        ),
      })),
      enemies: first(templates, /^敌方情报$/),
    };
    record.fields.drops = (tables.loot ?? [])
      .filter((row) => Number(row.pageId) === page.pageId)
      .map((row) => ({ 类型: row.type, 道具: row.itemName, 条件: row.rarity }));
    for (const variant of variants) {
      const p = variant.params;
      if (p["特殊地图"]) continue;
      if (p["地图"])
        record.artworkRefs.push({
          title: `文件:${p["地图"]}.png`,
          role: "map",
          sourceTemplate: variant.name,
        });
      else if (
        p["地图预览override"] ||
        (p["关卡id"] && p["战斗关卡"] !== "false")
      )
        record.artworkRefs.push({
          url: `https://torappu.prts.wiki/assets/map_preview/${p["地图预览override"] || p["关卡id"]}.png`,
          role: "map",
          sourceTemplate: variant.name,
        });
    }
    record.facets = {
      chapter: [info["所属区域"]].filter(Boolean),
      type: [info["关卡类型"]].filter(Boolean),
    };
    record.facet = info["关卡类型"];
  } else if (kind === "story") {
    const story = first(templates, /^剧情模拟器$/);
    const group = baseRow.storyGroup ?? story["剧情分组"] ?? "";
    const type = baseRow.storyType ?? story["剧情类型"] ?? "";
    record.summary = `${group ? `${group} · ` : ""}${type || "剧情"}记录。剧情梗概尚待核验。`;
    record.summaryStatus = "missing";
    record.tags = [type, group].filter(Boolean);
    record.fields = {
      storyGroup: group,
      storyType: type,
      textPath: baseRow.textPath ?? story["文本路径"],
      segment: /\/BEG$/.test(page.title)
        ? "行动前"
        : /\/END$/.test(page.title)
          ? "行动后"
          : /\/NBT$/.test(page.title)
            ? "非战斗剧情"
            : "独立剧情",
    };
    const memory = (tables.char_memory ?? []).find(
      (row) => row.storyTxt === page.title,
    );
    if (memory) {
      record.name = `${memory.page} · ${memory.storySetName}`;
      record.fields.unlock = {
        干员: memory.page,
        精英化: memory.elite,
        等级: memory.level,
        信赖: memory.favor,
      };
      record.fields.memoryOwner = memory.page;
      record.tags.push("干员密录");
    }
    record.facts = [
      fact("故事分组", group),
      fact("剧情类型", type),
      fact("片段", record.fields.segment),
    ].filter(Boolean);
    record.facets = {
      chapter: [group].filter(Boolean),
      type: [type].filter(Boolean),
    };
    record.facet = type;
    record.missingFacts.push(
      "尚未完成剧情梗概的逐段核验；未将完整剧本或自动推测当作摘要发布。",
    );
  } else if (kind === "furniture") {
    const info = first(templates, /家具.*信息|^家具参数$/);
    if (/^\d+$/.test(info["稀有度"] ?? ""))
      info["稀有度"] = String(Number(info["稀有度"]) + 1);
    record.name = info["名称"] ?? record.name;
    record.fields = {
      identity: Object.fromEntries(
        Object.entries(info).filter(([key]) => !privateParam.test(key)),
      ),
    };
    record.facts = valuesFor(info, [
      "类型",
      "分类",
      "氛围",
      "氛围值",
      "稀有度",
      "主题",
      "套件",
      "尺寸",
      "大小",
      "所属套装",
      "所属组件",
      "获取方式",
      "获得方式",
    ]);
    record.tags = [info["类型"], info["主题"], info["套件"]].filter(Boolean);
    record.summary = `${record.name}是一件${info["类型"] ?? ""}家具${info["主题"] ? `，属于${info["主题"]}主题` : ""}。`;
    record.summaryStatus = Object.keys(info).length ? "source" : "missing";
    record.facets = {
      category: [info["类型"] ?? info["分类"]].filter(Boolean),
    };
    if (info.iconId && !info.forceWikiFile)
      record.artworkRefs.unshift({
        url: `https://torappu.prts.wiki/assets/furniture/${info.iconId}.png`,
        role: "furniture",
        sourceTemplate: "家具信息",
      });
  } else if (kind === "furniture-theme") {
    record.summary = `${record.name}家具主题。`;
    record.summaryStatus = "source";
    record.fields = { 名称: record.name, 类型: "家具主题" };
    const theme = first(templates, /^家具主题总览$/);
    const introduction = clean(baseRow["theme desc"] ?? theme["2"] ?? "");
    if (introduction)
      record.sections.push({
        title: "主题介绍（来源资料）",
        body: introduction,
        sourceKind: "source",
      });
    const parsed = parseTables(text);
    record.fields.tables = parsed.map((table) => ({
      title: table.title,
      rows: table.rows.map((row) => row.map(tableCell)),
    }));
    if (parsed.warnings?.length) record.fields.parseWarnings = parsed.warnings;
    const furnitureTable = record.fields.tables.find(
      (table) =>
        table.rows[0]?.includes("家具") && table.rows[0]?.includes("数量"),
    );
    record.fields.家具清单 =
      furnitureTable?.rows
        .slice(1)
        .filter((row) => row.length >= 3 && row[0] !== "总计")
        .map((row) => ({ 家具: row[0], 数量: row[1], 氛围值: row[2] })) ??
      [
        ...new Set(
          templates
            .filter((template) => template.name === "家具")
            .map((template) => clean(template.params["1"] ?? ""))
            .filter(Boolean),
        ),
      ].map((name) => ({ 家具: name }));
    const totals = record.fields.tables
      .flatMap((table) => table.rows)
      .filter(
        (row) =>
          row.length === 2 &&
          /^(家具氛围值|主题氛围值|氛围值总计)$/.test(row[0]),
      );
    record.facts.push(...totals.map(([label, value]) => fact(label, value)));
    record.fields.氛围总计 = Object.fromEntries(totals);
    record.summary = `${record.name}家具主题，收录 ${record.fields.家具清单.length} 种家具${record.fields.氛围总计["氛围值总计"] ? `，完整布置氛围值为 ${record.fields.氛围总计["氛围值总计"]}` : ""}。`;
    if (baseRow["theme icon"])
      record.artworkRefs.push({
        url: `https://torappu.prts.wiki/assets/furniture_theme/${baseRow["theme icon"]}.png`,
        role: "furniture-theme",
        sourceTemplate: "家具主题总览",
      });
    if (baseRow["theme preview"])
      record.artworkRefs.push({
        url: `https://torappu.prts.wiki/assets/furniture_preview/${baseRow["theme preview"]}_6.png`,
        role: "preview",
        sourceTemplate: "家具主题总览",
      });
  } else if (kind === "event") {
    const info = first(templates, /活动信息/);
    record.name = info["名称"] ?? record.name;
    record.fields = {
      identity: Object.fromEntries(
        Object.entries(info).filter(([key]) => !privateParam.test(key)),
      ),
    };
    record.facts = valuesFor(info, [
      "分类",
      "活动开始时间",
      "活动开始时间cn",
      "活动结束时间",
      "活动结束时间cn",
      "兑换结束时间",
      "官网链接",
    ]);
    record.tags = [info["分类"] ?? info["类型"]].filter(Boolean);
    record.facets = { type: record.tags };
    record.summary = `${record.name}${info["分类"] ? `，类型为${info["分类"]}` : ""}。${info["活动开始时间"] ? `活动开始时间：${info["活动开始时间"]}。` : ""}`;
    record.summaryStatus = Object.keys(info).length ? "source" : "missing";
    const parsed = parseTables(text);
    record.fields.tables = parsed
      .filter(
        (table) =>
          !/剧情|文本|故事|对话/.test(table.title) &&
          (/关卡|任务|奖励|商店|兑换|里程碑|扭蛋|委托|报酬|调查数据库|指令目录|作战|赛事|物资|手环|签到|礼品/.test(
            table.title,
          ) ||
            table.rows[0]?.some((cell) =>
              /^(?:关卡|消耗|奖励|价格|商品|任务)$/.test(clean(cell)),
            )),
      )
      .map((table) => ({
        title: table.title,
        rows: table.rows.map((row) => row.map(tableCell)),
      }));
    if (parsed.warnings?.length) record.fields.parseWarnings = parsed.warnings;
    record.fields.待核验项目 = [
      ...new Set(
        templates
          .filter((template) =>
            /^#(?:invoke:EventShopList|widget:(?:MedalShowcase|Torappu))/i.test(
              template.name,
            ),
          )
          .map((template) =>
            /EventShopList/.test(template.name)
              ? "活动商店完整兑换表"
              : /MedalShowcase/.test(template.name)
                ? "活动蚀刻章及达成条件"
                : "活动动态游戏组件内容",
          ),
      ),
    ];
  } else if (kind === "mechanic" && page.categories.includes("装置")) {
    const info = first(templates, /^装置信息$/);
    record.name = info["名称"] ?? record.name;
    record.en = info["英文名"] ?? "";
    record.fields = {
      identity: Object.fromEntries(
        Object.entries(info)
          .filter(([key]) => !/机制|描述/.test(key))
          .map(([key, value]) => [key, clean(value)]),
      ),
    };
    record.facts = valuesFor(info, [
      "实体类型",
      "阵营",
      "部署条件",
      "部署费用",
      "阻挡数",
      "占用部署数",
      "撤回策略",
    ]);
    record.summary = `${record.name}是${info["阵营"] ?? ""}${info["实体类型"] ?? "关卡装置"}。${info["部署条件"] ? `部署条件：${info["部署条件"]}。` : ""}`;
    record.summaryStatus = Object.keys(info).length ? "source" : "missing";
    record.tags = ["关卡装置", info["实体类型"]].filter(Boolean);
    record.facets = { type: ["关卡装置"] };
    record.facet = "关卡装置";
  } else {
    record.summary = `${record.name}的${dictionary[kind]}资料索引。内容梗概尚待核验。`;
    record.fields = {
      headings: [...text.matchAll(/^={2,5}\s*([^=\n]+?)\s*={2,5}\s*$/gm)].map(
        (m) => m[1],
      ),
      sourceType:
        kind === "world" ? "community-research" : "gameplay-reference",
    };
    record.tags = page.categories.slice(0, 8);
    record.facets = { type: [dictionary[kind]] };
    if (kind === "world")
      record.missingFacts.push(
        "泰拉大典含社区分析与考据；未核验的推论不作为游戏正史公开。",
      );
    if (["mechanic", "mode"].includes(kind) && page.title !== "情报处理室") {
      const gameplay = gameplayFields(page, templates, tables);
      if (Object.keys(gameplay).length) record.fields.gameplay = gameplay;
      const narrativePage =
        /事件|故事|记录|结局|回忆|纪实|文本|对话|可露希尔推荐/.test(page.title);
      const parsedTables =
        narrativePage || gameplay.收藏品 || gameplay.通宝
          ? []
          : parseTables(text);
      record.fields.tables = parsedTables
        .map((table) => ({
          title: table.title,
          rows: table.rows.map((row) => row.map(tableCell)),
        }))
        .filter((table) => table.rows.length);
      if (parsedTables.warnings?.length)
        record.fields.parseWarnings = parsedTables.warnings;
      if (
        record.templates.length ||
        record.fields.tables.length ||
        record.fields.gameplay
      ) {
        record.summary = `${record.name}的玩法资料，包含${record.fields.tables.length}组数据表、${record.templates.length}组规则参数${record.fields.gameplay ? `与${Object.keys(gameplay).length}组专题规则` : ""}。`;
        record.summaryStatus = "source";
      }
      if (page.title.startsWith("寻访模拟/")) {
        record.name = page.title.replace("寻访模拟/", "");
        record.facet = "寻访模拟";
        record.facets = { type: ["寻访模拟"] };
        record.summary = `${record.name}的 PRTS 寻访模拟入口。模拟器规则不能作为官方概率与保底机制的依据。`;
        record.summaryStatus = "source";
        record.fields.sourceType = "community-simulation";
        record.missingFacts.push(
          "寻访池的完整概率与保底规则需结合对应寻访数据表核验。",
        );
      }
    }
  }
  record.templates = record.templates.map((template) => ({
    ...template,
    params: Object.fromEntries(
      Object.entries(template.params).filter(
        ([key]) => !privateParam.test(key),
      ),
    ),
  }));
  if (legacy) {
    record.kind = legacy.kind;
    record.legacyId = legacy.id;
    record.summary = legacy.summary;
    record.summaryStatus = "curated";
    record.name = legacy.name;
    record.en = legacy.en;
    record.aliases = [...new Set([...record.aliases, ...legacy.aliases])];
    record.facts = [
      ...new Map(
        [...record.facts, ...legacy.facts].map((fact) => [fact.label, fact]),
      ).values(),
    ];
    record.sections = legacy.sections.map((section) => ({
      ...section,
      sourceKind: "curated",
    }));
    record.relationships =
      legacy.relationships ??
      legacy.related.map((target) => ({ target, label: "关联档案" }));
  }
  return record;
}

export async function build(discovery, progress = console.log) {
  const snapshotId = `prts-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const shardRoot = `data/prts/snapshots/${snapshotId}`;
  const legacy = loadLegacy();
  const legacyMap = new Map();
  const legacyIds = new Set();
  for (const entry of legacy.entries) {
    const source = legacy.sources[entry.sources[0]];
    if (source?.url.startsWith("https://prts.wiki/w/")) {
      const title = decodeURIComponent(source.url.split("/w/")[1]);
      if (!legacyMap.has(title)) legacyMap.set(title, entry);
    }
  }
  const tables = {};
  for (const file of await readdir(path.join(ROOT, "cargo")))
    if (file.endsWith(".json")) {
      const value = await json(path.join(ROOT, "cargo", file));
      tables[value.table] = value.rows;
    }
  const records = [],
    failed = [],
    identityConflicts = [],
    implementationSources = [],
    rawById = new Map(),
    pagesByTitle = new Map();
  for (const page of discovery.pages) {
    pagesByTitle.set(page.title, page);
    const raw = await json(
      path.join(ROOT, "raw/pages", `${page.pageId}.json`),
      null,
    );
    if (raw) rawById.set(page.pageId, raw);
    try {
      const record = buildRecord(page, raw, tables, legacyMap);
      if (record) {
        records.push(record);
        legacyIds.add(record.id);
        const candidate = legacyMap.get(page.title);
        if (candidate && !record.legacyId)
          identityConflicts.push({
            legacyId: candidate.id,
            sourceTitle: page.title,
            legacyKind: candidate.kind,
            discoveredKind: record.kind,
            resolution: "保留独立实体；此旧来源作为支持证据，不等于身份页",
          });
      } else if (/<includeonly>/i.test(rawContent(raw)))
        implementationSources.push({
          pageId: page.pageId,
          title: page.title,
          reason: "实现模板与示例仅作来源缓存，不作为游戏实体",
        });
    } catch (error) {
      failed.push({
        pageId: page.pageId,
        title: page.title,
        error: error.stack,
      });
    }
  }
  for (const row of tables.char_mod ?? []) {
    const page = discovery.pages.find((p) => p.pageId === Number(row.pageId));
    if (!page) continue;
    const name = clean(row.name),
      id = `prts-module-${digest(`${page.pageId}:${row.charModuleN}:${row.name}`).slice(0, 16)}`;
    const owner = records.find(
      (r) => r.kind === "operator" && r.source.pageId === page.pageId,
    );
    const moduleSource =
      parseTemplates(rawContent(rawById.get(page.pageId))).find(
        (template) =>
          template.name === "模组" && clean(template.params["名称"]) === name,
      )?.params ?? {};
    const fields = {
      名称: name,
      类型: row.type,
      适用干员: page.title,
      解锁条件: `精英2 · 等级${row.lv}`,
      解锁任务: [row.mission1, row.mission2].filter(Boolean).map(clean),
    };
    const statLabels = {
      hp: "生命上限",
      atk: "攻击",
      def: "防御",
      res: "法术抗性",
      time: "再部署时间",
      cost: "部署费用",
      block: "阻挡数",
      atkspd: "攻击速度",
    };
    const levels = Array.from({ length: 3 }, (_, i) => ({
      id: `等级${i + 1}`,
      fields: {
        ...Object.fromEntries(
          Object.entries(statLabels).map(([key, label]) => [
            label,
            String(row[key] ?? "").split(";")[i] ?? "未提供",
          ]),
        ),
        ...(moduleSource["特性"] || row.trait
          ? { 特性调整: clean(moduleSource["特性"] ?? row.trait) }
          : {}),
        ...(i > 0 && row[`talent${i + 1}`]
          ? {
              天赋调整: clean(
                moduleSource[`天赋${i + 1}`] ?? row[`talent${i + 1}`],
              ),
            }
          : {}),
        升级材料: clean(
          moduleSource[i === 0 ? "材料消耗" : `材料消耗${i + 1}`] ??
            row[i === 0 ? "mat" : `mat${i + 1}`] ??
            "",
        ),
        ...(moduleSource[i === 0 ? "解锁信赖" : `解锁信赖${i + 1}`] !==
        undefined
          ? {
              解锁信赖: moduleSource[i === 0 ? "解锁信赖" : `解锁信赖${i + 1}`],
            }
          : {}),
        ...(row[i === 0 ? "cond" : `cond${i + 1}`]
          ? { 解锁条件: clean(row[i === 0 ? "cond" : `cond${i + 1}`]) }
          : {}),
      },
    }));
    records.push({
      id,
      kind: "module",
      name,
      aliases: [row.type, page.title].filter(Boolean),
      summary: `${page.title}的${row.type ?? ""}模组${name ? `“${name}”` : ""}。`,
      summaryStatus: "source",
      tags: [row.type, page.title].filter(Boolean),
      releaseStatus: owner?.releaseStatus ?? "released",
      source: sourceFor(page, rawById.get(page.pageId)),
      facts: [
        fact("适用干员", page.title),
        fact("类型", row.type),
        fact("解锁条件", `精英2 · 等级${row.lv}`),
      ].filter(Boolean),
      sections: [
        {
          title: "加成口径",
          body: "等级属性为装备模组后的数值增量；特性与天赋调整先于潜能提升生效。",
          sourceKind: "gameplay",
        },
      ],
      fields,
      levels,
      templates: [],
      facets: { type: [row.type].filter(Boolean) },
      artworkRefs: row.equipIcon
        ? [
            {
              url: `https://torappu.prts.wiki/assets/uniequip_img/${row.equipIcon}.png`,
              role: "module",
              sourceTemplate: "模组",
            },
          ]
        : [],
      relationships: owner ? [{ target: owner.id, label: "适用干员" }] : [],
    });
    if (
      /已获得特别认证许可|特别外勤干员权限现已开放/.test(
        moduleSource["基础信息"] ?? "",
      )
    ) {
      const record = records.at(-1),
        mode =
          moduleSource["基础信息"].match(/在([^\n]+?)行动中/)?.[1] ??
          (/集成战略系列任务/.test(moduleSource["基础信息"])
            ? "集成战略"
            : undefined);
      record.fields.资料形式 = "认证说明";
      record.sections.push({
        title: "认证说明",
        body: `${page.title}获得外勤部门的特别许可，可在${mode ?? "指定"}行动中采用改良策略。这枚证章记载认证内容，原页未附独立人物故事。`,
        sourceKind: "gameplay",
      });
    }
  }
  const outfitPage = pagesByTitle.get("模板:时装回廊");
  const outfitCache = await json(
    path.join(ROOT, "support/outfit-sources.json"),
    { pages: [] },
  );
  const { parseOutfitAcquisition } =
    await import("../prts-art/outfit-acquisition.mjs");
  const outfitAcquisition = parseOutfitAcquisition(outfitCache);
  const outfitAcquisitionMatches = [],
    outfitAcquisitionConflicts = [];
  if (outfitPage && rawById.has(outfitPage.pageId)) {
    const templates = parseTemplates(
      rawContent(rawById.get(outfitPage.pageId)),
    ).filter((t) => t.name === "时装回廊/半身像");
    const profileCache = new Map();
    for (const template of templates) {
      const fields = Object.fromEntries(
        Object.entries(template.params).map(([key, value]) => [
          key,
          clean(value),
        ]),
      );
      const actor = fields["干员名"],
        name = fields["时装名"],
        sequence = fields["时装序号"];
      const owner = records.find(
        (r) =>
          r.kind === "operator" &&
          (r.name === actor || r.source.title === actor),
      );
      if (owner && !profileCache.has(owner.id))
        profileCache.set(
          owner.id,
          first(
            parseTemplates(rawContent(rawById.get(owner.source.pageId))),
            /^CharinfoV2$/,
          ),
        );
      const profile = profileCache.get(owner?.id) ?? {};
      const profileName = clean(profile[`时装${sequence}名称`] ?? "");
      const matchesProfile =
        profileName.replace(/[“”「」]/g, "") ===
        (name ?? "").replace(/[“”「」]/g, "");
      if (matchesProfile && profile[`时装${sequence}系列`])
        fields["时装系列"] = clean(profile[`时装${sequence}系列`]);
      const introduction = matchesProfile
        ? clean(profile[`时装${sequence}介绍`] ?? "")
        : "";
      const id = `prts-outfit-${digest(`${actor}:${sequence}:${name}`).slice(0, 16)}`;
      const acquisitions = outfitAcquisition.entries.filter(
        (entry) =>
          entry.operatorName === actor &&
          String(entry.sequence) === String(sequence),
      );
      const acquisition =
        acquisitions.length === 1 &&
        acquisitions[0].name.replace(/[“”「」]/g, "") ===
          (name ?? "").replace(/[“”「」]/g, "")
          ? acquisitions[0]
          : undefined;
      if (acquisitions.length && !acquisition)
        outfitAcquisitionConflicts.push({
          id,
          actor,
          sequence,
          name,
          candidates: acquisitions.map((entry) => entry.name),
        });
      const offers = acquisition?.offers ?? [];
      if (acquisition) {
        outfitAcquisitionMatches.push(id);
        fields.获取方式 = [
          ...new Set(offers.map((offer) => offer.acquisition).filter(Boolean)),
        ].join("；");
        fields.tables = [
          {
            title: "获取与复刻记录",
            rows: [
              ["记录", "时间", "获取方式", "数量", "币种", "备注"],
              ...offers.map((offer) => [
                ({ initial: "首次", rerun: "复刻", review: "回顾" }[
                  offer.kind
                ] ?? offer.kind) + (offer.sequence ? ` ${offer.sequence}` : ""),
                offer.availability ||
                  [offer.start, offer.end].filter(Boolean).join(" — ") ||
                  "来源未明示",
                offer.acquisition || "来源未明示",
                offer.amountText || "来源未明示",
                offer.currency || "来源未明示",
                [
                  offer.priceRelation === "alternative"
                    ? "同次获取，可任选一种兑换"
                    : "",
                  ...(Array.isArray(offer.notes)
                    ? offer.notes
                    : [offer.notes ?? ""]),
                ]
                  .filter(Boolean)
                  .join("；"),
              ]),
            ],
          },
        ];
        if (acquisition.restrictions?.length)
          fields.兑换限制 = acquisition.restrictions.map(
            (restriction) => restriction.description,
          );
      }
      records.push({
        id,
        kind: "outfit",
        name: name || `${actor}时装${sequence}`,
        aliases: [actor, fields["干员外文名"]].filter(Boolean),
        summary: `${actor}的${fields["时装系列"] ?? ""}系列时装。`,
        summaryStatus: "source",
        tags: [actor, fields["时装系列"], fields["时装注释"]].filter(Boolean),
        releaseStatus: owner?.releaseStatus ?? "released",
        source: sourceFor(outfitPage, rawById.get(outfitPage.pageId)),
        additionalSources: [
          ...(matchesProfile ? [owner.source] : []),
          ...(acquisition
            ? [
                acquisition.source,
                ...(acquisition.templateSource
                  ? [acquisition.templateSource]
                  : []),
              ]
            : []),
        ],
        facts: valuesFor(fields, ["干员名", "时装系列", "时装注释"]),
        sections: introduction
          ? [
              {
                title: "服饰介绍（来源资料）",
                body: introduction,
                sourceKind: "source",
                spoiler: true,
              },
            ]
          : [],
        fields,
        ...(acquisition
          ? {
              acquisitionHistory: offers,
              acquisitionIssues: [
                ...(offers.some((offer) => !offer.acquisition)
                  ? ["部分获取记录缺少来源渠道说明"]
                  : []),
                ...(offers.some(
                  (offer) =>
                    offer.priceStatus !== "not-stated" && !offer.currency,
                )
                  ? ["部分有价记录的币种尚未核验"]
                  : []),
              ],
            }
          : {}),
        templates: [
          {
            name: template.name,
            params: Object.fromEntries(
              Object.entries(fields).filter(
                ([, value]) => typeof value === "string",
              ),
            ),
          },
        ],
        facets: { type: [fields["时装系列"]].filter(Boolean) },
        artworkRefs: [
          { title: `文件:立绘 ${actor} skin${sequence}.png`, role: "outfit" },
        ],
        relationships: owner ? [{ target: owner.id, label: "所属干员" }] : [],
      });
    }
  }
  // Preserve every curated route, including concept entries sharing one source page.
  for (const entry of legacy.entries)
    if (!legacyIds.has(entry.id)) {
      const source = legacy.sources[entry.sources[0]];
      records.push({
        ...entry,
        kind: entry.kind,
        legacyId: entry.id,
        summaryStatus: "curated",
        releaseStatus: "released",
        source: {
          title: source.title,
          url: source.url,
          timestamp: source.checkedAt,
        },
        fields: {},
        templates: [],
        sections: entry.sections.map((s) => ({ ...s, sourceKind: "curated" })),
        relationships:
          entry.relationships ??
          entry.related.map((target) => ({ target, label: "关联档案" })),
        artworkRefs: [],
        facets: { type: [entry.kind] },
      });
    }
  const embedded = await expandEmbedded(discovery, rawById, records);
  const narrativeSources = await collectNarrativeSources(
    discovery,
    rawById,
    tables,
  );
  const duplicateEntities = [];
  const recordMap = new Map();
  for (const record of records) {
    if (recordMap.has(record.id))
      duplicateEntities.push({
        id: record.id,
        name: record.name,
        kind: record.kind,
        resolution: "源表重复键合并为同一实体；原行保存在 Cargo 缓存",
      });
    recordMap.set(record.id, record);
  }
  records.splice(0, records.length, ...recordMap.values());
  const gameplaySupport = await json(
    path.join(ROOT, "support/gameplay-widgets.json"),
    { pages: [], associations: [], failures: [] },
  );
  for (const association of gameplaySupport.associations) {
    const source = gameplaySupport.pages.find(
      (page) => page.title === association.title,
    );
    const record = records.find(
      (entry) => entry.source.pageId === association.sourcePageId,
    );
    if (!source || !record) continue;
    const rules = taskMapRules(rawContent(source));
    if (!rules.length) continue;
    record.fields.任务指标 = [...(record.fields.任务指标 ?? []), ...rules];
    (record.additionalSources ??= []).push({
      title: source.title,
      url: wiki(source.title),
      pageId: source.pageid,
      revisionId: source.revisions[0].revid,
      timestamp: source.revisions[0].timestamp,
      publisher: "PRTS 玩家社区 / 游戏资料",
    });
    record.summary = `${record.name}的任务条件与测试指标，已收录 ${record.fields.任务指标.length} 项规则。`;
    record.summaryStatus = "source";
  }
  const editorialApplied = [],
    editorialUnmatched = [],
    authoredRelationships = [];
  for (const file of (await readdir(ROOT))
    .filter(
      (file) =>
        /^editorial(?:-[a-z0-9-]+)?\.json$/.test(file) &&
        !file.includes("pending"),
    )
    .sort()) {
    const editorial = await json(path.join(ROOT, file));
    for (const authored of editorial.entries ?? []) {
      const record = records.find((r) =>
        authored.id
          ? r.id === authored.id
          : r.kind === authored.kind && r.source.title === authored.sourceTitle,
      );
      if (!record) {
        editorialUnmatched.push({
          file,
          id: authored.id,
          sourceTitle: authored.sourceTitle,
        });
        continue;
      }
      if (authored.relationships?.length)
        authoredRelationships.push({
          id: record.id,
          relationships: authored.relationships,
        });
      if (!authored.summary && !authored.sections?.length) {
        editorialApplied.push({
          id: record.id,
          file,
          relationships: authored.relationships?.length ?? 0,
        });
        continue;
      }
      if (record.legacyId && authored.kind === "world") {
        editorialApplied.push({
          id: record.id,
          file,
          skipped: true,
          reason: "保留既有103条手工档案内容与身份",
        });
        continue;
      }
      if (authored.summary) record.summary = authored.summary;
      else
        record.summary = record.summary
          .replace(/(?:剧情梗概|内容梗概|叙事内容)尚待核验。?/g, "")
          .trim()
          .replace(/，$/, "。");
      record.summaryStatus = "curated";
      record.sections = [
        ...record.sections.filter(
          (section) =>
            !authored.sections?.some(
              (replacement) => replacement.title === section.title,
            ),
        ),
        ...(authored.sections ?? []),
      ];
      record.missingFacts = (record.missingFacts ?? []).filter(
        (message) => !/梗概|叙事内容/.test(message),
      );
      record.editorialProvenance = authored.provenance;
      editorialApplied.push({ id: record.id, file });
    }
  }
  const profileSources = await collectProfileSources(records, rawById);
  const unique = [...records].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "zh-CN"),
  );
  const titleToId = new Map(
    unique.map((record) => [record.source.title, record.id]),
  );
  for (const record of unique) {
    if (record.kind === "outfit")
      for (const offer of record.acquisitionHistory ?? [])
        for (const event of offer.events ?? []) {
          const target = recordMap.get(titleToId.get(event.title));
          if (target?.kind === "event")
            record.relationships.push({ target: target.id, label: "获取活动" });
        }
    if (record.kind === "event") {
      const links = new Set(
        [
          ...rawContent(rawById.get(record.source.pageId)).matchAll(
            /\[\[([^|\]#]+)(?:[^\]]*)\]\]/g,
          ),
        ].map((match) => match[1]),
      );
      for (const template of parseTemplates(
        rawContent(rawById.get(record.source.pageId)),
      ))
        if (template.name === "关卡链接" && template.params["1"])
          links.add(clean(template.params["1"]));
      for (const target of unique)
        if (
          target.kind === "stage" &&
          (links.has(target.source.title) ||
            links.has(target.source.title.split(" ")[0]))
        )
          record.relationships.push({ target: target.id, label: "活动关卡" });
    }
    if (record.kind === "furniture-theme")
      for (const member of record.fields.家具清单 ?? []) {
        const target = unique.find(
          (entry) =>
            entry.kind === "furniture" &&
            (entry.source.title === member.家具 || entry.name === member.家具),
        );
        if (target) {
          record.relationships.push({ target: target.id, label: "主题家具" });
          target.relationships.push({ target: record.id, label: "家具主题" });
        }
      }
    const owner = record.fields.identity;
    if (record.kind === "operator")
      for (const field of ["所属国家", "所属组织", "所属团队"]) {
        const target = [...unique].find(
          (r) =>
            ["world", "country", "city", "faction", "concept"].includes(
              r.kind,
            ) &&
            owner?.[field] &&
            (r.name === owner[field] ||
              r.source.title.endsWith("/" + owner[field])),
        );
        if (target && !record.relationships.some((r) => r.target === target.id))
          record.relationships.push({ target: target.id, label: "所属资料" });
      }
    if (record.kind === "operator" && record.facets.type?.includes("召唤物")) {
      const target = unique.find(
        (r) => r.kind === "operator" && r.name === owner?.["持有者"],
      );
      if (target) {
        record.relationships.push({ target: target.id, label: "持有干员" });
        target.relationships.push({ target: record.id, label: "召唤物" });
      }
    }
    if (record.kind === "story" && record.fields.memoryOwner) {
      const target = unique.find(
        (r) => r.kind === "operator" && r.name === record.fields.memoryOwner,
      );
      if (target) {
        record.relationships.push({ target: target.id, label: "密录干员" });
        target.relationships.push({
          target: record.id,
          label: "干员密录",
          spoiler: true,
        });
      }
    }
    if (record.kind === "item")
      for (const recipe of record.fields.recipes ?? [])
        for (const [key, name] of Object.entries(recipe)) {
          if (/^原料\d+$/.test(key) && titleToId.has(name))
            record.relationships.push({
              target: titleToId.get(name),
              label: "配方材料",
            });
        }
    if (
      record.kind === "item" &&
      !record.templates.some((t) => t.name === "道具信息")
    ) {
      const variants = unique.filter(
        (other) =>
          other.kind === "item" &&
          other.id !== record.id &&
          other.source.title
            .toLowerCase()
            .startsWith(record.source.title.toLowerCase() + "（"),
      );
      if (variants.length) {
        record.fields.variants = variants.map((r) => ({
          name: r.name,
          id: r.id,
        }));
        record.relationships.push(
          ...variants.map((r) => ({ target: r.id, label: "道具版本" })),
        );
      }
    }
    if (record.kind === "enemy" && !record.levels?.length) {
      const page = rawById.get(record.source.pageId);
      const links = [
        ...rawContent(page).matchAll(/\[\[([^|\]#]+)(?:[^\]]*)\]\]/g),
      ].map((m) => m[1]);
      const variants = unique.filter(
        (other) =>
          other.kind === "enemy" &&
          other.id !== record.id &&
          other.name.startsWith(record.name) &&
          links.includes(other.source.title),
      );
      if (variants.length) {
        record.fields.variants = variants.map((r) => ({
          name: r.name,
          id: r.id,
        }));
        record.relationships.push(
          ...variants.map((r) => ({ target: r.id, label: "敌人差分" })),
        );
      }
    }
    if (record.kind === "stage")
      for (const [key, name] of Object.entries(record.fields.enemies ?? {})) {
        if (/^敌人\d+$/.test(key) && titleToId.has(name))
          record.relationships.push({
            target: titleToId.get(name),
            label: "出现敌人",
          });
      }
    if (["module", "outfit"].includes(record.kind))
      for (const relation of record.relationships) {
        const target = recordMap.get(relation.target);
        if (target?.kind === "operator")
          target.relationships.push({
            target: record.id,
            label: record.kind === "module" ? "适用模组" : "时装",
          });
      }
  }
  const tokenRelationships = linkPotentialTokens(unique);
  const structuredAmendments = applyReviewedAmendments(
    unique,
    await json(path.join(ROOT, "structured-amendments.json")),
    rawById,
  );
  const authoredRelationshipCount = applyAuthoredRelationships(
    unique,
    authoredRelationships,
  );
  for (const record of unique)
    record.relationships = [
      ...new Map(
        record.relationships.map((relation) => [
          `${relation.target}:${relation.label}:${Boolean(relation.spoiler)}`,
          relation,
        ]),
      ).values(),
    ];
  const structure = {
    complete: 0,
    partial: 0,
    notApplicable: 0,
    byKind: {},
    byType: {},
    missing: [],
  };
  const narrative = { complete: 0, pending: 0, notApplicable: 0, byKind: {} };
  for (const record of unique) {
    const issues = structuralIssues(record);
    record.structuralStatus = issues.length ? "partial" : "complete";
    const type = record.facets.type?.[0] ?? record.kind;
    const applicable = ![
      "world",
      "country",
      "city",
      "faction",
      "concept",
    ].includes(record.kind);
    const completeness = applicable ? record.structuralStatus : "notApplicable";
    if (!applicable) delete record.structuralStatus;
    structure[completeness]++;
    const group = (structure.byKind[record.kind] ??= {
      complete: 0,
      partial: 0,
      notApplicable: 0,
    });
    group[completeness]++;
    const subtype = (structure.byType[`${record.kind}/${type}`] ??= {
      complete: 0,
      partial: 0,
      notApplicable: 0,
    });
    subtype[completeness]++;
    if (issues.length) {
      structure.missing.push({
        id: record.id,
        kind: record.kind,
        type,
        issues,
      });
      record.missingFacts = [
        ...new Set([...(record.missingFacts ?? []), ...issues]),
      ];
    }
    if (record.kind === "module" && record.fields.资料形式 === "认证说明") {
      narrative.notApplicable++;
      const group = (narrative.byKind.module ??= {
        complete: 0,
        pending: 0,
        notApplicable: 0,
      });
      group.notApplicable = (group.notApplicable ?? 0) + 1;
    } else if (
      [
        "operator",
        "story",
        "world",
        "module",
        "country",
        "city",
        "faction",
        "concept",
      ].includes(record.kind) &&
      !record.facets.type?.includes("召唤物")
    ) {
      const complete = record.sections.some((section) =>
        ["curated", "community"].includes(section.sourceKind),
      );
      record.narrativeStatus = complete ? "curated" : "pending";
      narrative[complete ? "complete" : "pending"]++;
      const group = (narrative.byKind[record.kind] ??= {
        complete: 0,
        pending: 0,
      });
      group[complete ? "complete" : "pending"]++;
      if (!complete && record.kind === "operator")
        record.missingFacts.push(
          "角色履历与档案的叙事改写尚待核验；当前已提供战斗、养成与后勤结构化资料。",
        );
      if (!complete && record.kind === "module")
        record.missingFacts = [
          ...(record.missingFacts ?? []),
          "模组故事的叙事改写尚待核验；当前已提供模组解锁与各级效果。",
        ];
    }
  }
  const counts = {},
    summaryCounts = {},
    indexShards = [],
    detailShards = [],
    searchShards = [];
  const byKind = new Map();
  for (const record of unique) {
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
    summaryCounts[record.summaryStatus] =
      (summaryCounts[record.summaryStatus] ?? 0) + 1;
    const list = byKind.get(record.kind) ?? [];
    list.push(record);
    byKind.set(record.kind, list);
  }
  for (const [kind, list] of byKind) {
    for (let offset = 0; offset < list.length; offset += 40) {
      const batch = list.slice(offset, offset + 40),
        relative = `${shardRoot}/details/${kind}-${String(offset / 40).padStart(3, "0")}.json`;
      for (const record of batch) record.detailShard = relative;
      await save(path.resolve("public", relative), { records: batch });
      detailShards.push({
        path: relative,
        count: batch.length,
        ids: batch.map((record) => record.id),
      });
    }
    for (let offset = 0; offset < list.length; offset += 350) {
      const batch = list.slice(offset, offset + 350),
        suffix = `${kind}-${String(offset / 350).padStart(3, "0")}.json`;
      const indexPath = `${shardRoot}/index/${suffix}`;
      const indices = batch.map(
        ({
          id,
          kind,
          name,
          en,
          aliases,
          summary,
          summaryStatus,
          tags,
          releaseStatus,
          source,
          detailShard,
          legacyId,
          facets,
          facet,
        }) => ({
          id,
          kind,
          name,
          en,
          aliases,
          summary,
          summaryStatus,
          tags,
          releaseStatus,
          source,
          detailShard,
          legacyId,
          facets,
          facet,
        }),
      );
      await save(path.resolve("public", indexPath), { records: indices });
      indexShards.push({ path: indexPath, count: indices.length });
      const searchPath = `${shardRoot}/search/${suffix}`;
      await save(path.resolve("public", searchPath), {
        records: batch.map((record) => ({
          id: record.id,
          text: [
            record.name,
            record.en,
            ...record.aliases,
            record.summary,
            ...record.tags,
            ...record.facts.map((f) => `${f.label} ${f.value}`),
            ...record.sections.filter((s) => !s.spoiler).map((s) => s.body),
            ...textValues(record.fields),
            ...textValues(record.levels),
            ...record.templates.flatMap((t) => Object.values(t.params)),
          ]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase(),
          spoilerText: record.sections
            .filter((s) => s.spoiler)
            .map((s) => s.body)
            .join(" "),
        })),
      });
      searchShards.push({ path: searchPath, count: batch.length });
    }
  }
  const rawReport = await json(path.join(ROOT, "raw/report.json"), {});
  const itemByPage = new Map(
    (tables.item ?? []).map((row) => [Number(row.pageId), row]),
  );
  const itemCategoryPages = discovery.pages.filter((page) =>
    page.categories.includes("道具"),
  );
  const itemDelta = itemCategoryPages.filter(
    (page) => itemByPage.get(page.pageId)?.itemCategory !== "道具",
  );
  const itemReconciliation = {
    categoryPages: itemCategoryPages.length,
    cargoRows: (tables.item ?? []).length,
    cargoRegular: (tables.item ?? []).filter((r) => r.itemCategory === "道具")
      .length,
    categoryVsRegularDelta: itemDelta.length,
    deltaClassification: itemDelta.reduce((counts, page) => {
      const kind = itemByPage.get(page.pageId)?.itemCategory ?? "missing";
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {}),
    uncoveredPages: itemCategoryPages
      .filter((page) => !itemByPage.has(page.pageId))
      .map((page) => page.title),
  };
  const outfitReconciliation = {
    cargoSkinNames: (tables.chara ?? []).reduce(
      (total, row) =>
        total +
        Object.entries(row).filter(
          ([key, value]) => /^skin\d+name$/.test(key) && value,
        ).length,
      0,
    ),
    galleryEntries: unique.filter((r) => r.kind === "outfit").length,
    acquisition: {
      ...outfitAcquisition.stats,
      matched: outfitAcquisitionMatches.length,
      matchConflicts: outfitAcquisitionConflicts,
      sourceConflicts: outfitAcquisition.conflicts,
      missing: outfitAcquisition.missing,
    },
  };
  const coverage = {
    generatedAt: new Date().toISOString(),
    discoveredPages: discovery.pages.length,
    cachedPages: rawById.size,
    counts,
    summaryCounts,
    structure,
    narrative,
    narrativeSources,
    profileSources,
    embedded,
    editorialApplied,
    editorialUnmatched,
    tokenRelationships,
    structuredAmendments,
    authoredRelationshipCount,
    exclusions: [...discovery.report.exclusions, ...implementationSources],
    sources: discovery.report.sources,
    gameplaySupport: {
      cached: gameplaySupport.pages.length,
      associations: gameplaySupport.associations.length,
      failures: gameplaySupport.failures,
      parsed: unique.filter((record) => record.fields.任务指标).length,
    },
    itemReconciliation,
    outfitReconciliation,
    identityConflicts,
    duplicateEntities,
    discoveryFailures: discovery.report.failures,
    rawFailures: rawReport.failures ?? [],
    parseFailures: failed,
    missingSummaries: unique
      .filter((r) => r.summaryStatus === "missing")
      .map((r) => ({ id: r.id, kind: r.kind, title: r.source.title })),
    notes: [
      "素材覆盖由独立美术清单计算。",
      "结构化完整表示指定字段解析成功，不等于叙事、社区动态脚本与全站资料已全部完成。",
      "原始剧本、档案与模组故事仅存储在本地data/prts/raw，不随公开详情发布。",
    ],
  };
  await save(path.join(PUBLIC, "coverage.json"), coverage);
  const coveragePath = `${shardRoot}/coverage.json`;
  await save(path.resolve("public", coveragePath), coverage);
  await save(path.join(ROOT, "coverage.json"), coverage);
  const status =
    rawById.size === discovery.pages.length &&
    !failed.length &&
    !discovery.report.failures.length &&
    !coverage.rawFailures.length &&
    !coverage.missingSummaries.length &&
    !structure.partial &&
    !narrative.pending
      ? "complete"
      : "partial";
  await save(path.join(PUBLIC, "manifest.json"), {
    schemaVersion: 1,
    snapshotId,
    generatedAt: new Date().toISOString(),
    status,
    counts,
    indexShards,
    detailShards,
    searchShards,
    coverage: { path: coveragePath },
    legacyAliases: Object.fromEntries(
      legacy.entries.map((entry) => [entry.id, entry.id]),
    ),
  });
  progress(
    `Published ${unique.length} records; ${rawById.size}/${discovery.pages.length} source pages cached; ${coverage.missingSummaries.length} summaries pending; status ${status}`,
  );
  return coverage;
}

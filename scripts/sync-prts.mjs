import path from "node:path";
import { access, mkdir } from "node:fs/promises";
import { Api, ROOT, json, save, pool } from "./prts/api.mjs";
import { rawContent, parseTemplates } from "./prts/wikitext.mjs";

const args = new Set(process.argv.slice(2));
const api = new Api({
  offline: args.has("--offline"),
  refresh: args.has("--refresh"),
});
const phase =
  [...args].find((a) => a.startsWith("--phase="))?.split("=")[1] ?? "all";
const discovered = new Map();
const report = {
  startedAt: new Date().toISOString(),
  sources: [],
  failures: [],
  exclusions: [],
};
function progress(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}
function add(page, kind, category) {
  if (!page?.pageid || !page?.title) return;
  const supportPage =
    /\/(?:sandbox\d*(?:\/|$)|doc$|devdata$|data$|extra$|[^/]*图标$|[^/]*预览$|PRTS[^/]*记录$)/i.test(
      page.title,
    );
  if (supportPage && kind !== "source") {
    if (!report.exclusions.some((entry) => entry.title === page.title))
      report.exclusions.push({
        title: page.title,
        reason:
          "维基试验、实现数据或图标组件页面仅作本地来源，不作为正式游戏资料实体。",
      });
    kind = "source";
  }
  const current = discovered.get(page.pageid) ?? {
    pageId: Number(page.pageid),
    title: page.title,
    ns: page.ns ?? 0,
    kinds: [],
    categories: [],
  };
  if (kind && !current.kinds.includes(kind)) current.kinds.push(kind);
  if (category && !current.categories.includes(category))
    current.categories.push(category);
  discovered.set(page.pageid, current);
}
const categories = {
  operator: ["干员", "异格干员", "专属干员", "召唤物"],
  enemy: ["敌人"],
  item: ["道具", "未实装道具", "测试道具", "重名道具"],
  stage: [
    "主线关卡",
    "日常关卡",
    "支线关卡",
    "活动关卡",
    "集成战略关卡",
    "生息演算关卡",
    "保全派驻关卡",
    "危机合约关卡",
    "矢量突破关卡",
    "卫戍协议关卡",
    "引航者试炼关卡",
    "联锁竞赛关卡",
    "多维合作关卡",
    "促融共竞关卡",
    "争锋频道关卡",
    "试验玩法关卡",
    "全息作战矩阵关卡",
    "内测关卡",
  ],
  story: ["剧情"],
  event: ["有活动信息的页面"],
  furniture: ["家具"],
  "furniture-theme": ["家具主题"],
  mechanic: ["装置", "寻访模拟"],
};
const roots = {
  mode: [
    "危机合约",
    "集成战略",
    "保全派驻",
    "引航者试炼",
    "生息演算",
    "促融共竞",
    "矢量突破",
    "卫戍协议",
    "争锋频道",
    "试验玩法一览",
    "全息作战矩阵",
    "联锁竞赛",
    "多维合作",
  ],
  mechanic: [
    "作战机制",
    "基础数据",
    "罗德岛基建",
    "后勤技能一览",
    "分支一览",
    "情报处理室",
    "采购中心",
    "任务列表",
    "公开招募",
    "卡池一览",
    "寻访概率",
    "光荣之路",
    "首页场景",
    "界面主题",
    "头像一览",
    "名片一览",
    "干员专精",
  ],
};

async function category(name, kind, recurse = false, visited = new Set()) {
  if (visited.has(name)) return;
  visited.add(name);
  try {
    const members = await api.continued(
      {
        list: "categorymembers",
        cmtitle: `分类:${name}`,
        cmlimit: "500",
        cmprop: "ids|title|type",
      },
      "categorymembers",
    );
    report.sources.push({
      type: "category",
      name,
      kind,
      count: members.filter((p) => p.ns !== 14).length,
    });
    for (const page of members) {
      if (page.ns === 14) {
        if (recurse)
          await category(page.title.replace(/^分类:/, ""), kind, true, visited);
      } else if ([0, 3000].includes(page.ns)) add(page, kind, name);
    }
    progress(
      `Discovery category ${name}: ${members.length}; unique pages ${discovered.size}`,
    );
  } catch (error) {
    report.failures.push({
      phase: "discovery",
      source: name,
      error: error.message,
    });
  }
}

async function discover() {
  const previousDiscovery = await json(path.join(ROOT, "discovery.json"), {
    pages: [],
  });
  await mkdir(ROOT, { recursive: true });
  const tables = (await api.get({ action: "cargotables" })).cargotables;
  for (const table of tables) {
    try {
      const schema = (await api.get({ action: "cargofields", table }))
        .cargofields;
      const fields = [
        "_pageName=page",
        "_pageID=pageId",
        ...Object.keys(schema),
      ].join(",");
      const rows = await api.cargo(table, fields);
      await save(path.join(ROOT, "cargo", `${table}.json`), {
        table,
        schema,
        fetchedAt: new Date().toISOString(),
        rows,
      });
      report.sources.push({ type: "cargo", name: table, count: rows.length });
      const kind = {
        chara: "operator",
        item: "item",
        story: "story",
        furniture_themes: "furniture-theme",
        loot: "stage",
      }[table];
      for (const row of rows)
        add({ pageid: Number(row.pageId), title: row.page, ns: 0 }, kind);
      progress(`Discovery Cargo ${table}: ${rows.length} rows`);
    } catch (error) {
      report.failures.push({
        phase: "discovery",
        source: `Cargo:${table}`,
        error: error.message,
      });
      progress(`FAIL Cargo ${table}: ${error.message}`);
    }
  }
  for (const [kind, names] of Object.entries(categories))
    for (const name of names) await category(name, kind);
  await category("活动", "event", true);
  const modeThemes = [...discovered.values()].filter((page) =>
    page.categories.some((c) =>
      [
        "集成战略",
        "生息演算",
        "保全派驻",
        "危机合约",
        "联锁竞赛",
        "多维合作",
      ].includes(c),
    ),
  );
  for (const theme of modeThemes) {
    add({ pageid: theme.pageId, title: theme.title, ns: theme.ns }, "mode");
    const pages = await api.continued(
      {
        list: "allpages",
        apnamespace: "0",
        apprefix: `${theme.title}/`,
        aplimit: "500",
        apfilterredir: "nonredirects",
      },
      "allpages",
    );
    for (const page of pages) add(page, "mode");
    report.sources.push({
      type: "prefix",
      name: theme.title,
      kind: "mode",
      count: pages.length,
    });
  }
  const world = await api.continued(
    {
      list: "allpages",
      apnamespace: "3000",
      aplimit: "500",
      apfilterredir: "nonredirects",
    },
    "allpages",
  );
  for (const page of world) {
    const administrative =
      /^泰拉大典:(?:条目格式|编辑指南|Index|百科(?:\/|$))/.test(page.title);
    add(page, administrative ? "source" : "world");
    if (administrative)
      report.exclusions.push({
        title: page.title,
        reason:
          "编辑指南、格式或百科容器作为来源；百科词条将在结构化时展开，不作为独立世界观实体。",
      });
  }
  report.sources.push({
    type: "namespace",
    name: "泰拉大典",
    namespace: 3000,
    count: world.length,
  });
  progress(`Discovery world namespace: ${world.length}`);
  for (const [kind, names] of Object.entries(roots)) {
    const details = await api.get({
      action: "query",
      prop: "info",
      titles: names.join("|"),
      redirects: "1",
    });
    for (const page of details.query?.pages ?? []) add(page, kind);
    for (const prefix of (details.query?.pages ?? [])
      .filter((page) => !page.missing)
      .map((page) => page.title)) {
      const pages = await api.continued(
        {
          list: "allpages",
          apnamespace: "0",
          apprefix: `${prefix}/`,
          aplimit: "500",
          apfilterredir: "nonredirects",
        },
        "allpages",
      );
      for (const page of pages) add(page, kind);
    }
  }
  // Index sources are cached as sources, never displayed as independent records.
  const auxiliary = [
    "模板:时装回廊",
    "模板:剧情导航",
    "干员一览/专属干员",
    "剧情角色一览",
    "关卡一览",
    "关卡一览/曲谱",
    "剧情一览",
    "活动一览",
    "家具一览",
    "内测剧情一览",
    "模板:分析与考据导航",
  ];
  const info = await api.get({
    action: "query",
    prop: "info",
    titles: auxiliary.join("|"),
  });
  for (const page of info.query?.pages ?? []) add(page, "source");
  for (const prefix of ["关卡一览/", "剧情一览/"]) {
    const pages = await api.continued(
      {
        list: "allpages",
        apnamespace: "0",
        apprefix: prefix,
        aplimit: "500",
        apfilterredir: "nonredirects",
      },
      "allpages",
    );
    for (const page of pages) add(page, "source");
    report.sources.push({
      type: "prefix",
      name: prefix,
      kind: "source",
      count: pages.length,
    });
  }
  const memories = (await json(path.join(ROOT, "cargo/char_memory.json"))).rows;
  const memoryTitles = [
    ...new Set(memories.map((row) => row.storyTxt).filter(Boolean)),
  ];
  for (let offset = 0; offset < memoryTitles.length; offset += 40) {
    const data = await api.get({
      action: "query",
      prop: "info",
      titles: memoryTitles.slice(offset, offset + 40).join("|"),
      redirects: "1",
    });
    for (const page of data.query?.pages ?? []) {
      if (page.missing)
        report.exclusions.push({
          title: page.title,
          reason:
            "干员密录索引存在，但来源页尚未建立；保留密录介绍与解锁条件，不伪造正文。",
        });
      else add(page, "story", "干员密录");
    }
  }
  const result = {
    schemaVersion: 1,
    discoveredAt: new Date().toISOString(),
    pages: [...discovered.values()].sort((a, b) => a.pageId - b.pageId),
    report,
  };
  report.removedPages = previousDiscovery.pages
    .filter((page) => !discovered.has(page.pageId))
    .map(({ pageId, title }) => ({ pageId, title }));
  await save(path.join(ROOT, "discovery.json"), result);
  progress(
    `Discovery saved ${result.pages.length} unique pages; ${report.failures.length} failures`,
  );
  return result;
}

async function retrieve(discovery) {
  const pending = [];
  const cached = new Map();
  const changes = {
    generatedAt: new Date().toISOString(),
    added: [],
    changed: [],
    unchanged: 0,
    removed: discovery.report.removedPages ?? [],
    failures: [],
  };
  for (const page of discovery.pages) {
    const source = await json(
      path.join(ROOT, "raw/pages", `${page.pageId}.json`),
      null,
    );
    if (source) cached.set(page.pageId, source);
    else {
      pending.push(page);
      changes.added.push({ pageId: page.pageId, title: page.title });
    }
  }
  if (args.has("--refresh")) {
    const existing = discovery.pages.filter((page) => cached.has(page.pageId));
    for (let offset = 0; offset < existing.length; offset += 50) {
      const batch = existing.slice(offset, offset + 50);
      try {
        const data = await api.get({
          action: "query",
          prop: "revisions",
          pageids: batch.map((p) => p.pageId).join("|"),
          rvprop: "ids|timestamp",
          rvslots: "main",
        });
        for (const current of data.query?.pages ?? []) {
          const oldRevision = cached.get(current.pageid)?.revisions?.[0]?.revid;
          const newRevision = current.revisions?.[0]?.revid;
          if (current.missing || !newRevision)
            changes.removed.push({
              pageId: current.pageid,
              title: current.title,
              reason: "来源页已不可读取，保留旧缓存。",
            });
          else if (oldRevision !== newRevision) {
            pending.push(
              discovery.pages.find((p) => p.pageId === current.pageid),
            );
            changes.changed.push({
              pageId: current.pageid,
              title: current.title,
              oldRevision,
              newRevision,
            });
          } else changes.unchanged++;
        }
      } catch (error) {
        changes.failures.push({
          pageIds: batch.map((p) => p.pageId),
          error: error.message,
        });
      }
      progress(
        `Revision comparison ${Math.min(offset + 50, existing.length)}/${existing.length}; changed ${changes.changed.length}`,
      );
    }
  } else {
    changes.unchanged = cached.size;
  }
  progress(
    `Raw source cache: ${discovery.pages.length - pending.length}/${discovery.pages.length}; requesting ${pending.length}`,
  );
  const batches = [];
  for (let index = 0; index < pending.length; index += 30)
    batches.push(pending.slice(index, index + 30));
  let completed = discovery.pages.length - pending.length;
  const results = await pool(batches, 2, async (batch) => {
    const response = await api.get({
      action: "query",
      prop: "revisions|categories",
      pageids: batch.map((p) => p.pageId).join("|"),
      rvprop: "ids|timestamp|content|contentmodel",
      rvslots: "main",
      cllimit: "500",
    });
    const received = response.query?.pages ?? [];
    for (const page of received) {
      if (page.missing || !page.revisions?.length)
        throw new Error(`Missing source page ${page.pageid}: ${page.title}`);
      await save(path.join(ROOT, "raw/pages", `${page.pageid}.json`), {
        ...page,
        fetchedAt: new Date().toISOString(),
      });
    }
    completed += received.length;
    progress(`Raw source cache ${completed}/${discovery.pages.length}`);
    return received.length;
  });
  const failures = results.flatMap((r, index) =>
    r.status === "rejected"
      ? [{ pageIds: batches[index].map((p) => p.pageId), error: r.reason }]
      : [],
  );
  await save(path.join(ROOT, "incremental.json"), changes);
  await save(path.join(ROOT, "raw/report.json"), {
    generatedAt: new Date().toISOString(),
    requested: discovery.pages.length,
    completed,
    failures: [...changes.failures, ...failures],
    added: changes.added.length,
    changed: changes.changed.length,
    unchanged: changes.unchanged,
    removed: changes.removed.length,
  });
  return failures;
}

try {
  const discovery =
    phase === "discover" || phase === "all"
      ? await discover()
      : await json(path.join(ROOT, "discovery.json"));
  if (phase === "all" || phase === "raw") await retrieve(discovery);
  if (["all", "raw", "support"].includes(phase)) {
    const { retrieveGameplaySupport, retrieveOutfitSupport } =
      await import("./prts/support.mjs");
    await retrieveGameplaySupport(api, discovery, progress);
    await retrieveOutfitSupport(api, progress);
  }
  if (["all", "build"].includes(phase)) {
    const { build } = await import("./prts/normalize.mjs");
    await build(discovery, progress);
  }
  progress(
    `Finished phase ${phase}; network requests ${api.requests}, cache hits ${api.cacheHits}`,
  );
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
}

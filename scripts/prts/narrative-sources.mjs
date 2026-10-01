import path from "node:path";
import { ROOT, save, json } from "./api.mjs";
import { parseTemplates, rawContent, clean } from "./wikitext.mjs";

/** Build local editorial queues. No source narrative is copied into public shards. */
export async function collectNarrativeSources(discovery, rawById, tables) {
  const pages = new Map(discovery.pages.map((page) => [page.title, page]));
  const pending = [];
  const introPage = pages.get("情报处理室");
  const introRaw = rawById.get(introPage?.pageId);
  if (introRaw)
    for (const template of parseTemplates(rawContent(introRaw)).filter(
      (template) => template.name === "剧情简介",
    )) {
      const p = template.params;
      const segment =
        p["3"] === "行动前" ? "BEG" : p["3"] === "行动后" ? "END" : "NBT";
      const requested = p["链接"] ?? `${p["1"]} ${p["2"]}/${segment}`;
      const page =
        pages.get(requested) ??
        discovery.pages.find(
          (page) =>
            page.kinds.includes("story") &&
            page.title.startsWith(`${p["1"]} `) &&
            page.title.endsWith("/" + segment),
        );
      pending.push({
        id: page ? `prts-story-${page.pageId}` : undefined,
        sourceTitle: page?.title ?? requested,
        kind: "story",
        sourceIntro: clean(p["4"] ?? ""),
        source: {
          pageId: introRaw.pageid,
          revisionId: introRaw.revisions[0].revid,
          title: introRaw.title,
        },
        introType: "剧情简介",
        match: Boolean(page),
      });
    }
  for (const row of tables.char_memory ?? []) {
    const page = pages.get(row.storyTxt),
      raw = rawById.get(Number(row.pageId));
    pending.push({
      id: page ? `prts-story-${page.pageId}` : undefined,
      sourceTitle: row.storyTxt,
      kind: "story",
      name: row.storySetName,
      sourceIntro: clean(row.storyIntro),
      source: {
        pageId: Number(row.pageId),
        revisionId: raw?.revisions?.[0]?.revid,
        title: row.page,
      },
      introType: "密录介绍",
      match: Boolean(page),
    });
  }
  const deduped = [
    ...new Map(
      pending.map((row) => [`${row.sourceTitle}:${row.sourceIntro}`, row]),
    ).values(),
  ];
  await save(path.join(ROOT, "editorial-pending.json"), deduped);
  const known = new Set(
    pending.filter((row) => row.match).map((row) => row.sourceTitle),
  );
  const missing = discovery.pages
    .filter((page) => page.kinds.includes("story") && !known.has(page.title))
    .map((page) => {
      const cargo = (tables.story ?? []).find((row) => row.page === page.title);
      const raw = rawById.get(page.pageId);
      return {
        id: `prts-story-${page.pageId}`,
        sourceTitle: page.title,
        kind: "story",
        storyType: cargo?.storyType ?? "其他",
        storyGroup: cargo?.storyGroup,
        source: {
          pageId: page.pageId,
          revisionId: raw?.revisions?.[0]?.revid,
          title: page.title,
        },
        rawPath: `data/prts/raw/pages/${page.pageId}.json`,
        reason: "未发现可直接对应的短介绍；需阅读剧本并人工归纳。",
      };
    });
  await save(path.join(ROOT, "story-synopsis-missing.json"), missing);
  return {
    availableIntros: deduped.length,
    matchedIntros: deduped.filter((row) => row.match).length,
    noIntro: missing.length,
  };
}

/** Editorial work queues are local and remain stable while an author owns a slice. */
export async function collectProfileSources(records, rawById) {
  const operators = [],
    modules = [];
  for (const record of new Map(records.map((r) => [r.id, r])).values()) {
    if (
      !["operator", "module"].includes(record.kind) ||
      record.facets.type?.includes("召唤物") ||
      record.sections.some((section) =>
        ["curated", "community"].includes(section.sourceKind),
      )
    )
      continue;
    const raw = rawById.get(record.source.pageId);
    const templates = parseTemplates(rawContent(raw));
    if (record.kind === "operator") {
      const archive =
        templates.find((t) => t.name === "人员档案")?.params ?? {};
      const keys = Object.keys(archive).filter((key) => /^档案\d+$/.test(key));
      const biographyKey = keys.find((key) =>
        /客观履历|履历|学生概况/.test(clean(archive[key])),
      );
      const sourceIntro = clean(
        biographyKey ? (archive[biographyKey + "文本"] ?? "") : "",
      );
      const basics =
        templates.find((t) => t.name === "人员档案set")?.params ?? {};
      operators.push({
        id: record.id,
        sourceTitle: record.source.title,
        name: record.name,
        kind: "operator",
        sourceIntro,
        source: record.source,
        introType: biographyKey
          ? clean(archive[biographyKey])
          : "未发现客观履历",
        unlock: archive[biographyKey + "条件"],
        basicFacts: Object.fromEntries(
          Object.entries(basics)
            .filter(([key]) =>
              ["性别", "战斗经验", "出身地", "生日", "种族", "身高"].includes(
                key,
              ),
            )
            .map(([key, value]) => [key, clean(value)]),
        ),
        match: Boolean(sourceIntro),
        rawPath: `data/prts/raw/pages/${record.source.pageId}.json`,
      });
    } else {
      const module = templates.find(
        (t) => t.name === "模组" && clean(t.params["名称"]) === record.name,
      );
      const sourceIntro = clean(module?.params["基础信息"] ?? "");
      modules.push({
        id: record.id,
        sourceTitle: record.source.title,
        name: record.name,
        kind: "module",
        sourceIntro,
        source: record.source,
        introType: "模组故事",
        match: Boolean(sourceIntro),
        rawPath: `data/prts/raw/pages/${record.source.pageId}.json`,
      });
    }
  }
  for (const [kind, rows] of [
    ["operator", operators],
    ["module", modules],
  ]) {
    rows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const target = path.join(ROOT, `${kind}-editorial-pending.json`);
    if (!(await json(target, null))) await save(target, rows);
    await save(path.join(ROOT, `${kind}-editorial-remaining.json`), rows);
  }
  return {
    operators: operators.length,
    operatorIntros: operators.filter((r) => r.match).length,
    modules: modules.length,
    moduleStories: modules.filter((r) => r.match).length,
  };
}

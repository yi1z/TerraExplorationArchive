import path from "node:path";
import { ROOT, digest, json, save, wiki } from "./api.mjs";
import {
  parseTemplates,
  parseTables,
  rawContent,
  clean,
  artworkRefs,
} from "./wikitext.mjs";

/** Pages such as the encyclopedia and NPC catalogue contain many independent entities. */
export async function expandEmbedded(discovery, rawById, records) {
  const pending = [],
    created = [],
    collisions = [],
    descriptors = [];
  const registryPath = path.join(ROOT, "embedded-identities.json");
  const registry = await json(registryPath, {
    schemaVersion: 1,
    identities: {},
  });
  const previous = await json(
    path.join(ROOT, "editorial-world-pending.json"),
    [],
  );
  const previousIds = new Map();
  for (const row of previous) {
    const key = `${row.source.pageId}:${row.introType}:${row.name}`;
    const ids = previousIds.get(key) ?? [];
    ids.push(row.id);
    previousIds.set(key, ids);
  }
  const existingNames = new Map(
    records
      .filter(
        (r) =>
          r.legacyId &&
          ["country", "city", "faction", "concept"].includes(r.kind),
      )
      .map((r) => [r.name, r]),
  );
  function add(
    page,
    name,
    type,
    intro,
    refs = [],
    appearances = "",
    anchor = name,
  ) {
    if (!name || !intro) return;
    descriptors.push({ page, name, type, intro, refs, appearances, anchor });
  }
  for (const page of discovery.pages) {
    const raw = rawById.get(page.pageId);
    if (!raw) continue;
    const text = rawContent(raw);
    if (/^泰拉大典:百科\//.test(page.title)) {
      const type = `百科${page.title.split("/").at(-1)}`;
      for (const t of parseTemplates(text).filter((t) => t.name === "百科词条"))
        add(
          page,
          clean(t.params["1"] ?? ""),
          type,
          t.params["情报"] ?? "",
          artworkRefs(t.params["情报"] ?? ""),
        );
    }
    if (page.title === "剧情角色一览") {
      for (const table of parseTables(text))
        for (const cells of table.rows) {
          if (cells.length < 3 || /名称.*代号/.test(cells[0]) || !cells[1])
            continue;
          const name = clean(cells[0])
            .replace(/^\s*[*!]+/, "")
            .trim();
          if (name.length > 100) continue;
          const refs = artworkRefs(cells[3] ?? "");
          for (const image of parseTemplates(cells[3] ?? "").filter(
            (t) => t.name === "剧情角色立绘",
          ))
            for (const token of (image.params["1"] ?? "").split(";")) {
              const title = token.trim().split("$")[0];
              if (title)
                refs.push({
                  title: `文件:${/\.(png|jpe?g|webp)$/i.test(title) ? title : `Avg ${title}.png`}`,
                  role: "portrait-candidate",
                });
            }
          add(
            page,
            name,
            "剧情角色",
            cells[1],
            refs,
            `${table.title}：${cells[2]}`,
            table.title,
          );
        }
    }
  }
  const counts = new Map();
  for (const row of descriptors) {
    const key = `${row.page.pageId}:${row.type}:${row.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seenKeys = new Set();
  for (const {
    page,
    name,
    type,
    intro,
    refs,
    appearances,
    anchor,
  } of descriptors) {
    const raw = rawById.get(page.pageId),
      revision = raw?.revisions?.[0];
    const source = {
      title: page.title,
      pageId: page.pageId,
      revisionId: revision?.revid,
      timestamp: revision?.timestamp,
      url: wiki(page.title) + "#" + encodeURIComponent(anchor),
      publisher: "PRTS 玩家社区 / 考据资料",
    };
    const base = `${page.pageId}:${type}:${name}`;
    // A portrait token is the source's durable row identity. Section and appearances
    // disambiguate rows without artwork; changing prose never changes an identity.
    const rowKey =
      refs
        .map((ref) => ref.title ?? ref.url)
        .filter(Boolean)
        .sort()
        .join("|") || clean(appearances);
    const identityKey = `${base}:${anchor}:${rowKey}`;
    if (seenKeys.has(identityKey))
      throw new Error(`Unresolved embedded source identity: ${identityKey}`);
    seenKeys.add(identityKey);
    const match = existingNames.get(name);
    const expectedKinds =
      type === "百科地理"
        ? ["country", "city"]
        : type === "百科组织"
          ? ["faction"]
          : type === "百科概念"
            ? ["concept"]
            : [];
    const candidate =
      match && expectedKinds.includes(match.kind) ? match : undefined;
    const previousMatches = previousIds.get(base) ?? [];
    // Seed the first registry from unambiguous existing public routes. All new
    // identities use the full source key, including future namesakes.
    const compatibilityId =
      counts.get(base) === 1 && previousMatches.length === 1
        ? previousMatches[0]
        : undefined;
    const id =
      candidate?.id ??
      registry.identities[identityKey] ??
      compatibilityId ??
      `prts-world-${digest(identityKey).slice(0, 16)}`;
    registry.identities[identityKey] = id;
    if (counts.get(base) > 1)
      collisions.push({
        id,
        name,
        sourceTitle: page.title,
        identityKey,
        anchor,
        appearances: clean(appearances),
        previousId: `prts-world-${digest(base).slice(0, 16)}`,
        resolution:
          "同名独立人物按来源章节与立绘/出场记录分别建档，不按姓名合并。",
      });
    if (!candidate) {
      const record = {
        id,
        kind: "world",
        name,
        aliases: [name],
        summary: `${name}的${type}资料，叙事内容尚待核验。`,
        summaryStatus: "missing",
        tags: [type],
        releaseStatus: "released",
        source,
        facts: [{ label: "资料类型", value: type }],
        sections: [],
        relationships: [],
        fields: {
          identity: { 资料类型: type },
          sourceType: "community-research",
        },
        templates: [],
        artworkRefs: refs,
        facets: { type: [type] },
        facet: type,
        missingFacts: [
          "叙事内容尚待人工核验与改写；社区考据不能直接等同于游戏明确事实。",
        ],
      };
      created.push(record);
    }
    pending.push({
      id,
      sourceTitle: page.title,
      name,
      kind: "world",
      sourceIntro: clean(intro),
      source,
      introType: type,
      appearances: clean(appearances),
      identityKey,
      sourceAnchor: anchor,
      match: true,
    });
  }
  if (new Set(pending.map((row) => row.id)).size !== pending.length)
    throw new Error("Embedded identity registry contains duplicate IDs");
  await save(registryPath, registry);
  await save(path.join(ROOT, "editorial-world-pending.json"), pending);
  records.push(...created);
  return {
    embeddedEntities: created.length,
    narrativeSources: pending.length,
    collisions,
  };
}

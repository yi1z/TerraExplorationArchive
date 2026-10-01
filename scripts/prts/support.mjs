import path from "node:path";
import { ROOT, json, save } from "./api.mjs";
import { rawContent, clean } from "./wikitext.mjs";

const normalizedTitle = (title) =>
  title.replace(/^Widget:/i, "微件:").replace(/_/g, " ");

/** Source widgets are read as text; their scripts and markup are never executed. */
export function taskMapRules(source) {
  const rows = [];
  for (const node of source.split('<div style="position:absolute;')) {
    const old = node.match(
      /<div class="text_warp">\s*<div class="a">([\s\S]*?)<\/div>\s*<div class="b">([\s\S]*?)<\/div>/,
    );
    const middle = node.match(
      /<div class="a"[^>]*>([\s\S]*?)<\/div>\s*<div class="b"[^>]*>([\s\S]*?)<\/div>/,
    );
    const modern = node.match(
      /<span style="flex-grow:[^>]*>([\s\S]*?)<\/span>[\s\S]*?<div class="b">([\s\S]*?)<\/div>/,
    );
    const match = old ?? modern ?? middle;
    if (!match) continue;
    const score = node.match(
      /<div class="node_r2_score">[\s\S]*?<\/svg>\s*(\d+)\s*<\/div>/,
    );
    rows.push({
      名称: clean(match[1]),
      效果: clean(match[2]),
      ...(score ? { 分值: Number(score[1]) } : {}),
    });
  }
  return rows;
}

export async function retrieveGameplaySupport(
  api,
  discovery,
  progress = console.log,
) {
  const cache = await json(path.join(ROOT, "support/gameplay-widgets.json"), {
    pages: [],
    associations: [],
    failures: [],
  });
  const associations = [];
  for (const page of discovery.pages.filter((entry) =>
    /任务地图$/.test(entry.title),
  )) {
    const raw = await json(
      path.join(ROOT, "raw/pages", `${page.pageId}.json`),
      null,
    );
    if (!raw) continue;
    for (const match of rawContent(raw).matchAll(/\{\{#widget:([^|}]+)/gi)) {
      if (/css|style/i.test(match[1])) continue;
      associations.push({
        sourcePageId: page.pageId,
        title: normalizedTitle(`Widget:${match[1].trim()}`),
      });
    }
  }
  const pages = new Map(cache.pages.map((page) => [page.title, page]));
  const pending = [...new Set(associations.map((entry) => entry.title))].filter(
    (title) => !pages.has(title),
  );
  const failures = [];
  const revisions = {
    added: [...pending],
    changed: [],
    unchanged: 0,
    removed: [],
  };
  if (api.refresh) {
    const existing = [...pages.values()];
    for (let offset = 0; offset < existing.length; offset += 40) {
      const batch = existing.slice(offset, offset + 40);
      try {
        const response = await api.get({
          action: "query",
          prop: "revisions",
          pageids: batch.map((page) => page.pageid).join("|"),
          rvprop: "ids|timestamp",
          rvslots: "main",
        });
        for (const page of response.query?.pages ?? []) {
          if (page.missing) {
            revisions.removed.push(page.pageid);
            continue;
          }
          if (
            pages.get(page.title)?.revisions?.[0]?.revid !==
            page.revisions?.[0]?.revid
          ) {
            pending.push(page.title);
            revisions.changed.push(page.title);
          } else revisions.unchanged++;
        }
      } catch (error) {
        failures.push({ phase: "revision-check", reason: error.message });
      }
    }
  }
  for (let offset = 0; offset < pending.length; offset += 40) {
    const titles = pending.slice(offset, offset + 40);
    try {
      const response = await api.get({
        action: "query",
        prop: "revisions",
        titles: titles.join("|"),
        rvprop: "ids|timestamp|content",
        rvslots: "main",
      });
      for (const page of response.query?.pages ?? []) {
        if (page.missing)
          failures.push({ title: page.title, reason: "来源组件尚未建立" });
        else pages.set(page.title, page);
      }
    } catch (error) {
      failures.push({ titles, reason: error.message });
    }
  }
  await save(path.join(ROOT, "support/gameplay-widgets.json"), {
    generatedAt: new Date().toISOString(),
    pages: [...pages.values()],
    associations,
    failures,
    revisions,
  });
  progress(
    `Gameplay support: ${pages.size} cached widgets, ${associations.length} references, ${failures.length} failures`,
  );
}

/** Refresh outfit source versions before downloading changed price histories. */
export async function retrieveOutfitSupport(api, progress = console.log) {
  const filename = path.join(ROOT, "support/outfit-sources.json");
  const cache = await json(filename, {
    schemaVersion: 1,
    pages: [],
    requests: [],
  });
  const pages = new Map(
    cache.pages
      .filter((page) => page.pageid > 0 && page.revisions?.length)
      .map((page) => [page.pageid, page]),
  );
  if (!api.refresh && pages.size) {
    progress(`Outfit support: ${pages.size} cached source pages`);
    return;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    added: [],
    changed: [],
    unchanged: 0,
    removed: [],
    failures: [],
  };
  const pending = new Set();
  try {
    const discovered = await api.continued(
      {
        list: "allpages",
        apprefix: "时装回廊/",
        apnamespace: "0",
        aplimit: "500",
        apfilterredir: "nonredirects",
      },
      "allpages",
    );
    cache.seriesDiscovery = {
      generatedAt: report.generatedAt,
      pages: discovered,
    };
    const titles = [
      ...discovered.map((page) => page.title),
      "模板:干员时装",
      "模板:时装商店",
    ];
    for (const title of titles)
      if (![...pages.values()].some((page) => page.title === title)) {
        pending.add(title);
        report.added.push(title);
      }
  } catch (error) {
    report.failures.push({ phase: "discovery", reason: error.message });
  }
  const existing = [...pages.values()];
  for (let offset = 0; offset < existing.length; offset += 40) {
    const batch = existing.slice(offset, offset + 40);
    try {
      const response = await api.get({
        action: "query",
        prop: "revisions",
        pageids: batch.map((page) => page.pageid).join("|"),
        rvprop: "ids|timestamp",
        rvslots: "main",
      });
      for (const page of response.query?.pages ?? []) {
        if (page.missing) {
          report.removed.push(page.pageid);
          continue;
        }
        if (
          pages.get(page.pageid)?.revisions?.[0]?.revid !==
          page.revisions?.[0]?.revid
        ) {
          pending.add(page.title);
          report.changed.push(page.title);
        } else report.unchanged++;
      }
    } catch (error) {
      report.failures.push({ phase: "revision-check", reason: error.message });
    }
  }
  const titles = [...pending];
  for (let offset = 0; offset < titles.length; offset += 40) {
    const batch = titles.slice(offset, offset + 40);
    try {
      const response = await api.get({
        action: "query",
        prop: "revisions",
        titles: batch.join("|"),
        rvprop: "ids|timestamp|content",
        rvslots: "main",
      });
      for (const page of response.query?.pages ?? []) {
        if (page.missing)
          report.failures.push({
            title: page.title,
            reason: "时装支持来源未建立",
          });
        else pages.set(page.pageid, page);
      }
    } catch (error) {
      report.failures.push({
        phase: "content",
        titles: batch,
        reason: error.message,
      });
    }
  }
  cache.pages = [...pages.values()];
  cache.incremental = report;
  await save(filename, cache);
  progress(
    `Outfit support: ${pages.size} source pages; ${report.changed.length} changed, ${report.unchanged} unchanged, ${report.failures.length} failures`,
  );
}

/** Static PRTS art pipeline. Originals stay private; only derived WebP files are published.
 * node scripts/prts-assets.mjs discover|sync|link|verify [--priority] [--offline] [--refresh]
 * --priority prepares the twelve visual-scene entries first. A subsequent sync completes the library.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const privateRoot = path.join(root, "data/prts-assets");
const publicRoot = path.join(root, "public/assets/library");
const args = new Set(process.argv.slice(2));
const command = [...args].find((arg) => !arg.startsWith("--")) || "sync";
const offline = args.has("--offline");
const refresh = args.has("--refresh");
const concurrency = Math.max(
  1,
  Math.min(
    12,
    Number(
      [...args]
        .find((arg) => arg.startsWith("--concurrency="))
        ?.split("=")[1] || 6,
    ),
  ),
);
const onlyNames = [...args]
  .find((arg) => arg.startsWith("--names="))
  ?.slice(8)
  .split(",");
const progress = (message) =>
  console.log(`[${new Date().toISOString()}] ${message}`);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wiki = (title) => `https://prts.wiki/w/${encodeURIComponent(title)}`;
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replaceAll("_", " ")
    .replace(/^(?:文件|File|Image):/i, "")
    .replace(/\s+/g, " ")
    .trim();
const readable = (value) =>
  normalize(value)
    .replace(/\([^)]*(?:敌方|敌人)[^)]*\)/g, "")
    .trim();
async function json(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".tmp", JSON.stringify(value) + "\n");
  await fs.rename(file + ".tmp", file);
}
async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
async function request(url, output) {
  if (offline) throw new Error(`Offline cache miss: ${url}`);
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["prts.wiki", "media.prts.wiki", "torappu.prts.wiki"].includes(
      parsed.hostname,
    )
  )
    throw new Error("Unexpected art host");
  if (output && !process.env.PRTS_DOWNLOAD_CURL) {
    // Node keeps same-host HTTPS connections alive between image requests.
    // curl remains the recovery path for hosts or CDN nodes that reject fetch.
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        const response = await fetch(parsed, {
          signal: AbortSignal.timeout(20000),
          redirect: "error",
          headers: {
            "User-Agent": "TerraExploration/2.0 (static art archive)",
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          const error = new Error(`HTTP ${response.status}: ${parsed.href}`);
          error.httpStatus = response.status;
          throw error;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        await fs.writeFile(output, bytes);
        return "";
      } catch (error) {
        if (error.httpStatus === 404 || error.httpStatus === 410) throw error;
        /* bounded retry, then use the existing curl transport */
      }
    }
  }
  const parameters = [
    "--ipv4",
    "--fail",
    "--silent",
    "--show-error",
    "--retry",
    output ? "2" : "4",
    "--connect-timeout",
    output ? "15" : "20",
    "--max-time",
    output ? "45" : "90",
    "--user-agent",
    "TerraExploration/2.0 (static art archive)",
  ];
  if (output) parameters.push("--output", output);
  // Optional route to a freshly resolved public IPv4 address when a CDN node is unavailable.
  // TLS certificate validation and the original hostname remain intact.
  if (
    parsed.hostname === "prts.wiki" &&
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(process.env.PRTS_API_IPV4 || "")
  )
    parameters.push("--resolve", `prts.wiki:443:${process.env.PRTS_API_IPV4}`);
  parameters.push(String(url));
  try {
    const { stdout } = await execute(
      process.platform === "win32" ? "curl.exe" : "curl",
      parameters,
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    );
    return stdout;
  } catch (error) {
    const status = error.stderr?.match(/returned error:\s*(\d{3})/);
    if (status) error.httpStatus = Number(status[1]);
    throw error;
  }
}
async function api(parameters) {
  const url = new URL("https://prts.wiki/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    maxlag: "5",
    ...parameters,
  });
  const cache = path.join(privateRoot, "api", digest(url.href) + ".json");
  const previous = await json(cache);
  if (previous && (!refresh || offline)) return previous.response;
  const response = JSON.parse(await request(url));
  if (response.error) throw new Error(JSON.stringify(response.error));
  await writeJson(cache, {
    fetchedAt: new Date().toISOString(),
    url: url.href,
    response,
  });
  return response;
}

async function discover() {
  const filename = path.join(privateRoot, "discovery.json");
  let snapshot = await json(filename, {
    schemaVersion: 1,
    complete: false,
    files: [],
    continuation: {},
  });
  if (snapshot.complete && !refresh) return snapshot;
  if (refresh)
    snapshot = {
      schemaVersion: 1,
      complete: false,
      files: [],
      continuation: {},
    };
  const files = new Map(
    snapshot.files.map((file) => [normalize(file.name), file]),
  );
  let continuation = snapshot.continuation || {};
  do {
    const response = await api({
      list: "allimages",
      ailimit: "500",
      aiprop: "url|size|sha1|timestamp|mime",
      ...continuation,
    });
    for (const file of response.query?.allimages ?? [])
      files.set(normalize(file.name), file);
    continuation = response.continue;
    snapshot = {
      schemaVersion: 1,
      discoveredAt: new Date().toISOString(),
      complete: !continuation,
      continuation: continuation || null,
      files: [...files.values()],
    };
    await writeJson(filename, snapshot);
    progress(
      `Discovered ${files.size} file records${snapshot.complete ? "; complete" : ""}`,
    );
  } while (continuation);
  return snapshot;
}

const priorities = new Map([
  ["阿米娅", "operator-amiya"],
  ["至纯源石", "item-originite-prime"],
  ["银灰", "operator-silverash"],
  ["耶拉冈德之石", "item-jerag-stone"],
  ["归溟幽灵鲨", "operator-specter-unchained"],
  ["首言者", "enemy-first-to-talk"],
  ["缪尔赛思", "operator-muelsyse"],
  ["莱茵生命", "rhine-lab"],
  ["能天使", "operator-exusiai"],
  ["巴别塔", "babel"],
  ["耀骑士临光", "operator-nearl-radiant"],
  ["夕", "operator-dusk"],
]);
const npcs = {
  首言者: "Avg_avg_npc_186.png",
  泥岩: "Avg_avg_npc_011_2.png",
  爱国者: "Avg_avg_npc_025_1.png",
  霜星: "Avg_char_1505_frstar_1.png",
  碎骨: "Avg_char_1500_skulsr.png",
  弑君者: "Avg_char_1502_crowns.png",
};
async function sceneMetadata() {
  const destination = path.join(privateRoot, "scene-metadata.json");
  const cached = await json(destination);
  if (cached && !refresh) return cached;
  if (offline) return { pages: [] };
  const response = await api({
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    titles: "Widget:Data_Char|Widget:Data_Image",
    formatversion: "2",
  });
  const value = {
    fetchedAt: new Date().toISOString(),
    pages: response.query?.pages || [],
  };
  await writeJson(destination, value);
  return value;
}
async function readEntities() {
  const sceneAliases = new Map();
  const sceneData = await sceneMetadata();
  for (const page of sceneData.pages || []) {
    const content = page.revisions?.[0]?.slots?.main?.content || "";
    for (const line of content.split(/\r?\n/)) {
      const [key, url] = line.split(",");
      if (!url?.startsWith("https://media.prts.wiki/")) continue;
      try {
        sceneAliases.set(
          key,
          decodeURIComponent(new URL(url).pathname.split("/").at(-1)),
        );
      } catch {
        /* non-image definitions are not artwork */
      }
    }
  }
  const entities = new Map();
  const add = (entity) => {
    if (!entity.id) return;
    const old = entities.get(entity.id);
    entities.set(entity.id, {
      ...old,
      ...entity,
      fileRefs: [
        ...new Set([...(old?.fileRefs || []), ...(entity.fileRefs || [])]),
      ],
    });
  };
  const legacy = await json(
    path.join(root, "src/data/catalogue-assets.json"),
    [],
  );
  for (const art of legacy)
    add({
      id: art.id,
      name: readable(art.name),
      kind: art.id.split("-")[0],
      source: { title: readable(art.name), url: art.sourcePage },
      fileRefs: [art.fileTitle],
    });
  for (const [name, id] of priorities)
    add({
      id,
      name,
      kind: id.startsWith("operator-")
        ? "operator"
        : id.startsWith("item-")
          ? "item"
          : id.startsWith("enemy-")
            ? "enemy"
            : "world",
      source: { title: name, url: wiki(name) },
    });
  const worldAssets = await json(
    path.join(root, "src/data/game-assets.json"),
    [],
  );
  for (const asset of worldAssets) {
    const title = decodeURIComponent(
      new URL(asset.filePage || asset.page).pathname.split("/w/")[1] || "",
    );
    const known = entities.get(asset.id);
    add({
      id: asset.id,
      name: known?.name || asset.name.replace(/标志$|景观$/, ""),
      kind: "world",
      fileRefs: [title],
    });
  }
  const manifest = await json(
    path.join(root, "public/data/prts/manifest.json"),
  );
  const detailShards = new Map();
  for (const shard of manifest?.indexShards ?? []) {
    const relative =
      typeof shard === "string" ? shard : (shard.path ?? shard.url);
    if (!relative) continue;
    const content = await json(path.join(root, "public", relative));
    for (const record of content?.records ?? []) {
      if (record.detailShard && !detailShards.has(record.detailShard)) {
        const detail = await json(
          path.join(root, "public", record.detailShard),
        );
        detailShards.set(
          record.detailShard,
          new Map((detail?.records || []).map((value) => [value.id, value])),
        );
      }
      const detail = detailShards.get(record.detailShard)?.get(record.id);
      add({
        ...record,
        fields: detail?.fields,
        namedArtRoles: Object.fromEntries(
          (detail?.artworkRefs ?? record.artworkRefs ?? [])
            .filter((reference) => reference.title && reference.role)
            .map((reference) => [
              normalize(reference.title).toLowerCase(),
              reference.role,
            ]),
        ),
        externalArts: (detail?.artworkRefs ?? record.artworkRefs ?? []).filter(
          (reference) => reference.url,
        ),
        fileRefs: (detail?.artworkRefs ?? record.artworkRefs ?? []).map(
          (reference) => reference.title,
        ),
      });
    }
  }
  const discovery = await json(path.join(root, "data/prts/discovery.json"));
  for (const page of discovery?.pages ?? []) {
    if (page.id)
      add({
        id: page.id,
        name: page.title,
        kind: page.kinds?.[0],
        source: {
          title: page.title,
          pageId: page.pageId,
          url: wiki(page.title),
        },
      });
  }
  const byPage = new Map();
  for (const entity of entities.values()) {
    if (entity.kind === "outfit") continue;
    const title = normalize(entity.source?.title || entity.name);
    if (!byPage.has(title)) byPage.set(title, []);
    byPage.get(title).push(entity);
  }
  const cargoDir = path.join(root, "data/prts/cargo");
  const cargoFiles = await fs.readdir(cargoDir).catch(() => []);
  for (const filename of cargoFiles.filter((name) => name.endsWith(".json"))) {
    const data = await json(path.join(cargoDir, filename));
    for (const row of data?.rows ?? []) {
      const matches = byPage.get(normalize(row.page)) || [];
      const text = Object.values(row)
        .filter((value) => typeof value === "string")
        .join("\n");
      const refs = [
        ...text.matchAll(/\[\[(?:文件|File|Image):([^|\]\n]+)/gi),
      ].map((match) => match[1]);
      for (const entity of matches) {
        if (entity.kind === "module" && filename !== "char_mod.json") continue;
        if (
          entity.kind === "module" &&
          filename === "char_mod.json" &&
          normalize(entity.name) !== normalize(row.name)
        )
          continue;
        entity.fileRefs.push(...refs);
        if (filename === "chara.json") {
          entity.charId = row.charId;
          entity.fileRefs.push(`Logo_${row.logo}.png`);
          entity.skinNames = Object.fromEntries(
            Object.entries(row)
              .filter(([key, value]) => /^skin\d+name$/.test(key) && value)
              .map(([key, value]) => [key.replace("name", ""), value]),
          );
        }
        if (filename === "item.json") {
          entity.iconId = row.iconId;
          if (row.filename) entity.fileRefs.push(row.filename);
        }
        if (filename === "char_mod.json" && row.equipIcon)
          entity.fileRefs.push(
            row.equipIcon,
            `模组_${row.equipIcon}.png`,
            `模组_${row.name}.png`,
          );
        if (filename === "furniture_themes.json")
          entity.fileRefs.push(
            `家具主题_${row.page}.png`,
            `家具主题预览_${row.page}.png`,
            `${row["theme icon"]}.png`,
            `${row["theme preview"]}.png`,
          );
      }
    }
  }
  const pages = discovery?.pages ?? [];
  const pageByTitle = new Map(
    pages.map((page) => [normalize(page.title), page]),
  );
  for (const entity of entities.values()) {
    if (["outfit", "module"].includes(entity.kind)) continue;
    if (entity.kind === "world" && entity.source?.title === "剧情角色一览")
      continue;
    if (args.has("--priority") && !priorities.has(readable(entity.name)))
      continue;
    const page = pageByTitle.get(
      normalize(entity.source?.title || entity.name),
    );
    const pageId = entity.source?.pageId || page?.pageId;
    if (pageId) {
      const raw = await json(
        path.join(root, `data/prts/raw/pages/${pageId}.json`),
      );
      const revision = raw?.revisions?.[0];
      const text =
        revision?.slots?.main?.content ??
        revision?.slots?.main?.["*"] ??
        revision?.["*"] ??
        "";
      entity.fileRefs.push(
        ...[...text.matchAll(/\[\[(?:文件|File|Image):([^|\]\n]+)/gi)].map(
          (match) => match[1],
        ),
      );
      // Template parameters and scene directives reference static files without wiki File syntax.
      entity.fileRefs.push(
        ...[
          ...text.matchAll(
            /(?:\||\n)\s*(?:Logo|图片|地图|封面|预览图|图片名|icon|image)\s*=\s*([^|}\n]+)/gi,
          ),
        ].flatMap((match) => {
          const value = match[1].trim();
          return /\.(png|jpe?g|webp|svg)$/i.test(value)
            ? [value]
            : [`${value}.png`, `${value}.jpg`];
        }),
      );
      entity.sceneRefs = [];
      for (const block of text.matchAll(
        /\[(Background|Image|Character|Charslot)\(([^\]]*)\)\]/gi,
      )) {
        for (const parameter of block[2].matchAll(
          /(?:image|name\d*)\s*=\s*"([^"]+)"/gi,
        )) {
          const value = parameter[1].split("#")[0];
          const mapped =
            sceneAliases.get(value) || sceneAliases.get(`bg_${value}`);
          entity.sceneRefs.push({
            value,
            file: mapped,
            role: /^(Background|Image)$/i.test(block[1])
              ? "background"
              : "illustration",
          });
        }
      }
    }
  }
  return [...entities.values()].filter(
    (entity) =>
      (!args.has("--priority") || priorities.has(readable(entity.name))) &&
      (!onlyNames || onlyNames.includes(entity.name)),
  );
}

async function prioritySnapshot(entities) {
  const partial = await json(path.join(privateRoot, "discovery.json"), {
    files: [],
  });
  const known = new Map(
    partial.files.map((file) => [normalize(file.name), file]),
  );
  const titles = new Set();
  for (const entity of entities) {
    const name = readable(entity.name);
    for (const ref of entity.fileRefs || [])
      titles.add(`File:${normalize(ref)}`);
    if (entity.kind === "operator") {
      for (const suffix of [
        "1",
        "2",
        ...Array.from({ length: 10 }, (_, i) => `skin${i + 1}`),
      ])
        titles.add(`File:立绘 ${name} ${suffix}.png`);
      titles.add(`File:头像 ${name}.png`);
    }
    for (const title of [
      `Logo ${name}.png`,
      `道具 ${name}.png`,
      `道具 带框 ${name}.png`,
      `头像 敌人 ${name}.png`,
      npcs[name],
    ])
      if (title) titles.add(`File:${title}`);
  }
  const pending = [...titles].filter((title) => !known.has(normalize(title)));
  for (let i = 0; i < pending.length; i += 50) {
    const response = await api({
      prop: "imageinfo",
      iiprop: "url|size|sha1|timestamp|mime",
      titles: pending.slice(i, i + 50).join("|"),
    });
    for (const page of Object.values(response.query?.pages || {})) {
      const info = page.imageinfo?.[0];
      if (info)
        known.set(normalize(page.title), {
          ...info,
          name: page.title.replace(/^(?:File|文件):/i, "").replaceAll(" ", "_"),
        });
    }
  }
  return { complete: false, files: [...known.values()] };
}

function buildMapping(files, entities) {
  const normalizedFiles = files.map((file) => ({
    file,
    key: normalize(file.name),
    stem: normalize(file.name).replace(/\.[^.]+$/, ""),
  }));
  const lookup = new Map(
    normalizedFiles.map((value) => [value.key.toLowerCase(), value.file]),
  );
  const find = (name) => lookup.get(normalize(name).toLowerCase());
  const stems = new Map();
  const portraits = new Map();
  const heads = new Map();
  for (const value of normalizedFiles) {
    if (!stems.has(value.stem)) stems.set(value.stem, []);
    stems.get(value.stem).push(value.file);
    const portrait = value.stem.match(
      /^立绘 (.+?) ((?:[12](?:\+|b)?|skin\d+)(?:\s.*|b)?)$/i,
    );
    if (portrait) {
      if (!portraits.has(portrait[1])) portraits.set(portrait[1], []);
      portraits
        .get(portrait[1])
        .push({ file: value.file, variant: portrait[2] });
    }
    const head = value.stem.match(/^头像 (.+?)(?: skin\d+.*)?$/);
    if (head) {
      if (!heads.has(head[1])) heads.set(head[1], []);
      heads.get(head[1]).push(value.file);
    }
  }
  const tasks = new Map();
  const byEntry = new Map();
  const exclusions = [];
  function add(entity, file, role, label) {
    if (!file) return;
    if (/^(?:界面|按钮|UI[_ ]|Wiki[_ ]|MediaWiki|PRTS站点)/i.test(file.name)) {
      exclusions.push({
        file: file.name,
        reason: "interface-fragment",
        entity: entity.id,
      });
      return;
    }
    if (!/^image\/(?:png|jpeg|webp|svg\+xml)$/.test(file.mime || "")) {
      exclusions.push({
        file: file.name,
        reason: "non-static-or-unsupported",
        entity: entity.id,
      });
      return;
    }
    const fileKey = file.sha1 || digest(file.url);
    if (!tasks.has(fileKey)) tasks.set(fileKey, { fileKey, file, entries: [] });
    if (!tasks.get(fileKey).entries.some((link) => link.entryId === entity.id))
      tasks
        .get(fileKey)
        .entries.push({ entryId: entity.id, role, label: label || file.name });
    if (!byEntry.has(entity.id)) byEntry.set(entity.id, []);
    if (!byEntry.get(entity.id).some((value) => value.fileKey === fileKey))
      byEntry.get(entity.id).push({ fileKey, role, label: label || file.name });
  }
  for (const entity of entities) {
    const name = readable(entity.name);
    const sourceName = readable(entity.source?.title || entity.name);
    const names = new Set([name, sourceName]);
    for (const value of names) {
      if (["operator", "outfit"].includes(entity.kind)) {
        for (const { file, variant } of portraits.get(value) || []) {
          if (
            entity.kind === "outfit" &&
            normalize(entity.skinNames?.[variant.split(" ")[0]]) !== name
          )
            continue;
          const role = /^skin/i.test(variant)
            ? "outfit"
            : variant.startsWith("2")
              ? "elite"
              : "portrait";
          add(
            entity,
            file,
            role,
            role === "outfit"
              ? `${entity.skinNames?.[variant.match(/^skin\d+/i)?.[0]] || "时装"}${/^skin\d+$/i.test(variant) ? "" : " · 差分"} ${variant}`
              : role === "elite"
                ? `精英化立绘${variant === "2" ? "" : ` · 差分 ${variant}`}`
                : `初始立绘${variant === "1" ? "" : ` · 差分 ${variant}`}`,
          );
        }
        for (const file of heads.get(value) || [])
          add(entity, file, "thumbnail", "干员头像");
      }
      const candidates = [
        [`头像 敌人 ${value}`, "enemy"],
        [`道具 ${value}`, "item"],
        [`道具 带框 ${value}`, "item"],
        [`家具 ${value}`, "furniture"],
        [`家具图 ${value}`, "furniture"],
        [`家具预览 ${value}`, "furniture"],
        [`家具主题 ${value}`, "furniture"],
        [`家具主题预览 ${value}`, "furniture"],
        [`模组 ${value}`, "module"],
        [`Logo ${value}`, "emblem"],
      ];
      for (const [stem, role] of candidates)
        for (const file of stems.get(stem) || [])
          add(entity, file, role, value);
      if (npcs[value]) add(entity, find(npcs[value]), "enemy", "人物立绘");
    }
    for (const scene of entity.sceneRefs || []) {
      const file = scene.file
        ? find(scene.file)
        : find(`Avg_${scene.value}.png`) || find(`Avg_${scene.value}$1.png`);
      if (file) add(entity, file, scene.role, scene.value);
    }
    for (const ref of entity.fileRefs ?? []) {
      const file = find(ref);
      if (!file) continue;
      const explicitRole = entity.namedArtRoles?.[normalize(ref).toLowerCase()];
      const role =
        explicitRole ||
        (entity.kind === "outfit"
          ? "outfit"
          : /^(?:头像)/.test(file.name)
            ? "thumbnail"
            : /^立绘/.test(file.name)
              ? "illustration"
              : /^Avg_/.test(file.name)
                ? /^Avg_bg/i.test(file.name)
                  ? "background"
                  : "illustration"
                : /^模组/.test(file.name)
                  ? "module"
                  : /^道具/.test(file.name)
                    ? "item"
                    : /^Logo/.test(file.name)
                      ? "emblem"
                      : /^家具/.test(file.name)
                        ? "furniture"
                        : entity.kind === "stage" &&
                            /地图|路线图/.test(file.name)
                          ? "map"
                          : "reference");
      add(entity, file, role, file.name.replace(/\.[^.]+$/, ""));
    }
    for (const ref of entity.externalArts || []) {
      try {
        const url = new URL(ref.url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "torappu.prts.wiki" ||
          !/\.(png|jpe?g|webp)$/i.test(url.pathname)
        )
          continue;
        const name = decodeURIComponent(url.pathname.split("/").at(-1));
        add(
          entity,
          {
            name,
            url: url.href,
            mime: /\.png$/i.test(name)
              ? "image/png"
              : /\.webp$/i.test(name)
                ? "image/webp"
                : "image/jpeg",
            descriptionurl:
              entity.source?.url || wiki(entity.source?.title || entity.name),
            associationSource:
              ref.sourceTemplate || ref.associationSource || entity.source?.url,
            size: 0,
          },
          ref.role || "reference",
          ref.title || entity.name,
        );
      } catch {
        /* only source-verified PRTS asset URLs are accepted */
      }
    }
  }
  return { tasks: [...tasks.values()], byEntry, exclusions };
}

async function loadSharp() {
  const require = createRequire(import.meta.url);
  try {
    return require("sharp");
  } catch {
    /* an explicit override supports shared build environments */
  }
  const candidates = [process.env.PRTS_SHARP_PATH];
  for (const candidate of candidates.filter(Boolean))
    try {
      return require(candidate);
    } catch {
      /* inspect next runtime */
    }
  throw new Error(
    "Sharp is required for static WebP derivatives. Install sharp or set PRTS_SHARP_PATH to its installed package.",
  );
}

const roleRank = {
  portrait: 0,
  elite: 1,
  outfit: 2,
  enemy: 3,
  map: 3,
  illustration: 4,
  background: 5,
  module: 6,
  preview: 7,
  "furniture-theme": 7,
  furniture: 8,
  emblem: 9,
  item: 10,
  reference: 11,
  thumbnail: 12,
};
function artworkForEntry(entity, mapping, records) {
  const artworks = (mapping.byEntry.get(entity.id) || [])
    .flatMap((link) => {
      const art = records[link.fileKey];
      return art ? [{ ...art, title: link.label, role: link.role }] : [];
    })
    .sort(
      (a, b) =>
        (roleRank[a.role] ?? 10) - (roleRank[b.role] ?? 10) ||
        a.title.localeCompare(b.title),
    );
  const groups = new Map();
  const repeatedTitles = new Map();
  for (const art of artworks) {
    if (!repeatedTitles.has(art.title))
      repeatedTitles.set(art.title, new Set());
    repeatedTitles.get(art.title).add(art.role);
  }
  for (const art of artworks) {
    if (repeatedTitles.get(art.title)?.size < 2) continue;
    if (art.role === "furniture-theme") art.title += " · 主题封面";
    if (art.role === "preview") art.title += " · 全景预览";
  }
  for (const art of artworks) {
    const key = `${art.role}:${art.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(art);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const provider = (art) =>
      new URL(art.sourceUrl).hostname === "torappu.prts.wiki"
        ? "游戏资源版"
        : "Wiki版";
    const seen = new Map();
    for (const art of group) {
      const label = provider(art);
      const count = group.filter((value) => provider(value) === label).length;
      seen.set(label, (seen.get(label) || 0) + 1);
      art.title += ` · ${label}${count > 1 ? ` ${seen.get(label)}` : ""}`;
    }
  }
  return artworks;
}
async function publish(mapping, entities, records, failures) {
  // Offline relinking must preserve source failures instead of presenting a false clean run.
  if (!failures) {
    const previous = await json(path.join(privateRoot, "report.json"), {});
    const unresolved = new Set(
      mapping.tasks
        .filter((task) => !records[task.fileKey])
        .map((task) => task.file.url),
    );
    failures = (previous.failures || []).filter((failure) =>
      unresolved.has(failure.sourceUrl),
    );
  }
  const entries = {};
  const thumbnails = {};
  const taskByKey = new Map(mapping.tasks.map((task) => [task.fileKey, task]));
  let sourceBytes = 0;
  for (const [key, record] of Object.entries(records)) {
    if (!record.originalBytes) {
      const file = taskByKey.get(key)?.file;
      if (file?.size) record.originalBytes = file.size;
    }
    sourceBytes += record.originalBytes || 0;
  }
  for (const entity of entities) {
    const artworks = artworkForEntry(entity, mapping, records);
    entries[entity.id] = artworks;
    const preferred =
      artworks.find((art) => art.role === "thumbnail") || artworks[0];
    if (preferred)
      thumbnails[entity.id] = preferred.thumbnail || preferred.path;
    await writeJson(path.join(publicRoot, "entries", `${entity.id}.json`), {
      schemaVersion: 1,
      entryId: entity.id,
      artworks,
    });
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assetsCount: Object.keys(records).length,
    activeAssets: mapping.tasks.filter((task) => records[task.fileKey]).length,
    expectedAssets: mapping.tasks.length,
    sourceBytes,
    expectedSourceBytes: mapping.tasks.reduce(
      (sum, task) =>
        sum + (records[task.fileKey]?.originalBytes ?? task.file.size ?? 0),
      0,
    ),
    derivedBytes: Object.values(records)
      .flatMap((record) => Object.values(record.variants))
      .reduce((sum, variant) => sum + variant.bytes, 0),
    scope: args.has("--priority")
      ? "visual-priority"
      : "entity-linked-static-artwork",
    mappedEntities: Object.values(entries).filter((art) => art.length).length,
    expectedEntities: entities.length,
    complete:
      failures.length === 0 &&
      mapping.tasks.every((task) => records[task.fileKey]),
    missing: entities
      .filter((entity) => !entries[entity.id]?.length)
      .map((entity) => ({ id: entity.id, name: entity.name })),
    failures,
    sourceUnavailable: failures.filter((failure) =>
      [404, 410].includes(failure.httpStatus),
    ),
    entries,
  };
  await writeJson(path.join(publicRoot, "manifest.json"), manifest);
  await writeJson(path.join(publicRoot, "thumbnails.json"), thumbnails);
  await writeJson(path.join(privateRoot, "records.json"), records);
  await writeJson(path.join(privateRoot, "report.json"), {
    generatedAt: manifest.generatedAt,
    discoveredFiles: mapping.tasks.length,
    ...manifest,
    entries: undefined,
    exclusions: mapping.exclusions,
  });
  return manifest;
}

async function sync(snapshot, entities) {
  const mapping = buildMapping(snapshot.files, entities);
  await writeJson(path.join(privateRoot, "mapping.json"), {
    generatedAt: new Date().toISOString(),
    entities: entities.map((entity) => ({ id: entity.id, name: entity.name })),
    tasks: mapping.tasks,
    exclusions: mapping.exclusions,
  });
  const records = await json(path.join(privateRoot, "records.json"), {});
  const sourceStatus = await json(
    path.join(privateRoot, "source-status.json"),
    {},
  );
  const previousReport = await json(path.join(privateRoot, "report.json"), {});
  for (const failure of previousReport.failures || []) {
    const status =
      failure.httpStatus ||
      Number(failure.error?.match(/returned error:\s*(\d{3})/)?.[1]);
    if ([404, 410].includes(status))
      sourceStatus[failure.sourceUrl] = {
        httpStatus: status,
        checkedAt: failure.checkedAt || previousReport.generatedAt,
      };
  }
  if (command === "map") {
    progress(
      `Mapped ${entities.length} entries to ${mapping.tasks.length} unique static images; source bytes ${mapping.tasks.reduce((total, task) => total + task.file.size, 0)}; file enumeration complete: ${snapshot.complete}`,
    );
    return;
  }
  if (command === "link") return publish(mapping, entities, records);
  await publish(mapping, entities, records);
  const sharp = await loadSharp();
  const sourceOverrides = await json(
    path.join(privateRoot, "source-overrides.json"),
    { fallbacks: {} },
  );
  sharp.concurrency(1);
  const failures = [];
  let cursor = 0;
  let finished = 0;
  const changedEntries = new Set();
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  await fs.mkdir(path.join(privateRoot, "originals"), { recursive: true });
  await fs.mkdir(path.join(publicRoot, "images"), { recursive: true });
  progress(
    `Mapping ${entities.length} entries to ${mapping.tasks.length} unique static images; original bytes ${mapping.tasks.reduce((total, task) => total + task.file.size, 0)}`,
  );
  async function work(task) {
    const file = task.file;
    const id = digest(task.fileKey).slice(0, 24);
    const existing = records[task.fileKey];
    if (
      !refresh &&
      existing &&
      (
        await Promise.all(
          Object.values(existing.variants).map((variant) =>
            exists(path.join(root, "public", variant.path)),
          ),
        )
      ).every(Boolean)
    )
      return;
    const unavailable = sourceStatus[file.url];
    if (
      !refresh &&
      !args.has("--retry-unavailable") &&
      unavailable &&
      Date.now() - Date.parse(unavailable.checkedAt) < 7 * 86400000
    ) {
      const error = new Error(
        `HTTP ${unavailable.httpStatus} (verified source unavailable): ${file.url}`,
      );
      error.httpStatus = unavailable.httpStatus;
      error.checkedAt = unavailable.checkedAt;
      throw error;
    }
    const ext =
      file.mime === "image/jpeg"
        ? "jpg"
        : file.mime === "image/svg+xml"
          ? "svg"
          : file.mime.split("/")[1];
    const original = path.join(
      privateRoot,
      "originals",
      `${task.fileKey}.${ext}`,
    );
    if (!(await exists(original))) {
      await request(file.url, original + ".part");
      let bytes = await fs.readFile(original + ".part");
      let sourceSha1 = createHash("sha1").update(bytes).digest("hex");
      if (file.sha1 && sourceSha1 !== file.sha1) {
        // Newly replaced wiki images can still be served from a stale CDN cache.
        const versioned = new URL(file.url);
        versioned.searchParams.set("terra-revision", file.sha1);
        await request(versioned, original + ".part");
        bytes = await fs.readFile(original + ".part");
        sourceSha1 = createHash("sha1").update(bytes).digest("hex");
        if (sourceSha1 !== file.sha1)
          throw new Error(`Source SHA-1 mismatch: ${file.name}`);
      }
      await fs.rename(original + ".part", original);
    }
    // A source-side broken original may have a valid MediaWiki-generated preview.
    // Keep the exact original and expose this exceptional derivation in provenance.
    const fallback = sourceOverrides.fallbacks?.[task.fileKey];
    let derivativeInput = original;
    let derivativeSource;
    if (fallback) {
      if (
        fallback.sourceUrl !== file.url ||
        fallback.originalSha1 !== file.sha1
      )
        throw new Error(
          `Source override does not match current revision: ${file.name}`,
        );
      derivativeInput = path.join(
        privateRoot,
        "originals",
        `${task.fileKey}-prts-thumbnail.jpg`,
      );
      if (!(await exists(derivativeInput))) {
        await request(fallback.url, derivativeInput + ".part");
        const bytes = await fs.readFile(derivativeInput + ".part");
        if (createHash("sha1").update(bytes).digest("hex") !== fallback.sha1)
          throw new Error(`Fallback SHA-1 mismatch: ${file.name}`);
        await fs.rename(derivativeInput + ".part", derivativeInput);
      }
      const bytes = await fs.readFile(derivativeInput);
      derivativeSource = {
        type: "prts-generated-thumbnail",
        sourceUrl: fallback.url,
        sourceSha1: fallback.sha1,
        sha256: digest(bytes),
        cachedOriginal: path
          .relative(root, derivativeInput)
          .replaceAll("\\", "/"),
        bytes: bytes.length,
        reason: fallback.reason,
        evidence: fallback.evidence,
        checkedAt: fallback.checkedAt,
      };
    }
    const metadata = await sharp(derivativeInput, {
      limitInputPixels: 100000000,
      animated: false,
    }).metadata();
    if ((metadata.pages ?? 1) > 1)
      throw new Error(`Animated image excluded: ${file.name}`);
    const variants = {};
    const maxDimension = Math.max(metadata.width, metadata.height);
    const sizes = [
      ...new Set(
        [160, 480, 960, 1440].map((width) => Math.min(width, maxDimension)),
      ),
    ];
    for (const size of sizes) {
      const relative = `assets/library/images/${id}-${size}.webp`;
      const filename = path.join(root, "public", relative);
      const { data, info } = await sharp(derivativeInput, {
        limitInputPixels: 100000000,
      })
        .resize({
          width: size,
          height: size,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: size <= 160 ? 76 : 84, alphaQuality: 90, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      await fs.writeFile(filename, data);
      variants[size] = {
        path: relative,
        width: info.width,
        height: info.height,
        bytes: data.length,
        sha256: digest(data),
      };
    }
    const source = await fs.readFile(original);
    const choose = (target) =>
      variants[sizes.find((size) => size >= target) ?? sizes.at(-1)];
    const main = choose(960);
    records[task.fileKey] = {
      id,
      title: file.name,
      role: "reference",
      path: main.path,
      thumbnail: choose(160).path,
      preview: choose(480).path,
      full: choose(1440).path,
      width: main.width,
      height: main.height,
      originalWidth: file.width || metadata.width,
      originalHeight: file.height || metadata.height,
      originalBytes: source.length,
      cachedOriginal: path.relative(root, original).replaceAll("\\", "/"),
      sourceUrl: file.url,
      filePage: file.descriptionurl || wiki(`文件:${file.name}`),
      fileTitle: file.name,
      sourceSha1: file.sha1 || createHash("sha1").update(source).digest("hex"),
      associationSource: file.associationSource,
      sha256: digest(source),
      sourceTimestamp: file.timestamp,
      derivativeSource,
      checkedAt: new Date().toISOString().slice(0, 10),
      rights:
        "明日方舟 / 鹰角网络及关联权利人；PRTS Wiki 托管。游戏美术非开放许可。",
      variants,
    };
    for (const entry of task.entries) changedEntries.add(entry.entryId);
  }
  // Keep a bounded worker pool moving while an individual CDN request retries.
  // Serialize checkpoints so simultaneous completions cannot overwrite a newer save.
  let checkpoint = Promise.resolve();
  let savedFailures = -1;
  function saveCheckpoint() {
    checkpoint = checkpoint.then(async () => {
      const entryIds = [...changedEntries];
      if (!entryIds.length && failures.length === savedFailures) return;
      for (const id of entryIds) changedEntries.delete(id);
      if (entryIds.length)
        await writeJson(path.join(privateRoot, "records.json"), records);
      await writeJson(
        path.join(privateRoot, "source-status.json"),
        sourceStatus,
      );
      await writeJson(path.join(privateRoot, "failures-latest.json"), {
        generatedAt: new Date().toISOString(),
        failures,
      });
      savedFailures = failures.length;
      for (const id of entryIds) {
        const entity = entitiesById.get(id);
        await writeJson(path.join(publicRoot, "entries", `${id}.json`), {
          schemaVersion: 1,
          entryId: id,
          artworks: artworkForEntry(entity, mapping, records),
        });
      }
    });
    return checkpoint;
  }
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < mapping.tasks.length) {
        const task = mapping.tasks[cursor++];
        try {
          await work(task);
        } catch (error) {
          const checkedAt = error.checkedAt || new Date().toISOString();
          if ([404, 410].includes(error.httpStatus))
            sourceStatus[task.file.url] = {
              httpStatus: error.httpStatus,
              checkedAt,
            };
          failures.push({
            file: task.file.name,
            sourceUrl: task.file.url,
            httpStatus: error.httpStatus,
            checkedAt,
            error: error.stderr?.trim() || String(error),
          });
          progress(
            `Failed ${task.file.name}: ${(error.stderr?.trim() || error.message).slice(0, 140)}`,
          );
        }
        finished++;
        if (finished % (concurrency * 10) === 0) await saveCheckpoint();
        if (
          finished % (concurrency * 5) === 0 ||
          finished === mapping.tasks.length
        )
          progress(
            `Prepared ${finished}/${mapping.tasks.length}; failures ${failures.length}`,
          );
      }
    }),
  );
  await saveCheckpoint();
  const result = await publish(mapping, entities, records, failures);
  progress(
    `Published ${result.assetsCount} images for ${result.mappedEntities}/${result.expectedEntities} entries; failures ${failures.length}`,
  );
  if (failures.length) process.exitCode = 1;
  return result;
}

async function verify() {
  const records = await json(path.join(privateRoot, "records.json"), {});
  const manifest = await json(path.join(publicRoot, "manifest.json"));
  const errors = [];
  if (!manifest) errors.push("Missing public library manifest");
  let variants = 0;
  const originalNames = await fs.readdir(path.join(privateRoot, "originals"));
  const originalByKey = new Map(
    originalNames
      .filter((name) => !name.endsWith(".part"))
      .map((name) => [name.slice(0, name.lastIndexOf(".")), name]),
  );
  let originalBytes = 0;
  for (const [key, record] of Object.entries(records)) {
    if (
      !record.sourceUrl ||
      !record.filePage ||
      !record.rights ||
      !record.sha256
    )
      errors.push(`Missing provenance: ${record.id}`);
    const original = record.cachedOriginal
      ? path.join(root, record.cachedOriginal)
      : path.join(
          privateRoot,
          "originals",
          originalByKey.get(key) || "missing",
        );
    const source = await fs.readFile(original).catch(() => null);
    if (
      !source ||
      digest(source) !== record.sha256 ||
      createHash("sha1").update(source).digest("hex") !== record.sourceSha1
    )
      errors.push(`Missing or corrupted original: ${record.fileTitle}`);
    else originalBytes += source.length;
    if (record.derivativeSource) {
      const fallback = await fs
        .readFile(path.join(root, record.derivativeSource.cachedOriginal))
        .catch(() => null);
      if (
        !fallback ||
        digest(fallback) !== record.derivativeSource.sha256 ||
        createHash("sha1").update(fallback).digest("hex") !==
          record.derivativeSource.sourceSha1
      )
        errors.push(
          `Missing or corrupted source fallback: ${record.fileTitle}`,
        );
    }
    for (const variant of Object.values(record.variants)) {
      const bytes = await fs
        .readFile(path.join(root, "public", variant.path))
        .catch(() => null);
      if (
        !bytes ||
        bytes.length !== variant.bytes ||
        digest(bytes) !== variant.sha256
      )
        errors.push(`Missing or corrupted derivative: ${variant.path}`);
      variants++;
    }
  }
  for (const [id, artworks] of Object.entries(manifest?.entries ?? {})) {
    const entry = await json(path.join(publicRoot, "entries", `${id}.json`));
    if (!entry || JSON.stringify(entry.artworks) !== JSON.stringify(artworks))
      errors.push(`Per-entry manifest mismatch: ${id}`);
  }
  const files = await fs.readdir(publicRoot, {
    recursive: true,
    withFileTypes: true,
  });
  let publicBytes = 0;
  let publicFiles = 0;
  for (let offset = 0; offset < files.length; offset += 128) {
    await Promise.all(
      files
        .slice(offset, offset + 128)
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const stat = await fs.stat(path.join(entry.parentPath, entry.name));
          publicBytes += stat.size;
          publicFiles++;
        }),
    );
  }
  const result = {
    checkedAt: new Date().toISOString(),
    assets: Object.keys(records).length,
    activeAssets: manifest?.activeAssets || 0,
    variants,
    originalBytes,
    derivedBytes: Object.values(records)
      .flatMap((record) => Object.values(record.variants))
      .reduce((sum, variant) => sum + variant.bytes, 0),
    publicFiles,
    publicBytes,
    entities: Object.keys(manifest?.entries ?? {}).length,
    mappedEntities: manifest?.mappedEntities || 0,
    missingArt: manifest?.missing?.length || 0,
    unresolvedSources: manifest?.failures?.length || 0,
    missingSources: manifest?.sourceUnavailable?.length || 0,
    complete: manifest?.complete || false,
    errors,
  };
  await writeJson(path.join(privateRoot, "verification.json"), result);
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (command === "verify") await verify();
else if (command === "scene-metadata") await sceneMetadata();
else {
  await fs.mkdir(privateRoot, { recursive: true });
  if (command === "discover") await discover();
  else {
    const entities = await readEntities();
    const snapshot =
      command === "map"
        ? await json(path.join(privateRoot, "discovery.json"), {
            files: [],
            complete: false,
          })
        : args.has("--priority")
          ? await prioritySnapshot(entities)
          : await discover();
    await sync(snapshot, entities);
  }
}

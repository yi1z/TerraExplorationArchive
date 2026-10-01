/**
 * Import the explicitly curated PRTS catalogue art. No browser-time scraping.
 * Usage: node scripts/import-catalogue-assets.mjs [--only=operator-amiya,operator-kaltsit]
 * Existing local files are validated by SHA-256 and reused. --refresh re-queries PRTS.
 * --verify checks the complete curated list and local file hashes without network access.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const checkedAt =
  process.env.CATALOGUE_CHECKED_AT || new Date().toISOString().slice(0, 10);
const manifestPath = path.join(root, "src/data/catalogue-assets.json");
const outputDirectory = path.join(root, "public/assets/catalogue");
const only = process.argv
  .find((argument) => argument.startsWith("--only="))
  ?.slice(7)
  .split(",");
const refresh = process.argv.includes("--refresh");
const operators = [
  ["amiya", "阿米娅"],
  ["kaltsit", "凯尔希"],
  ["rosmontis", "迷迭香"],
  ["w", "W"],
  ["chen", "陈"],
  ["hoshiguma", "星熊"],
  ["texas", "德克萨斯"],
  ["exusiai", "能天使"],
  ["lappland", "拉普兰德"],
  ["silverash", "银灰"],
  ["pramanix", "初雪"],
  ["gnosis", "灵知"],
  ["saria", "塞雷娅"],
  ["ifrit", "伊芙利特"],
  ["ptilopsis", "白面鸮"],
  ["skadi", "斯卡蒂"],
  ["specter", "幽灵鲨"],
  ["specter-unchained", "归溟幽灵鲨"],
  ["nearl", "临光"],
  ["nearl-radiant", "耀骑士临光"],
  ["siege", "推进之王"],
  ["reed", "苇草"],
  ["eyjafjalla", "艾雅法拉"],
  ["suzuran", "铃兰"],
];
const enemies = [
  ["originium-slug", "源石虫"],
  ["hound", "猎狗"],
  ["crossbowman", "弩手"],
  ["caster", "术师"],
  ["monster", "妖怪"],
  ["heavy-defender", "重装防御者"],
  ["sarkaz-caster", "萨卡兹术师"],
  ["guerrilla-shieldguard", "游击队盾卫"],
  ["winterwisp-blood-shaman", "冬灵血巫"],
  ["mudrock", "泥岩(敌方)"],
  ["crownslayer", "弑君者(敌方)"],
  ["skullshatterer", "碎骨"],
  ["frostnova", "霜星"],
  ["patriot", "爱国者"],
  ["first-to-talk", "首言者"],
  ["quintus", "盐风主教昆图斯"],
];
// Full illustrations explicitly exposed on the respective PRTS enemy pages.
// Enemy icons remain available as thumbnails when an illustration is present.
const enemyIllustrations = {
  "enemy-originium-slug": "文件:Avg_avg_npc_1431_1$1.png",
  "enemy-crossbowman": "文件:Avg_avg_npc_016.png",
  "enemy-caster": "文件:Avg_avg_npc_332_1$1.png",
  "enemy-guerrilla-shieldguard": "文件:Avg_avg_npc_058.png",
  "enemy-mudrock": "文件:Avg_avg_npc_011_2.png",
  "enemy-crownslayer": "文件:Avg_char_1502_crowns.png",
  "enemy-skullshatterer": "文件:Avg_char_1500_skulsr.png",
  "enemy-frostnova": "文件:Avg_char_1505_frstar_1.png",
  "enemy-patriot": "文件:Avg_avg_npc_025_1.png",
  "enemy-first-to-talk": "文件:Avg_avg_npc_186.png",
};
const items = [
  ["originite-prime", "至纯源石"],
  ["orundum", "合成玉"],
  ["lmd", "龙门币"],
  ["pure-gold", "赤金"],
  ["orirock", "源岩"],
  ["orirock-cube", "固源岩"],
  ["orirock-cluster", "固源岩组"],
  ["orirock-concentration", "提纯源岩"],
  ["oriron-cluster", "异铁组"],
  ["aketon", "酮凝集组"],
  ["integrated-device", "全新装置"],
  ["polyester-pack", "聚酸酯组"],
  ["sugar-pack", "糖组"],
  ["manganese-ore", "轻锰矿"],
  ["grindstone", "研磨石"],
  ["rma70-12", "RMA70-12"],
  ["d32-steel", "D32钢"],
  ["module-data-block", "模组数据块"],
  ["siesta-obsidian", "汐斯塔的黑曜石"],
  ["guerrilla-badge", "游击队员徽章"],
  ["wolumonde-warrant", "沃伦姆德搜查令"],
  ["mieszko-ticket", "梅什科竞技证券"],
  ["jerag-stone", "耶拉冈德之石"],
  ["etched-ammo", "蚀刻弹弹壳"],
];
const framedItemIds = new Set([
  "item-module-data-block",
  "item-guerrilla-badge",
  "item-wolumonde-warrant",
  "item-etched-ammo",
]);
const catalogue = [
  ...operators.map(([id, name]) => ({
    id: `operator-${id}`,
    name,
    category: "operator",
  })),
  ...enemies.map(([id, name]) => ({
    id: `enemy-${id}`,
    name,
    category: "enemy",
  })),
  ...items.map(([id, name]) => ({ id: `item-${id}`, name, category: "item" })),
].filter((entry) => !only || only.includes(entry.id));

await fs.mkdir(outputDirectory, { recursive: true });
let manifest = JSON.parse(
  await fs.readFile(manifestPath, "utf8").catch(() => "[]"),
);
const failures = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePageFor = (name) =>
  "https://prts.wiki/w/" + encodeURIComponent(name);
const normalTitle = (title) => title.replaceAll("_", " ");

if (process.argv.includes("--verify")) {
  const errors = [];
  const keys = new Set();
  for (const asset of manifest) {
    const key = `${asset.id}:${asset.kind}`;
    if (keys.has(key)) errors.push(`Duplicate asset: ${key}`);
    keys.add(key);
    const bytes = await fs
      .readFile(path.join(root, "public", asset.path))
      .catch(() => null);
    if (!bytes || sha256(bytes) !== asset.sha256)
      errors.push(`Missing or changed asset: ${key}`);
    else if (
      bytes.length !== asset.bytes ||
      bytes.readUInt32BE(16) !== asset.width ||
      bytes.readUInt32BE(20) !== asset.height
    )
      errors.push(`Incorrect image metadata: ${key}`);
    if (
      !asset.sourcePage ||
      !asset.sourceUrl ||
      !asset.filePage ||
      !asset.checkedAt ||
      !asset.rights
    )
      errors.push(`Missing provenance: ${key}`);
  }
  for (const entry of catalogue) {
    const kinds =
      entry.category === "operator"
        ? ["portrait", "elite", "thumbnail"]
        : entry.category === "enemy" && enemyIllustrations[entry.id]
          ? ["enemy", "thumbnail"]
          : [entry.category];
    for (const kind of kinds)
      if (!keys.has(`${entry.id}:${kind}`))
        errors.push(`Missing required asset: ${entry.id}:${kind}`);
  }
  console.log(
    JSON.stringify(
      { entries: catalogue.length, assets: manifest.length, errors },
      null,
      2,
    ),
  );
  process.exit(errors.length ? 1 : 0);
}

async function request(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["prts.wiki", "media.prts.wiki"].includes(parsed.hostname)
  ) {
    throw new Error("Unexpected source host");
  }
  const { stdout } = await execute(
    process.platform === "win32" ? "curl.exe" : "curl",
    [
      "--ipv4",
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "2",
      "--connect-timeout",
      "12",
      "--max-time",
      "50",
      "--user-agent",
      "TerraExploration/1.0 (curated art importer)",
      String(url),
    ],
    { encoding: "buffer", maxBuffer: 16000000, windowsHide: true },
  );
  return stdout;
}

async function api(parameters) {
  const url = new URL("https://prts.wiki/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    ...parameters,
  });
  const result = JSON.parse((await request(url)).toString("utf8"));
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
}

async function metadataFor(titles, width = 1200) {
  const result = await api({
    prop: "imageinfo",
    iiprop: "url|size|sha1|timestamp",
    iiurlwidth: String(width),
    titles: titles.join("|"),
  });
  return new Map(
    Object.values(result.query.pages)
      .filter((page) => page.imageinfo)
      .map((page) => [normalTitle(page.title), page.imageinfo[0]]),
  );
}

async function alreadyValid(id, kind, fileTitle) {
  if (refresh) return false;
  const asset = manifest.find(
    (candidate) => candidate.id === id && candidate.kind === kind,
  );
  if (!asset) return false;
  if (fileTitle && normalTitle(asset.fileTitle) !== normalTitle(fileTitle))
    return false;
  const bytes = await fs
    .readFile(path.join(root, "public", asset.path))
    .catch(() => null);
  return bytes && sha256(bytes) === asset.sha256;
}

async function save(entry, kind, fileTitle, info) {
  if (await alreadyValid(entry.id, kind, fileTitle)) return;
  if (!info) throw new Error(`Missing PRTS file: ${fileTitle}`);
  const remoteUrl = info.thumburl || info.url;
  const bytes = await request(remoteUrl);
  if (
    bytes.length < 64 ||
    bytes.length > 15000000 ||
    bytes.readUInt32BE(0) !== 0x89504e47
  ) {
    throw new Error(`Invalid or oversized PNG: ${fileTitle}`);
  }
  const localPath = `assets/catalogue/${entry.id}-${kind}.png`;
  await fs.writeFile(path.join(root, "public", localPath), bytes);
  const asset = {
    id: entry.id,
    kind,
    name: entry.name,
    path: localPath,
    sourcePage: sourcePageFor(entry.name),
    sourceUrl: info.url,
    downloadedUrl: remoteUrl,
    filePage: info.descriptionurl,
    fileTitle,
    sourceTimestamp: info.timestamp,
    rights:
      "明日方舟 / 鹰角网络及关联权利人；PRTS Wiki 托管。游戏美术版权保留，非开放许可。",
    checkedAt,
    bytes: bytes.length,
    sha256: sha256(bytes),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    focalPoint:
      entry.category === "operator" && kind !== "thumbnail"
        ? { x: 0.5, y: 0.42 }
        : { x: 0.5, y: 0.5 },
  };
  manifest = manifest.filter(
    (candidate) => candidate.id !== entry.id || candidate.kind !== kind,
  );
  manifest.push(asset);
  console.log(
    `Saved ${entry.id} ${kind} (${asset.width}x${asset.height}, ${bytes.length} bytes)`,
  );
}

async function flushManifest() {
  manifest.sort((a, b) =>
    `${a.id}:${a.kind}`.localeCompare(`${b.id}:${b.kind}`),
  );
  const json = JSON.stringify(manifest, null, 2) + "\n";
  await fs.writeFile(manifestPath, json);
  await fs.writeFile(path.join(outputDirectory, "sources.json"), json);
}

async function importEntry(entry) {
  const variants =
    entry.category === "operator"
      ? [
          ["portrait", `文件:立绘_${entry.name}_1.png`],
          ["elite", `文件:立绘_${entry.name}_2.png`],
          ["thumbnail", `文件:头像_${entry.name}.png`],
        ]
      : entry.category === "enemy"
        ? enemyIllustrations[entry.id]
          ? [
              ["enemy", enemyIllustrations[entry.id]],
              [
                "thumbnail",
                `文件:头像_敌人_${entry.name.replace("(敌方)", "")}.png`,
              ],
            ]
          : [
              [
                "enemy",
                `文件:头像_敌人_${entry.name.replace("(敌方)", "")}.png`,
              ],
            ]
        : [
            [
              "item",
              `文件:道具_${framedItemIds.has(entry.id) ? "带框_" : ""}${entry.name}.png`,
            ],
          ];
  const needed = [];
  for (const variant of variants)
    if (!(await alreadyValid(entry.id, variant[0], variant[1])))
      needed.push(variant);
  if (!needed.length) return;
  const metadata = await metadataFor(needed.map(([, title]) => title));
  for (const [kind, title] of needed) {
    try {
      await save(entry, kind, title, metadata.get(normalTitle(title)));
    } catch (error) {
      failures.push({ id: entry.id, kind, error: String(error) });
    }
  }
}

// Keep the featured artwork available early; then use small batches to be polite to PRTS.
for (let offset = 0; offset < catalogue.length; offset += 3) {
  await Promise.all(
    catalogue.slice(offset, offset + 3).map(async (entry) => {
      try {
        await importEntry(entry);
      } catch (error) {
        failures.push({ id: entry.id, error: String(error) });
      }
    }),
  );
  await flushManifest();
}
console.log(
  JSON.stringify(
    {
      entries: new Set(manifest.map((asset) => asset.id)).size,
      assets: manifest.length,
      bytes: manifest.reduce((total, asset) => total + asset.bytes, 0),
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;

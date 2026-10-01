import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const countries = {
  ursus: "乌萨斯",
  yan: "炎",
  leithanien: "莱塔尼亚",
  sargon: "萨尔贡",
  victoria: "维多利亚",
  columbia: "哥伦比亚",
  kazimierz: "卡西米尔",
  kjerag: "谢拉格",
  siracusa: "叙拉古",
  laterano: "拉特兰",
  iberia: "伊比利亚",
  bolivar: "玻利瓦尔",
  higashi: "东",
  sami: "萨米",
  minos: "米诺斯",
  "rim-billiton": "雷姆必拓",
  kazdel: "卡兹戴尔",
  aegir: "阿戈尔",
  durin: "杜林",
};
const factions = {
  "rhodes-island": "罗德岛",
  reunion: "整合运动_黑底",
  "penguin-logistics": "企鹅物流",
  "rhine-lab": "莱茵生命",
  karlan: "喀兰贸易",
  babel: "巴别塔",
  lungmen: "炎-龙门",
  siesta: "汐斯塔",
};
const folder = path.join(root, "public/assets/game");
await fs.mkdir(folder, { recursive: true });
const manifest = JSON.parse(
  await fs
    .readFile(path.join(root, "src/data/game-assets.json"), "utf8")
    .catch(() => "[]"),
);
const failures = [];
async function request(url) {
  const { stdout } = await execute(
    "curl.exe",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "1",
      "--connect-timeout",
      "6",
      "--max-time",
      "18",
      String(url),
    ],
    { encoding: "buffer", maxBuffer: 6000000, windowsHide: true },
  );
  return {
    text: async () => stdout.toString("utf8"),
    json: async () => JSON.parse(stdout.toString("utf8")),
    arrayBuffer: async () => stdout,
  };
}
async function save(id, kind, name, remoteUrl, page, filePage) {
  if (manifest.some((a) => a.id === id && a.kind === kind)) return;
  const url = new URL(remoteUrl);
  if (url.hostname !== "media.prts.wiki" || url.protocol !== "https:")
    throw Error("Unexpected asset host");
  const response = await request(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length > 5000000 ||
    bytes.length < 64 ||
    bytes.readUInt32BE(0) !== 0x89504e47
  )
    throw Error("Invalid or oversized PNG");
  const local = "assets/game/" + id + "-" + kind + ".png";
  await fs.writeFile(path.join(root, "public", local), bytes);
  manifest.push({
    id,
    kind,
    name,
    path: local,
    url: remoteUrl,
    page,
    filePage,
    credit: "明日方舟 / 鹰角网络及关联权利人；PRTS Wiki 托管",
    license: "游戏美术与商标版权保留；非开放许可",
    downloadedAt: "2026-09-30",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const index = JSON.parse(
  await fs
    .readFile(path.join(root, "artifacts/prts-logo-index.json"), "utf8")
    .catch(
      async () =>
        await (
          await request(
            "https://prts.wiki/api.php?action=query&list=allimages&aiprefix=Logo_&ailimit=100&format=json",
          )
        ).text(),
    ),
);
const logos = new Map(index.query.allimages.map((i) => [i.name, i]));
const tasks = Object.entries({ ...countries, ...factions });
for (let offset = 0; offset < tasks.length; offset += 2) {
  await Promise.all(
    tasks.slice(offset, offset + 2).map(async ([id, name]) => {
      const logo = logos.get("Logo_" + name + ".png");
      if (logo) {
        try {
          await save(
            id,
            "emblem",
            name.replace("_黑底", "") + "标志",
            logo.url,
            logo.descriptionurl,
            logo.descriptionurl,
          );
        } catch (error) {
          failures.push({ id, kind: "emblem", error: String(error) });
        }
      }
      if (
        !countries[id] ||
        ["sami", "minos", "rim-billiton", "kazdel", "aegir", "durin"].includes(
          id,
        ) ||
        manifest.some((a) => a.id === id && a.kind === "landscape")
      )
        return;
      const page =
        "https://prts.wiki/w/" + encodeURIComponent("泰拉大典:地理/" + name);
      try {
        const html = await (await request(page)).text();
        const tag = [...html.matchAll(/<img\b[^>]*>/g)]
          .map((x) => x[0])
          .find((x) => /Avg_bg/i.test(x));
        if (!tag) return;
        const large = tag.match(
          /https:\/\/media\.prts\.wiki\/[^\s"<>]*\/700px-[^\s"<>]*/,
        )?.[0];
        const url = large || tag.match(/src="([^"]+)"/)?.[1];
        if (!url) return;
        const file = decodeURIComponent(
          new URL(url).pathname.split("/").pop(),
        ).replace(/^\d+px-/, "");
        await save(
          id,
          "landscape",
          name + "地区景观",
          url.replaceAll("&amp;", "&"),
          page,
          "https://prts.wiki/w/" + encodeURIComponent("文件:" + file),
        );
      } catch (error) {
        failures.push({ id, kind: "landscape", error: String(error) });
      }
    }),
  );
}
manifest.sort((a, b) => (a.id + a.kind).localeCompare(b.id + b.kind));
await fs.writeFile(
  path.join(root, "src/data/game-assets.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await fs.writeFile(
  path.join(root, "public/assets/game/sources.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      assets: manifest.length,
      bytes: manifest.reduce((n, a) => n + a.bytes, 0),
      emblems: manifest.filter((a) => a.kind === "emblem").map((a) => a.id),
      landscapes: manifest
        .filter((a) => a.kind === "landscape")
        .map((a) => a.id),
      failures,
    },
    null,
    2,
  ),
);

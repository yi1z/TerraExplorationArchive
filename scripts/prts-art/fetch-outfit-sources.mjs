import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const destination = path.join(root, "data/prts/support/outfit-sources.json");
const input = process.argv.slice(2);
const titles = input.filter((argument) => !argument.startsWith("--"));
if (!titles.length)
  titles.push(
    "模板:时装商店",
    "模板:时装回廊/半身像",
    "时装回廊",
    "时装回廊/忒斯特收藏",
  );
let cache = { schemaVersion: 1, pages: [], requests: [] };
try {
  cache = JSON.parse(await fs.readFile(destination, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (input.includes("--discover-series")) {
  const url = new URL("https://prts.wiki/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    list: "allpages",
    apprefix: "时装回廊/",
    apnamespace: "0",
    aplimit: "500",
  });
  const args = [
    "--ipv4",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "15",
    "--max-time",
    "60",
    "--retry",
    "2",
  ];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(process.env.PRTS_API_IPV4 || ""))
    args.push("--resolve", `prts.wiki:443:${process.env.PRTS_API_IPV4}`);
  args.push(url.href);
  const { stdout } = await run(
    process.platform === "win32" ? "curl.exe" : "curl",
    args,
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  );
  const response = JSON.parse(stdout);
  if (response.error || response.continue)
    throw new Error("Unexpected incomplete series discovery");
  cache.discovery = {
    url: url.href,
    fetchedAt: new Date().toISOString(),
    response,
  };
  titles.push(
    ...response.query.allpages.map((page) => page.title),
    "模板:干员时装",
    "微件:SkinShop",
  );
}
for (let offset = 0; offset < titles.length; offset += 20) {
  const batch = titles
    .slice(offset, offset + 20)
    .filter((title) => !cache.pages.some((page) => page.title === title));
  if (!batch.length) continue;
  const url = new URL("https://prts.wiki/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    titles: batch.join("|"),
  });
  const args = [
    "--ipv4",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "15",
    "--max-time",
    "60",
    "--retry",
    "2",
  ];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(process.env.PRTS_API_IPV4 || ""))
    args.push("--resolve", `prts.wiki:443:${process.env.PRTS_API_IPV4}`);
  args.push(url.href);
  const { stdout } = await run(
    process.platform === "win32" ? "curl.exe" : "curl",
    args,
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const response = JSON.parse(stdout);
  if (response.error) throw new Error(JSON.stringify(response.error));
  const pages = Object.values(response.query?.pages || {});
  cache.requests.push({
    url: url.href,
    fetchedAt: new Date().toISOString(),
    normalized: response.query?.normalized || [],
  });
  for (const page of pages) {
    const index = cache.pages.findIndex((known) => known.title === page.title);
    if (index >= 0) cache.pages[index] = page;
    else cache.pages.push(page);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(cache, null, 2) + "\n");
}
console.log(
  JSON.stringify(
    cache.pages.map((page) => ({
      title: page.title,
      pageId: page.pageid,
      revision: page.revisions?.[0]?.revid,
      characters:
        (
          page.revisions?.[0]?.slots?.main?.content ||
          page.revisions?.[0]?.slots?.main?.["*"]
        )?.length || 0,
    })),
    null,
    2,
  ),
);

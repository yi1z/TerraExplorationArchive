/** Query actual PRTS thumbnail metadata; never synthesize a CDN URL. */
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (
  args.some(
    (arg) => arg !== "--cards-only" && !/^--(?:kind|budget-ms)=/.test(arg),
  )
)
  throw new Error(
    "Usage: fetch-online-thumbnails.mjs [--cards-only] [--kind=operator] [--budget-ms=180000]",
  );
const cardsOnly = args.includes("--cards-only");
const kind = args.find((arg) => arg.startsWith("--kind="))?.slice(7);
const budget = Number(
  args.find((arg) => arg.startsWith("--budget-ms="))?.slice(12) ?? Infinity,
);
if (!(budget > 0)) throw new Error("budget-ms must be positive");
const deadline = Date.now() + budget;
const output = path.join(root, "data/prts-assets/online-thumbnails.json");
const lockPath = path.join(root, "data/prts-assets/.online-thumbnails.lock");
const lock = await fs.open(lockPath, "wx").catch((error) => {
  if (error.code === "EEXIST")
    throw new Error(
      "Thumbnail collector lock exists. Confirm the previous process stopped before removing a stale lock.",
    );
  throw error;
});
await lock.writeFile(String(process.pid));
try {
  let cache;
  try {
    cache = JSON.parse(await fs.readFile(output, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    cache = { schemaVersion: 1, records: {} };
  }
  if (
    cache.schemaVersion !== 1 ||
    !cache.records ||
    typeof cache.records !== "object"
  )
    throw new Error("Invalid thumbnail cache; refusing to overwrite it");
  const unique = new Map();
  for (const name of (
    await fs.readdir(path.join(root, "public/assets/library/entries"))
  ).sort()) {
    if (!name.endsWith(".json")) continue;
    const focused = [
      "prts-operator-1719.json",
      "prts-operator-58745.json",
      "leithanien.json",
    ].includes(name);
    if (
      kind &&
      !focused &&
      !name.startsWith(`${kind}-`) &&
      !name.startsWith(`prts-${kind}-`)
    )
      continue;
    const data = JSON.parse(
      await fs.readFile(
        path.join(root, "public/assets/library/entries", name),
        "utf8",
      ),
    );
    const artworks = data.artworks ?? [];
    const first =
      name === "leithanien.json"
        ? artworks.find((art) => art.id === "ec6363e43f5e1727fd79b303")
        : (artworks.find((art) => /portrait|立绘|初始|main/.test(art.role)) ??
          artworks.find((art) => art.role === "preview") ??
          artworks[0]);
    const selected =
      cardsOnly &&
      !name.startsWith("prts-operator-1719.") &&
      !name.startsWith("prts-operator-58745.")
        ? [first].filter(Boolean)
        : artworks;
    for (const art of selected) {
      if (
        !art.fileTitle ||
        !art.sourceUrl?.startsWith("https://media.prts.wiki/") ||
        (art.originalWidth ?? art.width) <= 480
      )
        continue;
      if (!cache.records[art.sourceUrl]?.[480])
        unique.set(art.sourceUrl, { ...art, priority: focused ? 0 : 1 });
    }
  }
  const queue = [...unique.values()].sort(
    (a, b) =>
      a.priority - b.priority ||
      Number(!/portrait|立绘/.test(a.role + a.fileTitle)) -
        Number(!/portrait|立绘/.test(b.role + b.fileTitle)),
  );
  console.log(
    JSON.stringify({
      pending: queue.length,
      cached: Object.keys(cache.records).length,
      concurrency: 3,
    }),
  );
  const failures = [];
  const controllers = new Set();
  let stopping = false;
  const stop = () => {
    stopping = true;
    controllers.forEach((controller) => controller.abort());
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let next = 0;
  let processed = 0;
  let lastCheckpoint = 0;
  let saves = Promise.resolve();
  function checkpoint(force = false) {
    if (!force && processed - lastCheckpoint < (cardsOnly ? 25 : 250))
      return saves;
    lastCheckpoint = processed;
    cache.checkedAt = new Date().toISOString();
    const contents = JSON.stringify(cache) + "\n";
    const progress = {
      processed,
      pending: queue.length,
      cached: Object.keys(cache.records).length,
      failures: failures.length,
      interrupted: stopping,
    };
    const audit = JSON.stringify(
      {
        ...progress,
        records: progress.cached,
        failures: [...failures],
        cardsOnly,
        kind,
        budgetMs: Number.isFinite(budget) ? budget : null,
      },
      null,
      2,
    );
    // Capture an immutable checkpoint and serialize writes so a slower older
    // save cannot replace a newer one after concurrent batches complete.
    saves = saves.then(async () => {
      await fs.writeFile(output + ".tmp", contents);
      await fs.rename(output + ".tmp", output);
      await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
      await fs.writeFile(
        path.join(root, "artifacts/online-thumbnail-audit.json"),
        audit,
      );
      console.log(JSON.stringify(progress));
    });
    return saves;
  }
  async function batch(group, offset) {
    const url = new URL("https://prts.wiki/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "480",
      maxlag: "5",
      titles: group.map((art) => "File:" + art.fileTitle).join("|"),
    }).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    controllers.add(controller);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "TerraExplorationArchive/1.1 (public media metadata; github.com/yi1z/TerraExplorationArchive)",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.info);
      for (const page of Object.values(data.query?.pages ?? {})) {
        const info = page.imageinfo?.[0];
        if (
          !info?.url ||
          !info.thumburl?.startsWith("https://media.prts.wiki/")
        )
          continue;
        const original = group.find(
          (art) =>
            decodeURIComponent(art.sourceUrl) === decodeURIComponent(info.url),
        )?.sourceUrl;
        if (!original) continue;
        const variants = { 480: info.thumburl };
        for (const [scale, remote] of Object.entries(info.responsiveUrls ?? {}))
          if (remote.startsWith("https://media.prts.wiki/"))
            variants[Math.round(480 * Number(scale))] = remote;
        cache.records[original] = { ...cache.records[original], ...variants };
      }
      const missing = group
        .filter((art) => !cache.records[art.sourceUrl]?.[480])
        .map((art) => art.fileTitle);
      if (missing.length)
        failures.push({
          offset,
          missing,
          error: "Source did not return a matching thumbnail URL",
        });
    } catch (error) {
      if (!stopping) {
        failures.push({
          offset,
          error: String(error),
          cause: error.cause?.message,
        });
        console.warn(JSON.stringify(failures.at(-1)));
      }
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
      processed += group.length;
      await checkpoint();
    }
  }
  try {
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (
          !stopping &&
          failures.length < 5 &&
          next < queue.length &&
          Date.now() < deadline
        ) {
          const offset = next;
          next += 25;
          await batch(queue.slice(offset, offset + 25), offset);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }),
    );
    await checkpoint(true);
    await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
    await fs.writeFile(
      path.join(root, "artifacts/online-thumbnail-audit.json"),
      JSON.stringify(
        {
          pending: queue.length,
          processed,
          records: Object.keys(cache.records).length,
          failures,
          interrupted: stopping,
          budgetReached: Date.now() >= deadline,
          cardsOnly,
          kind,
        },
        null,
        2,
      ),
    );
    if (stopping) process.exitCode = 130;
    else if (failures.length >= 5) process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
} finally {
  await lock.close();
  await fs.unlink(lockPath);
}

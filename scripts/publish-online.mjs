import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kinds = new Set([
  "operator",
  "enemy",
  "item",
  "world",
  "country",
  "city",
  "faction",
  "concept",
  "stage",
  "story",
  "event",
  "module",
  "outfit",
  "furniture",
  "furniture-theme",
  "mode",
  "mechanic",
]);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
function safeRelative(value) {
  return (
    typeof value === "string" &&
    /^(?:data\/prts|resources\/online)\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/.test(
      value,
    )
  );
}
export function artworkBucket(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").slice(-2);
}
export function safeMediaUrl(value) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["media.prts.wiki", "torappu.prts.wiki", "prts.wiki"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
export function publicArtwork(art) {
  const sourceUrl = safeMediaUrl(art.sourceUrl);
  if (!sourceUrl || typeof art.id !== "string") return null;
  const result = {
    id: art.id,
    title: String(art.title ?? ""),
    role: String(art.role ?? "image"),
    sourceUrl,
  };
  for (const key of ["path", "thumbnail", "preview", "full"]) {
    const value = art[key];
    if (
      typeof value === "string" &&
      /^assets\/library\/images\/[a-f0-9]+-\d+\.webp$/.test(value)
    )
      result[key] = value;
  }
  if (!result.path) return null;
  for (const key of ["width", "height"])
    if (Number.isFinite(art[key]) && art[key] > 0) result[key] = art[key];
  const filePage = safeMediaUrl(art.filePage);
  if (filePage) result.filePage = filePage;
  // Only use thumbnail URLs that actually exist in source metadata. Never
  // construct a MediaWiki thumbnail URL from an original image path.
  const thumbs = Object.entries(art.sourceThumbUrls ?? {})
    .map(([size, url]) => [Number(size), safeMediaUrl(url)])
    .filter(([size, url]) => Number.isFinite(size) && size > 0 && url)
    .sort((a, b) => a[0] - b[0]);
  const variant = (size) => thumbs.find(([width]) => width >= size)?.[1];
  const remote = Object.fromEntries(
    [
      ["thumbnail", variant(160)],
      ["preview", variant(480)],
      ["full", variant(1440)],
    ].filter(([, url]) => url && url !== sourceUrl),
  );
  // The original remains sourceUrl. Do not repeat its long encoded URL three
  // times per artwork when no actual thumbnail metadata exists.
  if (Object.keys(remote).length) result.remote = remote;
  return result;
}
export function compactRecord(record, detailPaths) {
  const detailIndex = detailPaths.indexOf(record.detailShard);
  if (
    !kinds.has(record.kind) ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(record.id) ||
    detailIndex < 0
  )
    throw new Error(`Invalid catalogue record: ${record.id}`);
  const expectedUrl = `https://prts.wiki/w/${encodeURIComponent(record.source.title)}`;
  const row = [
    record.id,
    record.name,
    record.en ?? null,
    [...new Set(record.aliases ?? [])].filter(
      (alias) => alias !== record.name && alias !== record.en,
    ),
    record.summary,
    record.summaryStatus,
    record.tags,
    record.releaseStatus,
    record.source.title,
    record.source.pageId ?? null,
    detailIndex,
    record.facets ?? {},
  ];
  if (record.source.url !== expectedUrl) row.push(record.source.url);
  return row;
}
export async function publishOnline({
  root = process.cwd(),
  output = "artifacts/online-preview",
} = {}) {
  root = path.resolve(root);
  const outputRoot = path.resolve(root, output);
  const allowedPreview = path.resolve(root, "artifacts");
  const allowedRelease = path.resolve(root, "resources", "online");
  if (!(
    outputRoot.startsWith(allowedPreview + path.sep) ||
    outputRoot === allowedRelease
  ))
    throw new Error(
      "Online output must stay under artifacts/ or resources/online",
    );
  const manifest = await readJson(
    path.join(root, "public/data/prts/manifest.json"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.indexShards) ||
    !Array.isArray(manifest.detailShards)
  )
    throw new Error("Unsupported source manifest");
  const detailPaths = manifest.detailShards.map((shard) => shard.path);
  for (const item of [
    ...detailPaths,
    ...manifest.indexShards.map((shard) => shard.path),
  ])
    if (!safeRelative(item) || !item.startsWith("data/prts/"))
      throw new Error("Unsafe source shard path");
  const records = [];
  for (const shard of manifest.indexShards) {
    const data = await readJson(path.join(root, "public", shard.path));
    if (!Array.isArray(data.records) || data.records.length !== shard.count)
      throw new Error(`Source shard count mismatch: ${shard.path}`);
    records.push(...data.records);
  }
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("Duplicate catalogue IDs");
  // Publication requires the complete local metadata set, including explicit
  // empty arrays for known missing art. Never replace a published tree with
  // empty artwork merely because the maintainer did not install its inputs.
  const artworkMetadata = new Map();
  for (const record of records) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.id))
      throw new Error("Unsafe artwork entry ID");
    let metadata;
    try {
      metadata = await readJson(
        path.join(root, "public/assets/library/entries", `${record.id}.json`),
      );
    } catch {
      throw new Error(
        `Artwork metadata missing or invalid for ${record.id}; install the complete resource library before publication`,
      );
    }
    if (!Array.isArray(metadata.artworks))
      throw new Error(
        `Artwork metadata must contain an artworks array: ${record.id}`,
      );
    artworkMetadata.set(record.id, metadata);
  }
  const report = {
    snapshotId: manifest.snapshotId,
    records: records.length,
    catalogBytes: 0,
    cardBytes: 0,
    artworkBytes: 0,
    artworkEntries: 0,
    artworks: 0,
    remoteThumbnailVariants: 0,
    originalFallbacks: 0,
    largeOriginalFallbacks: 0,
    files: [],
  };
  async function write(relative, value) {
    const destination = path.join(outputRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    const contents = JSON.stringify(value) + "\n";
    await writeFile(destination + ".tmp", contents);
    await rename(destination + ".tmp", destination);
    report.files.push(relative);
    return Buffer.byteLength(contents);
  }
  const catalogShards = [];
  for (const kind of [...kinds].sort()) {
    const group = records.filter((record) => record.kind === kind);
    if (!group.length) continue;
    const relative = `catalog/${kind}.json`;
    report.catalogBytes += await write(relative, {
      schemaVersion: 1,
      kind,
      rows: group.map((record) => compactRecord(record, detailPaths)),
    });
    catalogShards.push({
      kind,
      path: `resources/online/${relative}`,
      count: group.length,
    });
  }
  const buckets = Array.from({ length: 256 }, () => ({}));
  const cards = new Map(catalogShards.map((shard) => [shard.kind, {}]));
  let thumbnailMetadata = {};
  let artworkOverrides = {};
  try {
    const value = await readJson(
      path.join(root, "data/prts-assets/online-thumbnails.json"),
    );
    if (
      value.schemaVersion !== 1 ||
      !value.records ||
      typeof value.records !== "object"
    )
      throw new Error("Invalid online thumbnail metadata");
    thumbnailMetadata = value.records;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    const value = await readJson(
      path.join(root, "resources/online-art-overrides.json"),
    );
    if (
      value.schemaVersion !== 1 ||
      !value.artworks ||
      typeof value.artworks !== "object"
    )
      throw new Error("Invalid online artwork overrides");
    artworkOverrides = value.artworks;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const record of records) {
    const artworks = artworkMetadata
      .get(record.id)
      .artworks.map((art) => {
        const published = publicArtwork({
          ...art,
          ...(typeof artworkOverrides[art.id]?.title === "string"
            ? { title: artworkOverrides[art.id].title }
            : {}),
          ...(typeof artworkOverrides[art.id]?.role === "string"
            ? { role: artworkOverrides[art.id].role }
            : {}),
          sourceThumbUrls: {
            ...(art.sourceThumbUrls ?? {}),
            ...(Object.hasOwn(thumbnailMetadata, art.sourceUrl)
              ? thumbnailMetadata[art.sourceUrl]
              : {}),
          },
        });
        if (
          published &&
          !published.remote?.thumbnail &&
          (art.originalWidth ?? art.width) > 480
        )
          report.largeOriginalFallbacks++;
        return published;
      })
      .filter(Boolean);
    buckets[parseInt(artworkBucket(record.id), 16)][record.id] = artworks;
    if (artworks.length) report.artworkEntries++;
    const primary =
      artworks.find((art) => art.role === "preview") ??
      artworks.find((art) => /portrait|立绘|初始|main/.test(art.role)) ??
      artworks[0];
    if (primary) {
      const row = [primary.id, primary.sourceUrl];
      if (primary.remote?.thumbnail) row.push(primary.remote.thumbnail);
      cards.get(record.kind)[record.id] = row;
    }
    report.artworks += artworks.length;
    for (const art of artworks) {
      if (!art.remote?.thumbnail) report.originalFallbacks++;
      else report.remoteThumbnailVariants++;
    }
  }
  for (let i = 0; i < buckets.length; i++)
    report.artworkBytes += await write(
      `art/${i.toString(16).padStart(2, "0")}.json`,
      { snapshotId: manifest.snapshotId, records: buckets[i] },
    );
  const cardShards = [];
  for (const [kind, records] of cards) {
    const relative = `cards/${kind}.json`;
    report.cardBytes += await write(relative, {
      snapshotId: manifest.snapshotId,
      records,
    });
    cardShards.push({
      kind,
      path: `resources/online/${relative}`,
      count: Object.keys(records).length,
    });
  }
  // Publish the descriptor last. The Git commit containing this tree is then
  // pinned separately in online-release.json; it cannot reference its own SHA.
  await write("manifest.json", {
    schemaVersion: 1,
    snapshotId: manifest.snapshotId,
    dataManifest: "data/prts/manifest.json",
    detailPaths,
    catalogShards,
    cardShards,
    art: {
      buckets: 256,
      algorithm: "fnv1a32",
      pathPrefix: "resources/online/art",
    },
  });
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !arg.startsWith("--output=")))
    throw new Error(
      "Usage: node scripts/publish-online.mjs [--output=artifacts/online-preview|resources/online]",
    );
  console.log(
    JSON.stringify(
      await publishOnline({
        output: args.find((arg) => arg.startsWith("--output="))?.slice(9),
      }),
      null,
      2,
    ),
  );
}

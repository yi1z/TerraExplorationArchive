/** Recheck publication after metadata-only relinking without rereading cached image bytes. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../..");
const privateRoot = path.join(root, "data/prts-assets");
const publicRoot = path.join(root, "public/assets/library");
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const before = await read(path.join(privateRoot, "pre-final-link.json"));
const fullVerification = await read(
  path.join(privateRoot, "verification.json"),
);
const mapping = await read(path.join(privateRoot, "mapping.json"));
const manifest = await read(path.join(publicRoot, "manifest.json"));
const mappingHash = hash(
  JSON.stringify(mapping.tasks.map((task) => task.fileKey).sort()),
);
const recordsHash = hash(
  await fs.readFile(path.join(privateRoot, "records.json")),
);
const errors = [];
if (mappingHash !== before.mappingHash)
  errors.push(
    "Source image mapping changed since the preceding full hash verification.",
  );
if (recordsHash !== before.recordsHash)
  errors.push(
    "Image record metadata changed since the preceding full hash verification.",
  );
for (const [id, artworks] of Object.entries(manifest.entries)) {
  const entry = await read(path.join(publicRoot, "entries", `${id}.json`));
  if (JSON.stringify(entry.artworks) !== JSON.stringify(artworks))
    errors.push(`Per-entry manifest mismatch: ${id}`);
}
let publicBytes = 0,
  publicFiles = 0;
const files = await fs.readdir(publicRoot, {
  recursive: true,
  withFileTypes: true,
});
for (let offset = 0; offset < files.length; offset += 128) {
  await Promise.all(
    files
      .slice(offset, offset + 128)
      .filter((file) => file.isFile())
      .map(async (file) => {
        const stat = await fs.stat(path.join(file.parentPath, file.name));
        publicBytes += stat.size;
        publicFiles++;
      }),
  );
}
const result = {
  checkedAt: new Date().toISOString(),
  snapshot: (await read(path.join(root, "public/data/prts/manifest.json")))
    .snapshotId,
  fullHashVerifiedAt: fullVerification.checkedAt,
  mappingUnchanged: mappingHash === before.mappingHash,
  imageRecordsUnchanged: recordsHash === before.recordsHash,
  assets: manifest.assetsCount,
  activeAssets: manifest.activeAssets,
  variants: fullVerification.variants,
  publicFiles,
  publicBytes,
  entities: manifest.expectedEntities,
  mappedEntities: manifest.mappedEntities,
  errors,
};
await fs.writeFile(
  path.join(privateRoot, "link-verification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

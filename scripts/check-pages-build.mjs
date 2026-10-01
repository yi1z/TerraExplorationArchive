/** Guard the upload boundary; Pages must only receive the online site. */
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../dist");
const expectedBase = "/TerraExplorationArchive/";
const forbidden =
  /^(?:data|scripts|qa\.html)(?:\/|$)|^assets\/(?:library|catalogue|game)(?:\/|$)/;
let files = 0;
let bytes = 0;
async function inspect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink() || forbidden.test(relative))
      throw new Error(`Unexpected Pages content: ${relative}`);
    if (entry.isDirectory()) await inspect(absolute);
    else {
      files++;
      bytes += (await fs.stat(absolute)).size;
    }
  }
}
await inspect(root);
if (bytes > 20 * 1024 * 1024)
  throw new Error("Online Pages build exceeds 20 MiB");
const html = await fs.readFile(path.join(root, "index.html"), "utf8");
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
  (match) => match[1],
);
for (const reference of references) {
  if (!reference.startsWith(expectedBase))
    throw new Error(`Incorrect project base: ${reference}`);
  await fs.access(path.join(root, reference.slice(expectedBase.length)));
}
for (const required of [
  "assets/home/rhodes-bridge.webp",
  "assets/home/rhodes-emblem.png",
  "assets/home/sources.json",
  "third-party-notices.txt",
])
  await fs.access(path.join(root, required));
console.log(
  `Verified Pages build: ${files} files, ${bytes} bytes; base ${expectedBase}`,
);

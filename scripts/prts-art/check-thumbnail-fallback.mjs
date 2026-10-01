import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { createHash } from "node:crypto";
const execute = promisify(execFile);
const meta = JSON.parse(
  await fs.readFile("data/prts-assets/source-error-metadata.json", "utf8"),
);
const page = Object.values(meta.query.pages).find((p) => p.pageid === 55912);
const info = page.imageinfo[0];
const output = "data/prts-assets/thumbnail-fallback-check.jpg";
await execute(
  "curl.exe",
  [
    "--ipv4",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "15",
    "--max-time",
    "60",
    info.thumburl,
    "--output",
    output,
  ],
  { windowsHide: true },
);
const bytes = await fs.readFile(output);
console.log({
  bytes: bytes.length,
  sha1: createHash("sha1").update(bytes).digest("hex"),
  url: info.thumburl,
  metadata: await sharp(bytes).metadata(),
});
const result = await sharp(bytes)
  .resize({ width: 160, height: 160, fit: "inside" })
  .webp()
  .toBuffer();
console.log({ decoded: true, thumbnailBytes: result.length });

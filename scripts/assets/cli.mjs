import fs from "node:fs/promises";
import path from "node:path";
import {
  packResources,
  installResources,
  verifyResources,
} from "./release.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const command = process.argv[2];
const directory = path.join(root, "public/assets/library");
const manifestPath = path.join(root, "resources/library-assets.json");
const output = path.join(root, "artifacts/library-assets");
try {
  if (command === "pack") {
    const data = JSON.parse(
      await fs.readFile(
        path.join(root, "public/data/prts/manifest.json"),
        "utf8",
      ),
    );
    const manifest = await packResources({
      source: directory,
      output,
      manifestPath,
      snapshot: data.snapshotId,
    });
    console.log(
      `Packed ${manifest.fileCount} files into ${manifest.parts.length} parts. Manifest: ${manifestPath}`,
    );
  } else if (command === "download" || command === "verify") {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const result =
      command === "download"
        ? await installResources({
            manifest,
            directory,
            cache: path.join(output, "cache"),
            offline: process.argv.includes("--offline"),
          })
        : await verifyResources({ directory, manifest, log: console.log });
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else
    throw new Error(
      "Use assets:pack, assets:download [--offline], or assets:verify",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

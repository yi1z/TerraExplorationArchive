import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { currentPublicSnapshot } from "../vite.config";

it("ships only UI audio online and only the current snapshot when explicitly offline", async () => {
  const root = await mkdtemp(join(tmpdir(), "terra-build-public-"));
  const publicDir = join(root, "public");
  const manifest = {
    coverage: { path: "data/prts/current/coverage.json" },
    indexShards: [{ path: "data/prts/current/index.json" }],
    detailShards: [{ path: "data/prts/current/details.json" }],
    searchShards: [{ path: "data/prts/current/search.json" }],
  };
  const files: Record<string, string> = {
    "favicon.svg": "icon",
    "third-party-notices.txt": "credits",
    "assets/audio/confirm.ogg": "sound",
    "assets/catalogue/operator.png": "curated",
    "assets/game/region.png": "region",
    "assets/library/images/portrait.webp": "bulk",
    "data/prts/manifest.json": JSON.stringify(manifest),
    "data/prts/current/coverage.json": "{}",
    "data/prts/current/index.json": "{}",
    "data/prts/current/details.json": "{}",
    "data/prts/current/search.json": "{}",
    "data/prts/old/index.json": "obsolete",
    "private-cache.json": "do not ship online",
  };
  try {
    for (const [path, contents] of Object.entries(files)) {
      const file = join(publicDir, path);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, contents);
    }
    for (const mode of ["online", "offline"] as const) {
      const plugin = currentPublicSnapshot();
      plugin.configResolved({
        root,
        publicDir,
        build: { outDir: mode },
        env: { VITE_RESOURCE_MODE: mode },
      });
      await plugin.writeBundle();
    }
    expect((await readdir(join(root, "online"))).sort()).toEqual([
      "assets",
      "favicon.svg",
      "third-party-notices.txt",
    ]);
    expect(await readdir(join(root, "online/assets"))).toEqual(["audio"]);
    expect(
      await readFile(join(root, "online/assets/audio/confirm.ogg"), "utf8"),
    ).toBe("sound");
    expect((await readdir(join(root, "offline/data/prts"))).sort()).toEqual([
      "current",
      "manifest.json",
    ]);
    expect(
      JSON.parse(
        await readFile(join(root, "offline/data/prts/manifest.json"), "utf8"),
      ),
    ).toEqual(manifest);
    expect(
      await readFile(
        join(root, "offline/assets/library/images/portrait.webp"),
        "utf8",
      ),
    ).toBe("bulk");
    expect(
      (await readdir(join(root, "offline/data/prts/current"))).sort(),
    ).toEqual(["coverage.json", "details.json", "index.json", "search.json"]);
  } finally {
    // mkdtemp returns this exact owned fixture directory; no user path is used.
    await rm(root, { recursive: true, force: true });
  }
});

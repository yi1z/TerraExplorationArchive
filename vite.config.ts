import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { serveGeneratedLibrary } from "./scripts/serve-library.ts";

export function currentPublicSnapshot() {
  let publicDir = "";
  let outDir = "";
  let offline = false;
  return {
    name: "current-public-snapshot",
    apply: "build" as const,
    configResolved(config: {
      root: string;
      publicDir: string;
      build: { outDir: string };
      env: Record<string, unknown>;
    }) {
      publicDir = config.publicDir;
      outDir = resolve(config.root, config.build.outDir);
      offline = config.env.VITE_RESOURCE_MODE === "offline";
    },
    async writeBundle() {
      if (!offline) {
        // Online readers fetch the pinned snapshot and art as needed. Keeping
        // this list explicit also avoids publishing private/new public caches.
        for (const path of [
          "favicon.svg",
          "third-party-notices.txt",
          "assets/audio",
          "assets/home",
        ]) {
          const destination = resolve(outDir, path);
          await mkdir(dirname(destination), { recursive: true });
          await cp(resolve(publicDir, path), destination, { recursive: true });
        }
        return;
      }
      // Keep source snapshots recoverable; publish only the active data graph.
      const dataDir = resolve(publicDir, "data/prts");
      const manifestText = await readFile(
        resolve(dataDir, "manifest.json"),
        "utf8",
      );
      const manifest = JSON.parse(manifestText);
      const paths = new Set<string>([
        manifest.coverage.path,
        ...manifest.indexShards.map((row: { path: string }) => row.path),
        ...manifest.detailShards.map((row: { path: string }) => row.path),
        ...(manifest.searchShards ?? []).map(
          (row: { path: string }) => row.path,
        ),
      ]);
      for (const path of paths) {
        if (
          !/^data\/prts\/[A-Za-z0-9_./-]+\.json$/.test(path) ||
          path.split("/").includes("..")
        )
          throw new Error("Invalid public data path in manifest");
      }
      await cp(publicDir, outDir, {
        recursive: true,
        filter: (source) => resolve(source) !== dataDir,
      });
      for (const path of paths) {
        const destination = resolve(outDir, path);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(resolve(publicDir, path), destination);
      }
      const destination = resolve(outDir, "data/prts/manifest.json");
      await writeFile(`${destination}.tmp`, manifestText);
      await rename(`${destination}.tmp`, destination);
    },
  };
}
export default defineConfig({
  plugins: [react(), serveGeneratedLibrary(), currentPublicSnapshot()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      // Generated snapshots and original art can change in large batches.
      // A manual refresh reads the next complete snapshot without HMR churn.
      ignored: [
        "**/data/prts/**",
        "**/data/prts-assets/**",
        "**/public/assets/library/**",
        "**/artifacts/**",
      ],
    },
  },
  preview: { host: "127.0.0.1", port: 4173 },
  build: { chunkSizeWarningLimit: 1600, copyPublicDir: false },
  test: { include: ["tests/**/*.test.{ts,mjs}"], environment: "node" },
});

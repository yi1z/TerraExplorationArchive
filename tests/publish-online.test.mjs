import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  artworkBucket,
  publishOnline,
  publicArtwork,
} from "../scripts/publish-online.mjs";
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const record = {
  id: "prts-operator-123",
  name: "测试",
  kind: "operator",
  aliases: ["测试", "Alias"],
  summary: "公开简介",
  summaryStatus: "curated",
  tags: [],
  releaseStatus: "released",
  source: {
    title: "测试",
    url: "https://prts.wiki/w/%E6%B5%8B%E8%AF%95",
    pageId: 123,
  },
  detailShard: "data/prts/details/operator-000.json",
  facets: { profession: ["术师"] },
};
const art = {
  id: "abc123",
  title: "立绘",
  role: "portrait",
  path: "assets/library/images/abcdef-960.webp",
  sourceUrl: "https://media.prts.wiki/a/ab/image.png",
  cachedOriginal: "data/prts-assets/originals/private.png",
  sourceThumbUrls: {
    160: "https://media.prts.wiki/thumb/160.png",
    480: "https://evil.test/image.png",
  },
};
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "terra-online-"));
  roots.push(root);
  const files = {
    "public/data/prts/manifest.json": {
      schemaVersion: 1,
      snapshotId: "snapshot-test",
      indexShards: [{ path: "data/prts/index/operator-000.json", count: 1 }],
      detailShards: [{ path: record.detailShard, ids: [record.id] }],
    },
    "public/data/prts/index/operator-000.json": { records: [record] },
    [`public/assets/library/entries/${record.id}.json`]: { artworks: [art] },
  };
  for (const [name, data] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), JSON.stringify(data));
  }
  return root;
}
describe("online publication tree", () => {
  it("writes deterministic compact indices and only public safe artwork metadata", async () => {
    const root = await fixture();
    const first = await publishOnline({ root });
    const output = path.join(root, "artifacts/online-preview");
    const manifest = JSON.parse(
      await readFile(path.join(output, "manifest.json"), "utf8"),
    );
    const catalog = JSON.parse(
      await readFile(path.join(output, "catalog/operator.json"), "utf8"),
    );
    const bucket = await readFile(
      path.join(output, `art/${artworkBucket(record.id)}.json`),
      "utf8",
    );
    expect(manifest.snapshotId).toBe("snapshot-test");
    expect(catalog.rows[0][3]).toEqual(["Alias"]);
    expect(catalog.rows[0][10]).toBe(0);
    expect(bucket).not.toContain("cachedOriginal");
    expect(bucket).not.toContain("private.png");
    expect(bucket).not.toContain("evil.test");
    expect(JSON.parse(bucket).records[record.id][0].remote.thumbnail).toBe(
      art.sourceThumbUrls[160],
    );
    expect(await publishOnline({ root })).toEqual(first);
    expect(first.files).toHaveLength(259);
  });
  it("refuses unsafe media and output/source paths", async () => {
    expect(
      publicArtwork({ ...art, sourceUrl: "javascript:alert(1)" }),
    ).toBeNull();
    expect(
      publicArtwork({
        ...art,
        sourceUrl: "https://media.prts.wiki.evil.test/img.png",
      }),
    ).toBeNull();
    const root = await fixture();
    await expect(publishOnline({ root, output: "../outside" })).rejects.toThrow(
      "output",
    );
    const manifestFile = path.join(root, "public/data/prts/manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.indexShards[0].path = "data/prts/../../secret.json";
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(publishOnline({ root })).rejects.toThrow("Unsafe");
  });
});

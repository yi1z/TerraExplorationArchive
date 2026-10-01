import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryDetail,
  LibraryManifest,
  LibrarySummary,
} from "../src/data/library-types";

const summary = (id: string): LibrarySummary => ({
  id,
  name: id,
  kind: "operator",
  aliases: [],
  summary: "A source record",
  summaryStatus: "source",
  tags: [],
  releaseStatus: "released",
  source: { title: id, url: "https://prts.wiki/w/test" },
  detailShard: "data/prts/details/operator-000.json",
  facets: { profession: ["术师"] },
});
const ids = ["prts-operator-900001", "prts-operator-900002"];
const summaries = ids.map(summary);
const details: LibraryDetail[] = summaries.map((entry) => ({
  ...entry,
  sections: [{ title: "正文", body: "Fetched only when opened" }],
  facts: [],
  fields: {},
  templates: [],
  relationships: [],
  artworkRefs: [],
}));
const manifest: LibraryManifest = {
  schemaVersion: 1,
  snapshotId: "test-snapshot",
  generatedAt: "2026-09-30",
  status: "partial",
  counts: { operator: 2 },
  indexShards: [{ path: "data/prts/index/operator-000.json", count: 2 }],
  detailShards: [{ path: "data/prts/details/operator-000.json", ids }],
  coverage: { path: "data/prts/coverage.json" },
  legacyAliases: { "prts-operator-800001": ids[0] },
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("library shard loading", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  it("loads only catalogue shards initially and deduplicates concurrent detail requests", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("manifest.json")
        ? response(manifest)
        : url.includes("/index/")
          ? response({ records: summaries })
          : response({ records: details }),
    );
    vi.stubGlobal("fetch", fetch);
    const library = await import("../src/lib/library");
    const first = library.loadLibrary();
    expect(library.loadLibrary()).toBe(first);
    await first;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.some(([url]) => url.includes("/details/"))).toBe(
      false,
    );
    const loaded = await Promise.all(ids.map(library.loadLibraryEntry));
    expect(loaded.map((entry) => entry?.id)).toEqual(ids);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      (await library.loadLibraryEntry(ids[0]))?.sections[0].body,
    ).toContain("Fetched");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("retains cold deep links and resolves aliases only against the loaded registry", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("manifest.json")
        ? response(manifest)
        : response({ records: summaries }),
    );
    const library = await import("../src/lib/library");
    expect(library.resolveLibraryId(ids[0])).toBe(ids[0]);
    expect(library.resolveLibraryId("constructor")).toBeNull();
    expect(library.resolveLibraryId("__proto__")).toBeNull();
    await library.loadLibrary();
    expect(library.resolveLibraryId("prts-operator-800001")).toBe(ids[0]);
    expect(library.resolveLibraryId("prts-operator-999999")).toBeNull();
    expect(library.getLibrarySummary("operator-amiya")?.name).toBe("阿米娅");
  });

  it("opens a cold dossier before the search directory finishes loading", async () => {
    let releaseIndex!: (response: Response) => void;
    const pendingIndex = new Promise<Response>((resolve) => {
      releaseIndex = resolve;
    });
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("manifest.json")
        ? response(manifest)
        : url.includes("/index/")
          ? pendingIndex
          : response({ records: details }),
    );
    const library = await import("../src/lib/library");
    const entry = await library.loadLibraryEntry(ids[0]);
    expect(entry?.id).toBe(ids[0]);
    expect(library.getLibrarySnapshot().status).toBe("loading");
    releaseIndex(response({ records: summaries }));
    await library.loadLibrary();
    expect(library.getLibrarySnapshot().status).toBe("ready");
  });
  it("keeps index failure distinct from missing records and allows an explicit retry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 503));
    vi.stubGlobal("fetch", fetch);
    const library = await import("../src/lib/library");
    await expect(library.loadLibrary()).rejects.toThrow("503");
    expect(library.getLibrarySnapshot().status).toBe("error");
    expect(library.resolveLibraryId(ids[0])).toBe(ids[0]);
    expect(library.getLibrarySnapshot().summaries.length).toBe(103);
    fetch.mockImplementation(async (url: string) =>
      url.endsWith("manifest.json")
        ? response(manifest)
        : response({ records: summaries }),
    );
    await library.loadLibrary(true);
    expect(library.getLibrarySnapshot().status).toBe("ready");
    expect(await library.loadLibraryEntry("prts-operator-999999")).toBeNull();
  });
  it("retries a missing detail shard without marking its known ID invalid", async () => {
    let fail = true;
    vi.stubGlobal("fetch", async (url: string) =>
      url.endsWith("manifest.json")
        ? response(manifest)
        : url.includes("/index/")
          ? response({ records: summaries })
          : fail
            ? response({}, 404)
            : response({ records: details }),
    );
    const library = await import("../src/lib/library");
    await expect(library.loadLibraryEntry(ids[0])).rejects.toThrow("404");
    expect(library.resolveLibraryId(ids[0])).toBe(ids[0]);
    fail = false;
    expect((await library.loadLibraryEntry(ids[0]))?.id).toBe(ids[0]);
  });
  it("rejects remote or parent-relative data shard paths", async () => {
    const { libraryUrl } = await import("../src/lib/library");
    for (const path of [
      "https://example.com/records.json",
      "data/prts/../private.json",
      "data/prts/%2e%2e/secret.json",
      "//example.com/data.json",
    ])
      expect(() => libraryUrl(path)).toThrow();
  });
});

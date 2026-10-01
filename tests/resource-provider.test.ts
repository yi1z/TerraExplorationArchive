import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pin from "../resources/online-release.json";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const descriptor = {
  schemaVersion: 1,
  snapshotId: pin.snapshotId,
  dataManifest: "data/prts/manifest.json",
  detailPaths: ["data/prts/details/operator-000.json"],
  catalogShards: [
    {
      path: "resources/online/catalog/operator.json",
      kind: "operator",
      count: 1,
    },
  ],
  cardShards: [
    {
      path: "resources/online/cards/operator.json",
      kind: "operator",
      count: 1,
    },
  ],
  art: {
    buckets: 256,
    algorithm: "fnv1a32",
    pathPrefix: "resources/online/art",
  },
};
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_RESOURCE_MODE", "online");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("pinned resource provider", () => {
  it("aborts shared IO after its final consumer leaves and lets a later retry start cleanly", async () => {
    let signal!: AbortSignal;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetch);
    const { loadOnlineDescriptor } =
      await import("../src/lib/resource-provider");
    const first = new AbortController();
    const second = new AbortController();
    const pending = Promise.allSettled([
      loadOnlineDescriptor({ signal: first.signal }),
      loadOnlineDescriptor({ signal: second.signal }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    first.abort();
    expect(signal.aborted).toBe(false);
    second.abort();
    expect(signal.aborted).toBe(true);
    expect((await pending).every((item) => item.status === "rejected")).toBe(
      true,
    );
    fetch.mockImplementation(async () => json(descriptor));
    expect((await loadOnlineDescriptor()).snapshotId).toBe(pin.snapshotId);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shares descriptor and artwork IO while consumer cancellation stays independent", async () => {
    let release!: (value: Response) => void;
    let artSignal!: AbortSignal;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("manifest.json")) return json(descriptor);
      artSignal = options.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    vi.stubGlobal("fetch", fetch);
    const { loadArtworkMetadata } =
      await import("../src/lib/resource-provider");
    const controller = new AbortController();
    const cancelled = loadArtworkMetadata("operator-amiya", {
      signal: controller.signal,
    });
    const remaining = loadArtworkMetadata("operator-amiya");
    const cancelledCheck = expect(cancelled).rejects.toThrow("取消");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    await cancelledCheck;
    expect(artSignal.aborted).toBe(false);
    release(
      json({
        snapshotId: pin.snapshotId,
        records: {
          "operator-amiya": [
            {
              id: "test",
              title: "image",
              role: "portrait",
              path: "assets/library/images/a-160.webp",
            },
          ],
        },
      }),
    );
    expect((await remaining).artworks[0].id).toBe("test");
    await loadArtworkMetadata("operator-amiya");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("uses one compact card shard for a whole category without requesting all artwork versions", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("manifest.json")
        ? json(descriptor)
        : json({
            snapshotId: pin.snapshotId,
            records: {
              "operator-amiya": [
                "art-one",
                "https://media.prts.wiki/original.png",
                "https://media.prts.wiki/thumb.png",
              ],
              "operator-kaltsit": [
                "art-two",
                "https://media.prts.wiki/two.png",
              ],
            },
          }),
    );
    vi.stubGlobal("fetch", fetch);
    const { loadCardArtworkMetadata } =
      await import("../src/lib/resource-provider");
    const results = await Promise.all([
      loadCardArtworkMetadata("operator-amiya", "operator"),
      loadCardArtworkMetadata("operator-kaltsit", "operator"),
    ]);
    expect(results[0].artworks[0].remote?.thumbnail).toBe(
      "https://media.prts.wiki/thumb.png",
    );
    expect(results[1].artworks[0].sourceUrl).toBe(
      "https://media.prts.wiki/two.png",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain("/cards/operator.json");
  });
  it("uses the same immutable repository ref for data and artwork metadata and refuses unsafe paths", async () => {
    const { resourceUrl } = await import("../src/lib/resource-provider");
    const base = `https://raw.githubusercontent.com/yi1z/TerraExplorationArchive/${pin.ref}/`;
    expect(resourceUrl("data/prts/manifest.json")).toBe(
      base + "public/data/prts/manifest.json",
    );
    expect(resourceUrl("resources/online/art/00.json")).toBe(
      base + "resources/online/art/00.json",
    );
    expect(resourceUrl("data/prts/manifest.json", "offline")).toBe(
      "/data/prts/manifest.json",
    );
    for (const path of [
      "https://evil.test/data.json",
      "data/prts/../secret.json",
      "data/prts/%2e%2e/secret.json",
      "data/prts/./x.json",
      "data/prts\\x.json",
      "data/prts/a.json?redirect=x",
      "assets/library/entries/a.json",
      "resources/online/.hidden.json",
    ])
      expect(() => resourceUrl(path)).toThrow();
  });
  it("keeps explicit retries bounded and does not retry a missing file", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValue(json({}, 404));
    vi.stubGlobal("fetch", fetch);
    const { fetchResourceJson } = await import("../src/lib/resource-provider");
    expect(
      await fetchResourceJson("data/prts/manifest.json", { retries: 1 }),
    ).toEqual({ ok: true });
    await expect(
      fetchResourceJson("data/prts/manifest.json", { retries: 10 }),
    ).rejects.toThrow("404");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("aborts an in-flight request and bounds a response that never settles", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      signals.push(options.signal as AbortSignal);
      return new Promise(() => {});
    });
    const { fetchResourceJson } = await import("../src/lib/resource-provider");
    const controller = new AbortController();
    const cancelled = fetchResourceJson("data/prts/manifest.json", {
      signal: controller.signal,
    });
    const cancelledCheck = expect(cancelled).rejects.toThrow("取消");
    controller.abort();
    await cancelledCheck;
    expect(signals[0].aborted).toBe(true);
    const timeout = fetchResourceJson("data/prts/manifest.json", {
      timeoutMs: 25,
    });
    const timeoutCheck = expect(timeout).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(25);
    await timeoutCheck;
    expect(signals[1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects artwork buckets from a different snapshot instead of silently mixing sources", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("manifest.json")
        ? json(descriptor)
        : json({ snapshotId: "other", records: { "operator-amiya": [] } }),
    );
    vi.stubGlobal("fetch", fetch);
    const { loadArtworkMetadata } =
      await import("../src/lib/resource-provider");
    await expect(loadArtworkMetadata("operator-amiya")).rejects.toThrow(
      "版本不一致",
    );
    await expect(loadArtworkMetadata("../other")).rejects.toThrow("ID");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("loads compact catalogues without requesting the large original index or any detail", async () => {
    const row = [
      "prts-operator-900001",
      "测试干员",
      null,
      ["test"],
      "公开简介",
      "curated",
      ["泰拉"],
      "released",
      "测试干员",
      900001,
      0,
      { profession: ["术师"] },
    ];
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/resources/online/manifest.json"))
        return json(descriptor);
      if (url.endsWith("/public/data/prts/manifest.json"))
        return json({
          schemaVersion: 1,
          snapshotId: pin.snapshotId,
          generatedAt: "test",
          indexShards: [],
          detailShards: [{ path: descriptor.detailPaths[0], ids: [row[0]] }],
          legacyAliases: {},
        });
      if (url.endsWith("/catalog/operator.json"))
        return json({ schemaVersion: 1, kind: "operator", rows: [row] });
      throw new Error(`Unexpected eager request: ${url}`);
    });
    vi.stubGlobal("fetch", fetch);
    const library = await import("../src/lib/library");
    await library.loadLibrary();
    expect(library.getLibrarySnapshot().source).toBe("online");
    expect(library.getLibrarySummary(String(row[0]))?.facets).toEqual({
      profession: ["术师"],
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(library.getLibrarySummary("operator-amiya")?.name).toBe("阿米娅");
  });
  it("explicitly identifies the bundled fallback when the pinned service is unavailable", async () => {
    vi.stubGlobal("fetch", async () => json({}, 503));
    const library = await import("../src/lib/library");
    await expect(library.loadLibrary()).rejects.toThrow("503");
    expect(library.getLibrarySnapshot()).toMatchObject({
      source: "curated-fallback",
      status: "error",
    });
    expect(library.getLibrarySnapshot().summaries).toHaveLength(103);
  });
});

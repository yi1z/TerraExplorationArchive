import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibrarySummary } from "../src/data/library-types";

const entry: LibrarySummary = {
  id: "prts-world-worker",
  kind: "world",
  name: "样本",
  aliases: [],
  tags: [],
  summary: "目录内容",
  summaryStatus: "source",
  releaseStatus: "released",
  source: { title: "样本", url: "https://prts.wiki/w/test" },
  detailShard: "",
};
let handle: (event: { data: unknown }) => Promise<void>;
let post: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_RESOURCE_MODE", "offline");
  vi.stubGlobal(
    "addEventListener",
    (_type: string, callback: typeof handle) => {
      handle = callback;
    },
  );
  post = vi.fn();
  vi.stubGlobal("postMessage", post);
  await import("../src/lib/library-search.worker");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const init = (urls: string[]) =>
  handle({
    data: {
      type: "init",
      summaries: [entry],
      documents: [],
      searchShards: urls.map((url) => ({
        path: `data/prts/search${url}.json`,
        kind: "world",
      })),
    },
  });
const search = (id: number, kind = "all", query = "独特正文") =>
  handle({
    data: {
      type: "search",
      requestId: id,
      request: {
        query,
        kind,
        facet: "all",
        spoilers: true,
        scope: "all",
        favorites: [],
        visited: [],
        releaseFilter: "available",
      },
    },
  });
const shard = () =>
  new Response(
    JSON.stringify({ records: [{ id: entry.id, text: "独特正文" }] }),
  );

describe("full text worker lifecycle", () => {
  it("does not download full text for an empty query and scopes downloads to the selected kind", async () => {
    const fetch = vi.fn(async (_url: string) => shard());
    vi.stubGlobal("fetch", fetch);
    await handle({
      data: {
        type: "init",
        summaries: [entry],
        documents: [],
        searchShards: [
          { path: "data/prts/search/world-000.json", kind: "world" },
          { path: "data/prts/search/country-000.json", kind: "country" },
          { path: "data/prts/search/operator-000.json", kind: "operator" },
        ],
      },
    });
    await search(1, "all", "");
    expect(fetch).not.toHaveBeenCalled();
    await search(2, "world");
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      "/data/prts/search/world-000.json",
      "/data/prts/search/country-000.json",
    ]);
    expect(post.mock.calls.at(-1)?.[0].result.fullText).toBe(true);
    await search(3, "operator");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("cancels an obsolete category download without leaking an error into a later empty query", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise(() => {});
    });
    await init(["/pending"]);
    const pending = search(1);
    await search(2, "operator", "");
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(post.mock.calls.filter(([message]) => message.error)).toHaveLength(
      0,
    );
    expect(post.mock.calls.at(-1)?.[0].requestId).toBe(2);
  });
  it("acknowledges startup, limits parallel downloads, and returns only the latest query", async () => {
    const releases: Array<(response: Response) => void> = [];
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => releases.push(resolve)),
    );
    vi.stubGlobal("fetch", fetch);
    await init(["/0", "/1", "/2", "/3", "/4"]);
    expect(post).toHaveBeenCalledWith({ type: "ready" });
    const first = search(1);
    const latest = search(2);
    expect(fetch).toHaveBeenCalledTimes(4);
    releases[0](shard());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    releases.slice(1).forEach((release) => release(shard()));
    await Promise.all([first, latest]);
    const results = post.mock.calls
      .map(([value]) => value)
      .filter((value) => value.result);
    expect(results).toHaveLength(1);
    expect(results[0].requestId).toBe(2);
    expect(results[0].result.total).toBe(1);
    expect(results[0].result.fullText).toBe(true);
  });

  it("reports failed downloads and retries the failed shard", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockImplementation(async () => shard());
    vi.stubGlobal("fetch", fetch);
    await init(["/one"]);
    await search(1);
    expect(post.mock.calls.at(-1)?.[0].error).toContain("503");
    await search(2);
    expect(post.mock.calls.at(-1)?.[0].result.total).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not let a superseded snapshot populate the next index", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    await init(["/old"]);
    const old = search(1);
    await init([]);
    release(shard());
    await old;
    await search(2);
    expect(post.mock.calls.at(-1)?.[0].result.total).toBe(0);
  });
});

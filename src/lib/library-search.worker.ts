import { LibrarySearchIndex } from "./library-search-core";
import { fetchResourceJson } from "./resource-provider";
import type {
  LibraryFilter,
  LibraryKind,
  LibrarySearchDocument,
  LibrarySearchQuery,
  LibrarySummary,
} from "../data/library-types";

type SearchShard = { path: string; kind: LibraryKind };
type WorkerMessage =
  | {
      type: "init";
      summaries: LibrarySummary[];
      documents: LibrarySearchDocument[];
      searchShards: SearchShard[];
    }
  | { type: "search"; requestId: number; request: LibrarySearchQuery };
let index: LibrarySearchIndex | null = null;
let shards: SearchShard[] = [];
let generation = 0;
let loading: {
  key: string;
  controller: AbortController;
  promise: Promise<void>;
} | null = null;
let latestRequest = 0;
const loadedPaths = new Set<string>();
function pathsFor(kind: LibraryFilter) {
  return shards
    .filter(
      (shard) =>
        kind === "all" ||
        shard.kind === kind ||
        (kind === "world" &&
          ["country", "city", "faction", "concept"].includes(shard.kind)),
    )
    .map((shard) => shard.path);
}
async function loadText(paths: string[], requestId: number) {
  const key = paths.join("|");
  const requestedGeneration = generation;
  if (loading?.key === key && !loading.controller.signal.aborted)
    return loading.promise;
  if (loading) {
    loading.controller.abort();
    await loading.promise.catch(() => {});
    if (requestId !== latestRequest || requestedGeneration !== generation)
      return;
  }
  const pending = paths.filter((path) => !loadedPaths.has(path));
  if (!pending.length) return;
  const current = generation;
  const currentIndex = index;
  const controller = new AbortController();
  const promise = (async () => {
    let next = 0;
    let failure: unknown;
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (next < pending.length && !controller.signal.aborted) {
          const path = pending[next++];
          try {
            const data = await fetchResourceJson<{
              records: LibrarySearchDocument[];
            }>(path, { signal: controller.signal });
            if (!Array.isArray(data.records))
              throw new Error("全文索引格式不正确");
            if (current !== generation || controller.signal.aborted) return;
            for (const document of data.records)
              currentIndex?.addDocument(document);
            loadedPaths.add(path);
          } catch (error) {
            failure ??= error;
            controller.abort();
          }
        }
      }),
    );
    if (failure) throw failure;
    if (current === generation) currentIndex?.compact();
  })().finally(() => {
    if (loading?.controller === controller) loading = null;
  });
  loading = { key, controller, promise };
  return promise;
}
globalThis.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === "init") {
      loading?.controller.abort();
      generation++;
      loadedPaths.clear();
      loading = null;
      latestRequest = 0;
      index = new LibrarySearchIndex(message.summaries);
      message.documents.forEach((document) => index?.addDocument(document));
      shards = message.searchShards;
      if (!shards.length) index.compact();
      globalThis.postMessage({ type: "ready" });
      return;
    }
    latestRequest = message.requestId;
    const current = generation;
    const paths = pathsFor(message.request.kind);
    try {
      if (!index) throw new Error("检索目录尚未准备好");
      if (message.request.query.trim())
        await loadText(paths, message.requestId);
      else loading?.controller.abort();
      if (message.requestId !== latestRequest || current !== generation) return;
      globalThis.postMessage({
        requestId: message.requestId,
        result: {
          ...index.search(message.request),
          fullText: paths.every((path) => loadedPaths.has(path)),
        },
      });
    } catch (error) {
      if (message.requestId !== latestRequest || current !== generation) return;
      globalThis.postMessage({
        requestId: message.requestId,
        error: error instanceof Error ? error.message : "检索暂不可用",
      });
    }
  },
);

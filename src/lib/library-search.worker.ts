import { LibrarySearchIndex } from "./library-search-core";
import { fetchJsonWithTimeout } from "./fetch-json";
import type {
  LibrarySearchDocument,
  LibrarySearchQuery,
  LibrarySummary,
} from "../data/library-types";

type WorkerMessage =
  | {
      type: "init";
      summaries: LibrarySummary[];
      documents: LibrarySearchDocument[];
      searchUrls: string[];
    }
  | { type: "search"; requestId: number; request: LibrarySearchQuery };
let index: LibrarySearchIndex | null = null;
let urls: string[] = [];
let generation = 0;
let fullTextLoaded = false;
let loading: Promise<void> | null = null;
let latestRequest = 0;
let loadController: AbortController | null = null;
const loadedUrls = new Set<string>();
async function loadText() {
  if (fullTextLoaded || !urls.length) return;
  if (loading) return loading;
  const current = generation;
  const currentIndex = index;
  const controller = new AbortController();
  loadController = controller;
  loading = (async () => {
    const pending = urls.filter((url) => !loadedUrls.has(url));
    let next = 0;
    let failure: unknown;
    // Download a small batch at a time, indexing each shard as it arrives.
    // Await aborted siblings too so a retry never overlaps a failed batch.
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (next < pending.length && !controller.signal.aborted) {
          const url = pending[next++];
          try {
            const data = (await fetchJsonWithTimeout(url, {
              signal: controller.signal,
            })) as { records: LibrarySearchDocument[] };
            if (!Array.isArray(data.records))
              throw new Error("全文索引格式不正确");
            if (current !== generation) return;
            for (const document of data.records)
              currentIndex?.addDocument(document);
            loadedUrls.add(url);
          } catch (error) {
            failure ??= error;
            controller.abort();
          }
        }
      }),
    );
    if (failure) throw failure;
    if (current === generation) {
      currentIndex?.compact();
      fullTextLoaded = true;
    }
  })().finally(() => {
    if (current === generation) {
      loading = null;
      loadController = null;
    }
  });
  return loading;
}
globalThis.addEventListener(
  "message",
  async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    if (message.type === "init") {
      loadController?.abort();
      generation++;
      loadedUrls.clear();
      loading = null;
      index = new LibrarySearchIndex(message.summaries);
      message.documents.forEach((document) => index?.addDocument(document));
      urls = message.searchUrls;
      fullTextLoaded = !urls.length;
      if (fullTextLoaded) index.compact();
      globalThis.postMessage({ type: "ready" });
      return;
    }
    latestRequest = message.requestId;
    try {
      if (!index) throw new Error("检索目录尚未准备好");
      if (message.request.query.trim()) await loadText();
      if (message.requestId !== latestRequest) return;
      globalThis.postMessage({
        requestId: message.requestId,
        result: { ...index.search(message.request), fullText: fullTextLoaded },
      });
    } catch (error) {
      globalThis.postMessage({
        requestId: message.requestId,
        error: error instanceof Error ? error.message : "检索暂不可用",
      });
    }
  },
);

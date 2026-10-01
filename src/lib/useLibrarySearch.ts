import { useEffect, useRef, useState } from "react";
import { curatedSearchDocuments, useLibrary } from "./library";
import { libraryKindNames, type LibraryKind } from "../data/library-types";
import { LibrarySearchIndex } from "./library-search-core";
import type {
  LibrarySearchQuery,
  LibrarySearchResult,
} from "../data/library-types";

export function useLibrarySearch(request: LibrarySearchQuery) {
  const library = useLibrary();
  const worker = useRef<Worker | null>(null);
  const fallback = useRef<LibrarySearchIndex | null>(null);
  const sequence = useRef(0);
  const initialized = useRef(false);
  const workerFailure = useRef<string | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [ready, setReady] = useState(0);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    result: LibrarySearchResult | null;
    loading: boolean;
    error: string | null;
  }>({ result: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    sequence.current++;
    initialized.current = false;
    workerFailure.current = null;
    clearTimeout(requestTimer.current);
    setState({ result: null, loading: true, error: null });
    const local = new LibrarySearchIndex([]);
    fallback.current = local;
    if (typeof Worker !== "undefined") {
      try {
        const searchWorker = new Worker(
          new URL("./library-search.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current = searchWorker;
        const fail = (error: string) => {
          if (!active || worker.current !== searchWorker) return;
          clearTimeout(startupTimer);
          clearTimeout(requestTimer.current);
          searchWorker.terminate();
          worker.current = null;
          initialized.current = false;
          workerFailure.current = error;
          setState({ result: null, loading: false, error });
        };
        searchWorker.onmessage = (
          event: MessageEvent<{
            type?: "ready";
            requestId?: number;
            result?: LibrarySearchResult;
            error?: string;
          }>,
        ) => {
          if (!active || worker.current !== searchWorker) return;
          if (event.data.type === "ready") {
            clearTimeout(startupTimer);
            initialized.current = true;
            setReady((value) => value + 1);
            return;
          }
          if (event.data.requestId !== sequence.current) return;
          clearTimeout(requestTimer.current);
          setState({
            result: event.data.result ?? null,
            loading: false,
            error: event.data.error ?? null,
          });
        };
        searchWorker.onerror = () => fail("检索进程无法运行，请重试");
        searchWorker.onmessageerror = () => fail("检索结果无法读取，请重试");
        startupTimer = setTimeout(
          () => fail("检索进程启动超时，请重试"),
          12_000,
        );
        searchWorker.postMessage({
          type: "init",
          summaries: library.summaries,
          documents: curatedSearchDocuments,
          searchShards: (library.source === "curated-fallback"
            ? []
            : (library.manifest?.searchShards ?? [])
          ).map((shard) => {
            const kind = shard.path.match(
              /\/search\/([a-z-]+)-\d+\.json$/,
            )?.[1] as LibraryKind;
            if (!Object.hasOwn(libraryKindNames, kind))
              throw new Error("全文索引类别不正确");
            return { path: shard.path, kind };
          }),
        });
      } catch {
        clearTimeout(startupTimer);
        worker.current?.terminate();
        worker.current = null;
      }
    }
    if (!worker.current) {
      fallback.current = new LibrarySearchIndex(library.summaries);
      curatedSearchDocuments.forEach((document) =>
        fallback.current?.addDocument(document),
      );
      initialized.current = true;
      setReady((value) => value + 1);
    }
    return () => {
      active = false;
      clearTimeout(startupTimer);
      clearTimeout(requestTimer.current);
      sequence.current++;
      worker.current?.terminate();
      worker.current = null;
      fallback.current = null;
    };
  }, [library.summaries, library.manifest?.generatedAt, retry]);
  const {
    query,
    kind,
    facet,
    spoilers,
    scope,
    releaseFilter,
    favorites,
    visited,
    offset,
    limit,
  } = request;
  useEffect(() => {
    const requestId = ++sequence.current;
    clearTimeout(requestTimer.current);
    if (workerFailure.current) {
      setState({
        result: null,
        loading: false,
        error: workerFailure.current,
      });
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    if (!initialized.current) return;
    const timeout = setTimeout(
      () => {
        const parameters = {
          query,
          kind,
          facet,
          spoilers,
          scope,
          releaseFilter,
          favorites,
          visited,
          offset,
          limit,
        };
        if (worker.current) {
          requestTimer.current = setTimeout(() => {
            if (requestId !== sequence.current) return;
            const error = "检索响应超时，请重试";
            worker.current?.terminate();
            worker.current = null;
            initialized.current = false;
            workerFailure.current = error;
            setState({ result: null, loading: false, error });
          }, 45_000);
          try {
            worker.current.postMessage({
              type: "search",
              requestId,
              request: parameters,
            });
          } catch {
            clearTimeout(requestTimer.current);
            const error = "检索进程无法接收请求，请重试";
            worker.current?.terminate();
            worker.current = null;
            initialized.current = false;
            workerFailure.current = error;
            setState({ result: null, loading: false, error });
          }
        } else if (fallback.current)
          setState({
            result: {
              ...fallback.current.search(parameters),
              fullText: !library.manifest?.searchShards?.length,
            },
            loading: false,
            error: null,
          });
      },
      query ? 90 : 0,
    );
    return () => {
      clearTimeout(timeout);
      clearTimeout(requestTimer.current);
    };
  }, [
    query,
    kind,
    facet,
    spoilers,
    scope,
    releaseFilter,
    favorites,
    visited,
    offset,
    limit,
    ready,
    library.manifest?.searchShards?.length,
  ]);
  return { ...state, library, retry: () => setRetry((value) => value + 1) };
}

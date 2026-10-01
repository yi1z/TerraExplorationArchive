import { useEffect, useState, useSyncExternalStore } from "react";
import { entries, entryById, kindNames, sources } from "../data/archive";
import {
  libraryKindNames,
  type LibraryDetail,
  type LibraryFilter,
  type LibraryKind,
  type LibraryManifest,
  type LibrarySearchDocument,
  type LibrarySummary,
} from "../data/library-types";
import type { ArchiveEntry } from "../data/types";
import { applyLibraryDetailOverrides } from "../data/library-overrides";
import { libraryFacetGroups } from "./library-search-core";
import {
  decodeCompactCatalogue,
  fetchResourceJson,
  loadOnlineDescriptor,
  RESOURCE_MODE,
  resourceInfo,
  resourceUrl,
  type ResourceOptions,
} from "./resource-provider";

export function matchesLibraryKind(
  entry: { kind: LibraryKind },
  kind: LibraryFilter,
) {
  return (
    kind === "all" ||
    entry.kind === kind ||
    (kind === "world" &&
      ["country", "city", "faction", "concept"].includes(entry.kind))
  );
}
export function summaryFacetValues(entry: LibrarySummary): string[] {
  const values = Object.values(entry.facets ?? {})
    .flat()
    .filter(Boolean);
  return values.length ? [...new Set(values)] : [libraryKindNames[entry.kind]];
}
export function curatedSummary(entry: ArchiveEntry): LibrarySummary {
  const source = sources[entry.sources[0]];
  const facet =
    entry.kind === "operator"
      ? entry.operator.profession
      : entry.kind === "enemy"
        ? entry.enemy.rank
        : entry.kind === "item"
          ? entry.item.category
          : kindNames[entry.kind];
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    en: entry.en,
    aliases: entry.aliases,
    summary: entry.summary,
    summaryStatus: "curated",
    tags: entry.tags,
    releaseStatus:
      entry.kind === "item" && entry.item.historical
        ? "historical"
        : "released",
    source: {
      title: source.title,
      url: source.url,
      timestamp: source.checkedAt,
    },
    detailShard: "",
    legacyId: entry.id,
    facets: {
      [entry.kind === "operator"
        ? "profession"
        : entry.kind === "enemy"
          ? "rank"
          : entry.kind === "item"
            ? "category"
            : "type"]: [facet],
    },
  };
}
export function curatedDetail(entry: ArchiveEntry): LibraryDetail {
  return {
    ...curatedSummary(entry),
    facts: entry.facts,
    sections: entry.sections,
    relationships:
      entry.relationships ??
      entry.related.map((target) => ({ target, label: "关联档案" })),
    fields:
      entry.kind === "operator"
        ? { ...entry.operator }
        : entry.kind === "enemy"
          ? { ...entry.enemy }
          : entry.kind === "item"
            ? { ...entry.item }
            : {},
    templates: [],
    artworkRefs: [],
  };
}
export const curatedSearchDocuments: LibrarySearchDocument[] = entries.map(
  (entry) => {
    const detail = curatedDetail(entry);
    return {
      id: entry.id,
      text: [
        entry.name,
        entry.en,
        ...entry.aliases,
        entry.summary,
        ...entry.tags,
        ...entry.facts.flatMap((f) => [f.label, f.value]),
        JSON.stringify(detail.fields),
        ...entry.sections.filter((s) => !s.spoiler).map((s) => s.body),
      ].join(" "),
      spoilerText: entry.sections
        .filter((s) => s.spoiler)
        .map((s) => s.body)
        .join(" "),
    };
  },
);
const fallbackSummaries = entries.map(curatedSummary);
export type LibraryStatus = "idle" | "loading" | "ready" | "error";
interface LibrarySnapshot {
  status: LibraryStatus;
  manifest: LibraryManifest | null;
  summaries: LibrarySummary[];
  error: string | null;
  source: "online" | "offline" | "curated-fallback";
}
let snapshot: LibrarySnapshot = {
  status: "idle",
  manifest: null,
  summaries: fallbackSummaries,
  error: null,
  source: "curated-fallback",
};
let byId = new Map(fallbackSummaries.map((entry) => [entry.id, entry]));
const listeners = new Set<() => void>();
export const subscribeLibrary = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getLibrarySnapshot = () => snapshot;
const publish = (next: Partial<LibrarySnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
};
const knownKinds = new Set(Object.keys(libraryKindNames));
export function isLibraryId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length <= 180 &&
    /^prts-[a-z][a-z-]*-[a-z0-9][a-z0-9_-]*$/i.test(id)
  );
}
export function resolveLibraryId(id: string): string | null {
  if (byId.has(id)) return id;
  const alias = snapshot.manifest?.legacyAliases?.[id];
  if (alias && byId.has(alias)) return alias;
  // A cold deep link remains pending until the index has actually answered.
  return snapshot.status !== "ready" && isLibraryId(id) ? id : null;
}
export function getLibrarySummary(id: string): LibrarySummary | undefined {
  return byId.get(id) ?? byId.get(snapshot.manifest?.legacyAliases?.[id] ?? "");
}
export function libraryFacets(kind: LibraryFilter) {
  const legacy = [
    ...new Set(
      snapshot.summaries
        .filter((entry) => matchesLibraryKind(entry, kind))
        .flatMap(summaryFacetValues),
    ),
  ];
  return [
    ...legacy,
    ...libraryFacetGroups(snapshot.summaries, kind).flatMap((group) =>
      group.options.map((option) => option.value),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
}
export function libraryUrl(path: string) {
  if (
    !/^data\/prts\/[a-zA-Z0-9_./-]+\.json$/.test(path) ||
    path.split("/").includes("..")
  )
    throw new Error("资料路径不合法");
  return resourceUrl(path);
}
async function fetchJson(
  path: string,
  options?: ResourceOptions,
): Promise<unknown> {
  libraryUrl(path);
  return fetchResourceJson(path, options);
}
function recordsFrom(value: unknown): unknown[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { records?: unknown }).records)
  )
    throw new Error("资料分片格式不正确");
  return (value as { records: unknown[] }).records;
}
function isSummary(value: unknown): value is LibrarySummary {
  if (!value || typeof value !== "object") return false;
  const entry = value as LibrarySummary;
  return (
    typeof entry.id === "string" &&
    entry.id.length <= 180 &&
    typeof entry.name === "string" &&
    knownKinds.has(entry.kind) &&
    typeof entry.summary === "string" &&
    Array.isArray(entry.aliases) &&
    Array.isArray(entry.tags) &&
    typeof entry.detailShard === "string"
  );
}
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        result[index] = await task(items[index]);
      }
    }),
  );
  return result;
}
let loading: Promise<void> | null = null;
let manifestLoading: Promise<LibraryManifest> | null = null;
let detailPaths = new Map<string, string>();
function loadManifest(force = false): Promise<LibraryManifest> {
  if (manifestLoading) return manifestLoading;
  if (snapshot.manifest && !force) return Promise.resolve(snapshot.manifest);
  manifestLoading = (async () => {
    const manifest = (await fetchJson(
      "data/prts/manifest.json",
    )) as LibraryManifest;
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.indexShards) ||
      !Array.isArray(manifest.detailShards)
    )
      throw new Error("资料版本暂不支持");
    if (
      RESOURCE_MODE === "online" &&
      manifest.snapshotId !== resourceInfo.snapshotId
    )
      throw new Error("在线资料与固定版本不一致");
    manifest.detailShards.forEach((shard) => libraryUrl(shard.path));
    detailPaths = new Map(
      manifest.detailShards.flatMap((shard) =>
        shard.ids.map((id) => [id, shard.path] as const),
      ),
    );
    if (snapshot.manifest?.generatedAt !== manifest.generatedAt)
      detailCache.clear();
    publish({ manifest });
    return manifest;
  })().finally(() => {
    manifestLoading = null;
  });
  return manifestLoading;
}
export function loadLibrary(force = false): Promise<void> {
  if (loading) return loading;
  if (snapshot.status === "ready" && !force) return Promise.resolve();
  publish({ status: "loading", error: null });
  loading = (async () => {
    const [manifest, descriptor] = await Promise.all([
      loadManifest(force),
      RESOURCE_MODE === "online" ? loadOnlineDescriptor() : null,
    ]);
    const shards = descriptor
      ? await mapConcurrent(descriptor.catalogShards, 6, async (shard) => {
          const records = decodeCompactCatalogue(
            await fetchResourceJson(shard.path),
            descriptor.detailPaths,
          );
          if (
            records.length !== shard.count ||
            records.some((record) => record.kind !== shard.kind)
          )
            throw new Error("在线目录条数或类别不一致");
          return records;
        })
      : await mapConcurrent(manifest.indexShards, 6, async (shard) =>
          recordsFrom(await fetchJson(shard.path)),
        );
    const summaries = new Map(
      fallbackSummaries.map((entry) => [entry.id, entry]),
    );
    for (const record of shards.flat()) {
      if (!isSummary(record)) throw new Error("目录中有未通过校验的记录");
      summaries.set(
        record.id,
        record.kind === "world" && entryById[record.id]
          ? { ...record, kind: entryById[record.id].kind }
          : record,
      );
    }
    byId = summaries;
    publish({
      status: "ready",
      manifest,
      summaries: [...summaries.values()],
      error: null,
      source: RESOURCE_MODE,
    });
  })()
    .catch((error) => {
      publish({
        status: "error",
        error: error instanceof Error ? error.message : "资料暂时无法载入",
      });
      throw error;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
const detailCache = new Map<string, Map<string, LibraryDetail>>();
const detailPending = new Map<string, Promise<Map<string, LibraryDetail>>>();
async function loadDetailShard(
  path: string,
  options: ResourceOptions = {},
): Promise<Map<string, LibraryDetail>> {
  options.signal?.throwIfAborted();
  const version = snapshot.manifest?.generatedAt;
  const key = `${version ?? "local"}:${path}`;
  const cached = detailCache.get(key);
  if (cached) {
    detailCache.delete(key);
    detailCache.set(key, cached);
    return cached;
  }
  const pending = options.signal ? undefined : detailPending.get(key);
  if (pending) return pending;
  const request = (async () => {
    const records = recordsFrom(await fetchJson(path, options));
    const index = new Map<string, LibraryDetail>();
    for (const value of records) {
      if (!isSummary(value)) throw new Error("档案格式不正确");
      const record = value as LibraryDetail;
      if (!Array.isArray(record.sections) || !Array.isArray(record.facts))
        throw new Error("档案正文格式不正确");
      index.set(
        record.id,
        applyLibraryDetailOverrides({
          ...record,
          relationships: record.relationships ?? [],
          fields: record.fields ?? {},
          templates: record.templates ?? [],
          artworkRefs: record.artworkRefs ?? [],
        }),
      );
    }
    detailCache.set(key, index);
    while (detailCache.size > 6)
      detailCache.delete(detailCache.keys().next().value!);
    return index;
  })().finally(() => {
    if (!options.signal) detailPending.delete(key);
  });
  if (!options.signal) detailPending.set(key, request);
  return request;
}
export async function loadLibraryEntry(
  id: string,
  options: ResourceOptions = {},
): Promise<LibraryDetail | null> {
  options.signal?.throwIfAborted();
  // The manifest already maps IDs to detail shards. A deep link need not wait
  // for every search-directory shard to arrive before its dossier is readable.
  void loadLibrary().catch(() => {});
  const manifest = await loadManifest();
  options.signal?.throwIfAborted();
  const canonical = manifest.legacyAliases?.[id] ?? id;
  const summary = getLibrarySummary(canonical);
  const path = detailPaths.get(canonical) ?? summary?.detailShard;
  if (!path)
    return entryById[canonical] ? curatedDetail(entryById[canonical]) : null;
  const records = await loadDetailShard(path, options);
  const record = records.get(canonical);
  if (!record) throw new Error("索引与档案分片不一致，请重试更新资料");
  return record;
}
export function useLibrary() {
  const current = useSyncExternalStore(
    subscribeLibrary,
    getLibrarySnapshot,
    getLibrarySnapshot,
  );
  useEffect(() => {
    if (current.status === "idle") void loadLibrary().catch(() => {});
  }, [current.status]);
  return { ...current, retry: () => loadLibrary(true).catch(() => {}) };
}
export function useLibraryEntry(id: string | null | undefined) {
  const library = useLibrary();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: string | null;
    entry: LibraryDetail | null;
    status: LibraryStatus | "missing";
    error: string | null;
  }>({ id: null, entry: null, status: "idle", error: null });
  useEffect(() => {
    if (!id) return;
    let active = true;
    const controller = new AbortController();
    setResult({ id, entry: null, status: "loading", error: null });
    void loadLibraryEntry(id, { signal: controller.signal })
      .then((entry) => {
        if (active)
          setResult({
            id,
            entry,
            status: entry ? "ready" : "missing",
            error: null,
          });
      })
      .catch((error) => {
        if (active)
          setResult({
            id,
            entry: entryById[id] ? curatedDetail(entryById[id]) : null,
            status: "error",
            error: error instanceof Error ? error.message : "档案载入失败",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    id,
    library.manifest?.snapshotId,
    library.manifest?.generatedAt,
    attempt,
  ]);
  const value =
    result.id === id
      ? result
      : {
          entry: null,
          status: id ? ("loading" as const) : ("idle" as const),
          error: null,
        };
  return {
    ...value,
    summary: id ? getLibrarySummary(id) : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

import pin from "../../resources/online-release.json";
import {
  libraryKindNames,
  type LibraryKind,
  type LibrarySummary,
} from "../data/library-types";
import { fetchJsonWithTimeout } from "./fetch-json";

export const RESOURCE_MODE: "online" | "offline" =
  import.meta.env.VITE_RESOURCE_MODE === "offline" ? "offline" : "online";
export const resourceInfo = {
  mode: RESOURCE_MODE,
  ref: pin.ref,
  snapshotId: pin.snapshotId,
} as const;
const repository = "yi1z/TerraExplorationArchive";
export interface ResourceOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}
export interface ResourceArtwork {
  id: string;
  title: string;
  role: string;
  path: string;
  thumbnail?: string;
  preview?: string;
  full?: string;
  width?: number;
  height?: number;
  sourceUrl?: string;
  filePage?: string;
  remote?: { thumbnail?: string; preview?: string; full?: string };
}
export interface ArtworkMetadata {
  id: string;
  artworks: ResourceArtwork[];
}
export interface OnlineDescriptor {
  schemaVersion: 1;
  snapshotId: string;
  dataManifest: string;
  detailPaths: string[];
  catalogShards: { path: string; kind: LibraryKind; count: number }[];
  cardShards: { path: string; kind: LibraryKind; count: number }[];
  art: { buckets: 256; algorithm: "fnv1a32"; pathPrefix: string };
}
export function resourceUrl(path: string, mode = RESOURCE_MODE) {
  if (
    !/^(?:data\/prts|resources\/online|assets\/library)\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/.test(
      path,
    )
  )
    throw new Error("资料路径不合法");
  if (mode === "offline") {
    if (path.startsWith("resources/"))
      throw new Error("离线模式不读取在线描述文件");
    return import.meta.env.BASE_URL + path;
  }
  if (pin.repository !== repository || !/^[a-f0-9]{40}$/.test(pin.ref))
    throw new Error("在线资料必须固定到有效提交版本");
  if (path.startsWith("assets/"))
    throw new Error("在线图片须通过版本化元数据读取");
  return `https://raw.githubusercontent.com/${repository}/${pin.ref}/${path.startsWith("data/") ? "public/" : ""}${path}`;
}
export async function fetchResourceJson<T = unknown>(
  path: string,
  options: ResourceOptions = {},
): Promise<T> {
  const retries =
    Number.isFinite(options.retries) && (options.retries ?? 0) >= 1 ? 1 : 0;
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return (await fetchJsonWithTimeout(
        resourceUrl(path),
        {
          signal: options.signal,
          cache: RESOURCE_MODE === "online" ? "force-cache" : "no-cache",
          credentials: "omit",
          redirect: "error",
        },
        options.timeoutMs,
      )) as T;
    } catch (error) {
      if (
        options.signal?.aborted ||
        attempt >= retries ||
        /(?:取消|[（(]4\d\d[）)])/.test(String(error))
      )
        throw error;
    }
  }
}
interface SharedRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  consumers: number;
  settled: boolean;
}
const requests = new Map<string, SharedRequest>();
/** Each consumer can leave independently; only the last departure aborts IO. */
function sharedJson<T>(path: string, options: ResourceOptions): Promise<T> {
  options.signal?.throwIfAborted();
  const key = `${path}:${options.timeoutMs ?? 20_000}:${options.retries ?? 0}`;
  let request = requests.get(key);
  if (!request) {
    const controller = new AbortController();
    const created: SharedRequest = {
      controller,
      consumers: 0,
      settled: false,
      promise: Promise.resolve(),
    };
    created.promise = fetchResourceJson(path, {
      ...options,
      signal: controller.signal,
    }).finally(() => {
      created.settled = true;
      if (requests.get(key) === created) requests.delete(key);
    });
    requests.set(key, created);
    request = created;
  }
  const shared = request;
  shared.consumers++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const complete = (callback: () => void) => {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      shared.consumers--;
      if (!shared.consumers && !shared.settled) {
        shared.controller.abort();
        if (requests.get(key) === shared) requests.delete(key);
      }
      callback();
    };
    const abort = () => complete(() => reject(new Error("资料请求已取消")));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    shared.promise.then(
      (value) => complete(() => resolve(value as T)),
      (error) => complete(() => reject(error)),
    );
  });
}
let descriptor: OnlineDescriptor | undefined;
export async function loadOnlineDescriptor(
  options: ResourceOptions = {},
): Promise<OnlineDescriptor> {
  options.signal?.throwIfAborted();
  if (descriptor) return descriptor;
  const value = await sharedJson<OnlineDescriptor>(pin.descriptorPath, options);
  if (
    value.schemaVersion !== 1 ||
    value.snapshotId !== pin.snapshotId ||
    value.dataManifest !== "data/prts/manifest.json" ||
    !Array.isArray(value.detailPaths) ||
    !Array.isArray(value.catalogShards) ||
    !Array.isArray(value.cardShards) ||
    value.art?.buckets !== 256 ||
    value.art.algorithm !== "fnv1a32" ||
    value.art.pathPrefix !== "resources/online/art"
  )
    throw new Error("在线目录与固定资料版本不一致");
  value.detailPaths.forEach((path) => {
    if (!path.startsWith("data/prts/")) throw new Error("档案路径不合法");
    resourceUrl(path);
  });
  [...value.catalogShards, ...value.cardShards].forEach(
    ({ path, kind, count }) => {
      if (
        !/^resources\/online\/(?:catalog|cards)\//.test(path) ||
        !Object.hasOwn(libraryKindNames, kind) ||
        !Number.isInteger(count) ||
        count < 0
      )
        throw new Error("在线目录路径或类别不正确");
      resourceUrl(path);
    },
  );
  descriptor = value;
  return value;
}
export function artworkBucket(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").slice(-2);
}
const artCache = new Map<string, Record<string, ResourceArtwork[]>>();
export async function loadArtworkMetadata(
  id: string,
  options: ResourceOptions = {},
): Promise<ArtworkMetadata> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(id))
    throw new Error("图片档案 ID 不合法");
  options.signal?.throwIfAborted();
  if (RESOURCE_MODE === "offline") {
    const value = await fetchResourceJson<{ artworks: ResourceArtwork[] }>(
      `assets/library/entries/${id}.json`,
      options,
    );
    return {
      id,
      artworks: Array.isArray(value.artworks) ? value.artworks : [],
    };
  }
  const catalog = await loadOnlineDescriptor(options);
  const bucket = artworkBucket(id);
  let records = artCache.get(bucket);
  if (!records) {
    const data = await sharedJson<{
      snapshotId: string;
      records: Record<string, ResourceArtwork[]>;
    }>(`${catalog.art.pathPrefix}/${bucket}.json`, options);
    if (
      data.snapshotId !== catalog.snapshotId ||
      !data.records ||
      typeof data.records !== "object" ||
      Array.isArray(data.records)
    )
      throw new Error("图片目录与资料版本不一致");
    records = data.records;
    artCache.set(bucket, records);
    while (artCache.size > 12) artCache.delete(artCache.keys().next().value!);
  } else {
    artCache.delete(bucket);
    artCache.set(bucket, records);
  }
  const artworks = Object.hasOwn(records, id) ? records[id] : [];
  if (!Array.isArray(artworks)) throw new Error("图片目录格式不正确");
  return { id, artworks };
}

const cardCache = new Map<
  LibraryKind,
  Record<string, [string, string, string?]>
>();
export async function loadCardArtworkMetadata(
  id: string,
  kind: LibraryKind,
  options: ResourceOptions = {},
): Promise<ArtworkMetadata> {
  if (RESOURCE_MODE === "offline") return loadArtworkMetadata(id, options);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(id) ||
    !Object.hasOwn(libraryKindNames, kind)
  )
    throw new Error("图片档案 ID 或类别不合法");
  options.signal?.throwIfAborted();
  const catalog = await loadOnlineDescriptor(options);
  const shard = catalog.cardShards.find((item) => item.kind === kind);
  if (!shard) return { id, artworks: [] };
  let records = cardCache.get(kind);
  if (!records) {
    const data = await sharedJson<{
      snapshotId: string;
      records: Record<string, [string, string, string?]>;
    }>(shard.path, options);
    if (
      data.snapshotId !== catalog.snapshotId ||
      !data.records ||
      typeof data.records !== "object" ||
      Array.isArray(data.records)
    )
      throw new Error("卡片图片目录与资料版本不一致");
    records = data.records;
    cardCache.set(kind, records);
  }
  const row = Object.hasOwn(records, id) ? records[id] : undefined;
  if (!row) return { id, artworks: [] };
  if (
    !Array.isArray(row) ||
    typeof row[0] !== "string" ||
    typeof row[1] !== "string" ||
    (row[2] != null && typeof row[2] !== "string")
  )
    throw new Error("卡片图片目录格式不正确");
  return {
    id,
    artworks: [
      {
        id: row[0],
        title: "资料图",
        role: "thumbnail",
        path: "",
        sourceUrl: row[1],
        ...(row[2] ? { remote: { thumbnail: row[2] } } : {}),
      },
    ],
  };
}

export function decodeCompactCatalogue(
  value: unknown,
  detailPaths: string[],
): LibrarySummary[] {
  const data = value as {
    schemaVersion: number;
    kind: LibraryKind;
    rows: unknown[][];
  };
  if (
    data?.schemaVersion !== 1 ||
    !Array.isArray(data.rows) ||
    !Object.hasOwn(libraryKindNames, data.kind)
  )
    throw new Error("紧凑目录格式不正确");
  return data.rows.map((row) => {
    const [
      id,
      name,
      en,
      aliases,
      summary,
      summaryStatus,
      tags,
      releaseStatus,
      sourceTitle,
      pageId,
      detailIndex,
      facets,
      sourceOverride,
    ] = row;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof summary !== "string" ||
      !Array.isArray(aliases) ||
      !aliases.every((v) => typeof v === "string") ||
      !Array.isArray(tags) ||
      !tags.every((v) => typeof v === "string") ||
      typeof sourceTitle !== "string" ||
      !["source", "curated", "missing"].includes(String(summaryStatus)) ||
      !["released", "historical", "test", "unreleased", "unknown"].includes(
        String(releaseStatus),
      ) ||
      !Number.isInteger(detailIndex) ||
      !detailPaths[detailIndex as number] ||
      !facets ||
      typeof facets !== "object" ||
      Array.isArray(facets) ||
      !Object.values(facets).every(
        (v) => Array.isArray(v) && v.every((item) => typeof item === "string"),
      )
    )
      throw new Error("紧凑目录条目不完整");
    return {
      id,
      kind: data.kind,
      name,
      en: typeof en === "string" ? en : undefined,
      aliases: aliases as string[],
      summary,
      summaryStatus: summaryStatus as LibrarySummary["summaryStatus"],
      tags: tags as string[],
      releaseStatus: releaseStatus as LibrarySummary["releaseStatus"],
      source: {
        title: String(sourceTitle),
        pageId: typeof pageId === "number" ? pageId : undefined,
        url:
          typeof sourceOverride === "string"
            ? sourceOverride
            : `https://prts.wiki/w/${encodeURIComponent(String(sourceTitle))}`,
      },
      detailShard: detailPaths[detailIndex as number],
      facets: facets as LibrarySummary["facets"],
    };
  });
}

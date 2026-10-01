import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import {
  loadArtworkMetadata,
  loadCardArtworkMetadata,
  type ResourceArtwork,
} from "../lib/resource-provider";
import type { LibraryKind } from "../data/library-types";
import { artworkUrl, curatedAssetUrl } from "../lib/media";
export { localAssetPath, artworkUrl } from "../lib/media";

export type LibraryArt = ResourceArtwork;
type ArtworkState = {
  artworks: LibraryArt[];
  status: "loading" | "ready" | "missing" | "error";
  error?: string;
};
const cache = new Map<string, ArtworkState>();
const pending = new Map<string, Promise<ArtworkState>>();
const listeners = new Map<string, Set<(result: ArtworkState) => void>>();
const empty: ArtworkState = { artworks: [], status: "loading" };

async function getArt(id: string, kind?: LibraryKind): Promise<ArtworkState> {
  const key = kind ? `${id}:card` : id;
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const request = (async (): Promise<ArtworkState> => {
    try {
      const data = kind
        ? await loadCardArtworkMetadata(id, kind)
        : await loadArtworkMetadata(id);
      const artworks = data.artworks.filter((art) => !!artworkUrl(art));
      return { artworks, status: artworks.length ? "ready" : "missing" };
    } catch {
      return { artworks: [], status: "error", error: "图片资料暂时未能载入" };
    }
  })();
  pending.set(key, request);
  const result = await request;
  pending.delete(key);
  cache.set(key, result);
  listeners.get(key)?.forEach((listener) => listener(result));
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return result;
}

export function useLibraryArtwork(id: string, kind?: LibraryKind) {
  const key = kind ? `${id}:card` : id;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; result: ArtworkState }>({
    id: key,
    result: cache.get(key) ?? empty,
  });
  useEffect(() => {
    let active = true;
    const listener = (result: ArtworkState) => {
      if (active) setState({ id: key, result });
    };
    const subscribers = listeners.get(key) ?? new Set();
    subscribers.add(listener);
    listeners.set(key, subscribers);
    getArt(id, kind).then((result) => {
      if (active) setState({ id: key, result });
    });
    return () => {
      active = false;
      subscribers.delete(listener);
      if (!subscribers.size) listeners.delete(key);
    };
  }, [id, key, kind, attempt]);
  return {
    ...(state.id === key ? state.result : (cache.get(key) ?? empty)),
    retry: () => {
      cache.delete(key);
      setAttempt((value) => value + 1);
    },
  };
}

export default function LibraryArtwork({
  entry,
  thumbnail = false,
  decorative = false,
  variantId,
  className = "",
}: {
  entry: {
    id: string;
    name: string;
    kind?: LibraryKind;
    artwork?: {
      thumbnail?: string;
      preview?: string;
      full?: string;
      alt?: string;
    };
  };
  thumbnail?: boolean;
  decorative?: boolean;
  variantId?: string;
  className?: string;
}) {
  const { artworks, status, retry } = useLibraryArtwork(
    entry.id,
    thumbnail ? entry.kind : undefined,
  );
  const art =
    artworks.find((image) => image.id === variantId) ??
    artworks.find((image) =>
      /portrait|landscape|立绘|初始|main/.test(image.role),
    ) ??
    artworks[0];
  const fallbackPath = thumbnail
    ? (entry.artwork?.preview ??
      entry.artwork?.thumbnail ??
      entry.artwork?.full)
    : (entry.artwork?.full ?? entry.artwork?.preview);
  const url =
    artworkUrl(art, thumbnail ? "preview" : "full") ??
    (fallbackPath ? curatedAssetUrl(fallbackPath) : undefined);
  const [failed, setFailed] = useState<string | null>(null);
  return url && failed !== url ? (
    <img
      className={className}
      src={url}
      alt={decorative ? "" : `${entry.name} · ${art?.title || "视觉资料"}`}
      aria-hidden={decorative || undefined}
      data-small={
        (!!art?.width &&
          art.width <= 200 &&
          !!art?.height &&
          art.height <= 200) ||
        undefined
      }
      loading={thumbnail ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(url)}
    />
  ) : (
    <div
      className={`art-unavailable library-art-unavailable ${className}`}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : `${entry.name}视觉资料${status === "loading" ? "载入中" : "暂不可用"}`
      }
    >
      <Crosshair strokeWidth={0.5} />
      <span>{entry.name}</span>
      <small>
        {status === "loading"
          ? "CONNECTING VISUAL RECORD"
          : "TERRA FIELD RECORD"}
      </small>
      {!decorative && status !== "loading" && (
        <button
          onClick={() => {
            setFailed(null);
            retry();
          }}
        >
          重试图像
        </button>
      )}
    </div>
  );
}

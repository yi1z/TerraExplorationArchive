import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";

export interface LibraryArt {
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
}
type ArtworkState = {
  artworks: LibraryArt[];
  status: "loading" | "ready" | "missing" | "error";
  error?: string;
};
const cache = new Map<string, ArtworkState>();
const pending = new Map<string, Promise<ArtworkState>>();
const empty: ArtworkState = { artworks: [], status: "loading" };

export function localAssetPath(path?: string) {
  if (!path || /[\\\u0000-\u001f]/.test(path)) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (
    /[\\%?#\u0000-\u001f]/.test(decoded) ||
    /^(?:[a-z]+:|\/\/)/i.test(decoded) ||
    decoded.split("/").some((segment) => segment === "..")
  )
    return undefined;
  const relative = decoded.replace(/^(?:\.\/|\/|public\/)+/, "");
  if (!relative.startsWith("assets/")) return undefined;
  return (
    import.meta.env.BASE_URL +
    relative.split("/").map(encodeURIComponent).join("/")
  );
}

async function getArt(id: string): Promise<ArtworkState> {
  if (cache.has(id)) return cache.get(id)!;
  if (pending.has(id)) return pending.get(id)!;
  const request = (async (): Promise<ArtworkState> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<ArtworkState>([
        (async (): Promise<ArtworkState> => {
          const response = await fetch(
            `${import.meta.env.BASE_URL}assets/library/entries/${encodeURIComponent(id)}.json`,
            { signal: controller.signal },
          );
          if (response.status === 404)
            return { artworks: [], status: "missing" };
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (!response.headers.get("content-type")?.includes("json"))
            return { artworks: [], status: "missing" };
          const data = await response.json();
          const artworks = (
            Array.isArray(data.artworks) ? data.artworks : []
          ).filter(
            (art: LibraryArt) =>
              art && typeof art.path === "string" && localAssetPath(art.path),
          );
          return { artworks, status: artworks.length ? "ready" : "missing" };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("图片资料请求超时"));
          }, 20_000);
        }),
      ]);
    } catch {
      return { artworks: [], status: "error", error: "图片资料暂时未能载入" };
    } finally {
      clearTimeout(timer);
    }
  })();
  pending.set(id, request);
  const result = await request;
  pending.delete(id);
  cache.set(id, result);
  if (cache.size > 256) cache.delete(cache.keys().next().value!);
  return result;
}

export function useLibraryArtwork(id: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; result: ArtworkState }>({
    id,
    result: cache.get(id) ?? empty,
  });
  useEffect(() => {
    let active = true;
    getArt(id).then((result) => {
      if (active) setState({ id, result });
    });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return {
    ...(state.id === id ? state.result : (cache.get(id) ?? empty)),
    retry: () => {
      cache.delete(id);
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
  const { artworks, status } = useLibraryArtwork(entry.id);
  const art =
    artworks.find((image) => image.id === variantId) ??
    artworks.find((image) => /portrait|立绘|初始|main/.test(image.role)) ??
    artworks[0];
  const path = thumbnail
    ? (art?.thumbnail ?? entry.artwork?.thumbnail ?? art?.preview ?? art?.path)
    : (art?.path ?? entry.artwork?.full ?? entry.artwork?.preview);
  const url = localAssetPath(path);
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
    </div>
  );
}

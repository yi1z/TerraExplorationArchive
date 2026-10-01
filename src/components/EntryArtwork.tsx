import { useState } from "react";
import { Crosshair } from "lucide-react";
import { assetFor, assetUrl } from "../data/assets";
import { catalogueAssetFor, catalogueAssetUrl } from "../data/catalogue-assets";
import type { ArchiveEntry } from "../data/types";

export function artworkFor(
  entry: ArchiveEntry,
  elite = false,
  thumbnail = false,
) {
  const kind =
    entry.kind === "operator"
      ? elite
        ? "elite"
        : "portrait"
      : entry.kind === "enemy"
        ? "enemy"
        : "item";
  const image =
    (thumbnail && entry.kind !== "operator"
      ? catalogueAssetFor(entry.id, "thumbnail")
      : undefined) ??
    catalogueAssetFor(entry.id, kind) ??
    (entry.kind === "operator"
      ? catalogueAssetFor(entry.id, "portrait")
      : undefined);
  if (image)
    return {
      url: catalogueAssetUrl(image),
      name: image.name,
      source: image.sourcePage,
      small: image.width <= 200 && image.height <= 200,
    };
  const existing =
    assetFor(entry.id, thumbnail ? "emblem" : "landscape", !thumbnail) ??
    assetFor(entry.id, "emblem");
  return existing
    ? {
        url: assetUrl(existing),
        name: existing.name,
        source: existing.filePage,
        small: false,
      }
    : null;
}

export default function EntryArtwork({
  entry,
  elite = false,
  thumbnail = false,
  decorative = false,
  className = "",
}: {
  entry: ArchiveEntry;
  elite?: boolean;
  thumbnail?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  const art = artworkFor(entry, elite, thumbnail);
  const [failed, setFailed] = useState<string | null>(null);
  return art && failed !== art.url ? (
    <img
      className={className}
      data-small={art.small || undefined}
      src={art.url}
      alt={decorative ? "" : `${entry.name} · ${art.name}`}
      aria-hidden={decorative || undefined}
      loading={thumbnail ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(art.url)}
    />
  ) : (
    <div
      className={`art-unavailable ${className}`}
      aria-label={`${entry.name}图像暂不可用`}
    >
      <Crosshair strokeWidth={0.5} />
      <span>{entry.name}</span>
      <small>VISUAL RECORD</small>
    </div>
  );
}

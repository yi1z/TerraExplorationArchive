import {
  RESOURCE_MODE,
  resourceInfo,
  type ResourceArtwork,
} from "./resource-provider";

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

export function remoteMediaUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["media.prts.wiki", "torappu.prts.wiki", "prts.wiki"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function curatedAssetUrl(path: string) {
  const local = localAssetPath(path);
  if (!local) return undefined;
  if (RESOURCE_MODE === "offline") return local;
  const relative = path.replace(/^(?:\.\/|\/|public\/)+/, "");
  if (!/^assets\/(?:game|catalogue)\/[A-Za-z0-9_.-]+\.png$/.test(relative))
    return undefined;
  return `https://raw.githubusercontent.com/yi1z/TerraExplorationArchive/${resourceInfo.ref}/public/${relative}`;
}

export function artworkUrl(
  art?: ResourceArtwork,
  size: "thumbnail" | "preview" | "full" = "preview",
) {
  if (!art) return undefined;
  if (RESOURCE_MODE === "online")
    return (
      remoteMediaUrl(art.remote?.[size]) ??
      (size === "preview"
        ? remoteMediaUrl(art.remote?.thumbnail)
        : undefined) ??
      remoteMediaUrl(art.sourceUrl)
    );
  return localAssetPath(art[size] ?? art.path);
}

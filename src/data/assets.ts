import { curatedAssetUrl } from "../lib/media";
import manifest from "./game-assets.json";
import { entryById } from "./archive";
export const gameAssets = manifest;
export type GameAsset = (typeof manifest)[number];
const assets = new Map(
  manifest.map((asset) => [asset.id + ":" + asset.kind, asset]),
);
export function assetFor(
  id: string,
  kind: "emblem" | "landscape",
  inherit = false,
): GameAsset | undefined {
  const own = assets.get(id + ":" + kind);
  if (own || !inherit) return own;
  const region = entryById[id]?.regionId;
  return region ? assets.get(region + ":" + kind) : undefined;
}
export const assetUrl = (asset: GameAsset) => curatedAssetUrl(asset.path)!;

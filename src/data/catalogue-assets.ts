import manifest from "./catalogue-assets.json";

export type CatalogueAssetKind =
  "portrait" | "elite" | "thumbnail" | "enemy" | "item";

export interface CatalogueAsset {
  id: string;
  kind: CatalogueAssetKind;
  name: string;
  path: string;
  sourcePage: string;
  sourceUrl: string;
  downloadedUrl: string;
  filePage: string;
  fileTitle: string;
  sourceTimestamp: string;
  rights: string;
  checkedAt: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  focalPoint: { x: number; y: number };
}

export const catalogueAssets = manifest as CatalogueAsset[];
const byIdAndKind = new Map(
  catalogueAssets.map((asset) => [`${asset.id}:${asset.kind}`, asset]),
);

export function catalogueAssetFor(
  id: string,
  kind: CatalogueAssetKind,
): CatalogueAsset | undefined {
  return byIdAndKind.get(`${id}:${kind}`);
}

export const catalogueAssetUrl = (asset: CatalogueAsset): string =>
  import.meta.env.BASE_URL + asset.path;

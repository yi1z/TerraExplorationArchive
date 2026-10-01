import { useState } from "react";
import { assetFor, assetUrl } from "../data/assets";
export default function GameArtwork({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  const asset = assetFor(id, "landscape", true);
  const [failed, setFailed] = useState<string | null>(null);
  if (!asset || failed === asset.path)
    return (
      <div className={"artwork-placeholder " + className} aria-hidden="true" />
    );
  return (
    <img
      className={"game-artwork " + className}
      src={assetUrl(asset)}
      alt={asset.name}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(asset.path)}
    />
  );
}

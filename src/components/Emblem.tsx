import { useState } from "react";
import styles from "./Emblem.module.css";
import { assetFor, assetUrl } from "../data/assets";
export default function Emblem({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  const asset = assetFor(id, "emblem");
  const [failed, setFailed] = useState<string | null>(null);
  if (asset && failed !== asset.path)
    return (
      <img
        className={styles.emblem + " game-emblem " + className}
        data-backdrop={id === "reunion" ? "black" : undefined}
        src={assetUrl(asset)}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setFailed(asset.path)}
      />
    );
  return (
    <svg
      className={styles.emblem + " index-symbol " + className}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" />
      <path
        d="M32 4V18M32 46V60M4 32H18M46 32H60"
        fill="none"
        stroke="currentColor"
      />
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
  );
}

import { useSyncExternalStore } from "react";
import { useArchiveStore } from "./state";
const query = "(prefers-reduced-motion: reduce)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
export function useReducedMotion() {
  const preference = useArchiveStore((s) => s.preferences.reducedMotion);
  const system = useSyncExternalStore(subscribe, snapshot, () => false);
  return preference || system;
}

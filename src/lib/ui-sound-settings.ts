export const DEFAULT_SOUND_VOLUME = 0.35;

/** Old preferences and malformed storage values retain a quiet default. */
export function normalizeSoundVolume(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : DEFAULT_SOUND_VOLUME;
}

/** User-facing pages start at one; the search worker uses a zero-based offset. */
export function requestedPage(input: string, pages: number): number | null {
  if (!/^-?\d+$/.test(input.trim())) return null;
  const value = Number(input);
  if (!Number.isSafeInteger(value)) return null;
  return Math.min(Math.max(value, 1), Math.max(1, pages)) - 1;
}

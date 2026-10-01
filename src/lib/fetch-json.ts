/** Keep a stalled connection or response body from leaving the UI pending forever. */
export async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 20_000,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new Error("资料请求已取消"));
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("资料请求超时，请重试"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`资料载入失败（${response.status}）`);
        return response.json();
      })(),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
  }
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJsonWithTimeout } from "../src/lib/fetch-json";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded JSON downloads", () => {
  it("aborts stalled connections and allows the next request to recover", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetch);
    const failed = expect(
      fetchJsonWithTimeout("/data.json", {}, 50),
    ).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(50);
    await failed;
    expect(signal?.aborted).toBe(true);
    fetch.mockResolvedValue(new Response('{"recovered":true}'));
    await expect(fetchJsonWithTimeout("/data.json")).resolves.toEqual({
      recovered: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limits body downloads as well as the initial connection", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: () => new Promise(() => {}),
    }));
    const failed = expect(
      fetchJsonWithTimeout("/body.json", {}, 50),
    ).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(50);
    await failed;
  });

  it("cancels a superseded batch without leaving its timer active", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const controller = new AbortController();
    const failed = expect(
      fetchJsonWithTimeout("/batch.json", { signal: controller.signal }),
    ).rejects.toThrow("取消");
    controller.abort();
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});

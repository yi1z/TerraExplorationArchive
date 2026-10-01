import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydratePersistentPreferences,
  mergeHydratedPreferences,
  persistPreferences,
} from "../src/lib/persistence";
import type { Preferences } from "../src/data/types";
const preferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 1,
  favorites: [],
  visited: [],
  spoilers: false,
  reducedMotion: false,
  sound: false,
  ...overrides,
});
afterEach(() => vi.unstubAllGlobals());

describe("reading record migration", () => {
  it("restores stored records while preserving interactions made during hydration", () => {
    const before = preferences({ favorites: ["yan"], visited: ["yan"] });
    const current = preferences({
      favorites: ["prts-item-123"],
      visited: ["yan", "prts-item-123"],
      sound: true,
    });
    const stored = preferences({
      favorites: ["yan", "operator-amiya"],
      visited: ["operator-amiya", "yan"],
      spoilers: true,
    });
    expect(mergeHydratedPreferences(before, current, stored)).toEqual(
      preferences({
        favorites: ["operator-amiya", "prts-item-123"],
        visited: ["operator-amiya", "yan", "prts-item-123"],
        sound: true,
        spoilers: true,
      }),
    );
  });
  it("honors a footprint reset that happens during hydration without clearing favorites", () => {
    const before = preferences({ visited: ["yan"] });
    const restored = mergeHydratedPreferences(
      before,
      preferences(),
      preferences({ favorites: ["yan"], visited: ["yan", "prts-story-99"] }),
    );
    expect(restored.visited).toEqual([]);
    expect(restored.favorites).toEqual(["yan"]);
  });
  it("keeps the local fallback usable when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const record = preferences({ favorites: ["prts-operator-123"] });
    expect(await hydratePersistentPreferences(record)).toEqual(record);
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    expect(persistPreferences(record)).toBe(true);
    expect(JSON.parse(setItem.mock.calls[0][1]).favorites).toEqual(
      record.favorites,
    );
  });
  it("reports unavailable durable storage without blocking in-memory reading", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(persistPreferences(preferences())).toBe(false);
  });
  it("saves the latest reading state when an asynchronous IndexedDB write fails", async () => {
    vi.resetModules();
    const persistence = await import("../src/lib/persistence");
    const completedRequest = (result: unknown) => {
      const request: { result: unknown; onsuccess?: () => void } = { result };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    };
    let rejectWrite: (() => void) | undefined;
    const transaction = vi.fn((_stores: string[], mode: string) => {
      if (mode === "readonly")
        return {
          objectStore: () => ({
            get: (key: string) =>
              completedRequest(key === "migrated-v1" ? true : preferences()),
            getAll: () => completedRequest([]),
          }),
        };
      const write: {
        error: Error;
        onabort?: () => void;
        objectStore: () => { put: () => void; delete: () => void };
      } = {
        error: new Error("quota exceeded"),
        objectStore: () => ({ put() {}, delete() {} }),
      };
      rejectWrite = () => write.onabort?.();
      return write;
    });
    vi.stubGlobal("indexedDB", {
      open: () => completedRequest({ transaction, close() {} }),
    });
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const onError = vi.fn();
    persistence.onPersistenceError(onError);
    await persistence.hydratePersistentPreferences(preferences());

    persistence.persistPreferences(
      preferences({ favorites: ["operator-amiya"] }),
    );
    const latest = preferences({
      favorites: ["prts-operator-123"],
      visited: ["operator-amiya", "prts-operator-123"],
      sound: true,
    });
    persistence.persistPreferences(latest);
    await Promise.resolve();
    expect(rejectWrite).toBeTypeOf("function");
    rejectWrite!();
    await persistence.flushPreferenceWrites();

    const fallbackWrites = setItem.mock.calls.filter(
      ([key]) => key === persistence.LEGACY_STORAGE_KEY,
    );
    expect(fallbackWrites).toHaveLength(1);
    expect(JSON.parse(fallbackWrites[0][1])).toEqual(latest);
    expect(onError).toHaveBeenCalledOnce();
    expect(
      transaction.mock.calls.filter(([, mode]) => mode === "readwrite"),
    ).toHaveLength(1);

    const afterFailure = preferences({ visited: latest.visited });
    expect(persistence.persistPreferences(afterFailure)).toBe(true);
    expect(JSON.parse(setItem.mock.calls.at(-1)![1])).toEqual(afterFailure);
  });
});

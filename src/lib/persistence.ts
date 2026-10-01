import type { Preferences } from "../data/types";

export const LEGACY_STORAGE_KEY = "terra-exploration.preferences.v1";
export const SETTINGS_STORAGE_KEY = "terra-exploration.settings.v2";
const DATABASE_NAME = "terra-exploration.library";
interface ReadingRecord {
  id: string;
  favorite: boolean;
  lastVisited?: number;
}
type Settings = Pick<Preferences, "spoilers" | "reducedMotion" | "sound">;
const settingsFor = ({
  spoilers,
  reducedMotion,
  sound,
}: Preferences): Settings => ({ spoilers, reducedMotion, sound });
let database: IDBDatabase | null = null;
let hydration: Promise<Preferences> | null = null;
let lastPreferences: Preferences | null = null;
let latestPreferences: Preferences | null = null;
let records = new Map<string, ReadingRecord>();
let writes: Promise<void> = Promise.resolve();
let lastTime = 0;
const errors = new Set<() => void>();
export const onPersistenceError = (listener: () => void) => {
  errors.add(listener);
  return () => {
    errors.delete(listener);
  };
};
const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const committed = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("本地档案保存失败"));
  });
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("records"))
        db.createObjectStore("records", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = null;
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("另一个窗口正在更新本地档案"));
  });
}
export function mergeHydratedPreferences(
  before: Preferences,
  current: Preferences,
  saved: Preferences,
): Preferences {
  const favorites = new Set(saved.favorites);
  const currentFavorites = new Set(current.favorites);
  for (const id of before.favorites)
    if (!currentFavorites.has(id)) favorites.delete(id);
  const previousFavorites = new Set(before.favorites);
  for (const id of current.favorites)
    if (!previousFavorites.has(id)) favorites.add(id);
  let visited = [...saved.visited];
  if (before.visited.length && !current.visited.length) visited = [];
  else {
    const previousVisits = new Set(before.visited);
    const changed = current.visited.filter(
      (id) =>
        !previousVisits.has(id) ||
        (id === current.visited.at(-1) && id !== before.visited.at(-1)),
    );
    const moved = new Set(changed);
    visited = [...visited.filter((id) => !moved.has(id)), ...changed];
  }
  return {
    version: 1,
    favorites: [...favorites],
    visited,
    spoilers:
      current.spoilers !== before.spoilers ? current.spoilers : saved.spoilers,
    reducedMotion:
      current.reducedMotion !== before.reducedMotion
        ? current.reducedMotion
        : saved.reducedMotion,
    sound: current.sound !== before.sound ? current.sound : saved.sound,
  };
}
export function hydratePersistentPreferences(
  legacy: Preferences,
): Promise<Preferences> {
  if (hydration) return hydration;
  if (typeof indexedDB === "undefined") return Promise.resolve(legacy);
  hydration = (async () => {
    const db = await openDatabase();
    const read = db.transaction(["records", "settings"], "readonly");
    const marker = await requestValue(
      read.objectStore("settings").get("migrated-v1"),
    );
    if (!marker) {
      const transaction = db.transaction(["records", "settings"], "readwrite");
      const done = committed(transaction);
      const favorites = new Set(legacy.favorites);
      const times = new Map(
        legacy.visited.map((id, index) => [
          id,
          Date.now() - legacy.visited.length + index,
        ]),
      );
      for (const id of new Set([...legacy.favorites, ...legacy.visited]))
        transaction
          .objectStore("records")
          .put({ id, favorite: favorites.has(id), lastVisited: times.get(id) });
      transaction
        .objectStore("settings")
        .put(settingsFor(legacy), "preferences");
      transaction
        .objectStore("settings")
        .put({ migratedAt: new Date().toISOString() }, "migrated-v1");
      await done;
    }
    const transaction = db.transaction(["records", "settings"], "readonly");
    const [rows, settings] = await Promise.all([
      requestValue(transaction.objectStore("records").getAll()) as Promise<
        ReadingRecord[]
      >,
      requestValue(
        transaction.objectStore("settings").get("preferences"),
      ) as Promise<Settings | undefined>,
    ]);
    records = new Map(
      rows
        .filter((row) => typeof row.id === "string")
        .map((row) => [row.id, row]),
    );
    const restored: Preferences = {
      ...legacy,
      ...settings,
      version: 1,
      favorites: [...records.values()]
        .filter((row) => row.favorite)
        .map((row) => row.id),
      visited: [...records.values()]
        .filter((row) => typeof row.lastVisited === "number")
        .sort((a, b) => a.lastVisited! - b.lastVisited!)
        .map((row) => row.id),
    };
    lastTime = Math.max(Date.now(), ...rows.map((row) => row.lastVisited ?? 0));
    lastPreferences = restored;
    database = db;
    return restored;
  })().catch(() => {
    errors.forEach((listener) => listener());
    hydration = null;
    return legacy;
  });
  return hydration;
}

function saveLocalFallback(preferences: Preferences): boolean {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

/** Uses small per-entry IDB writes after migration, with a full local fallback on failure. */
export function persistPreferences(preferences: Preferences): boolean {
  latestPreferences = preferences;
  if (!database || !lastPreferences) return saveLocalFallback(preferences);
  const previous = lastPreferences;
  const db = database;
  const favorites = new Set(preferences.favorites);
  const visits = new Set(preferences.visited);
  const previousFavorites = new Set(previous.favorites);
  const previousVisits = new Set(previous.visited);
  const changed = new Set<string>();
  for (const id of favorites) if (!previousFavorites.has(id)) changed.add(id);
  for (const id of previousFavorites) if (!favorites.has(id)) changed.add(id);
  for (const id of visits) if (!previousVisits.has(id)) changed.add(id);
  for (const id of previousVisits) if (!visits.has(id)) changed.add(id);
  const latest = preferences.visited.at(-1);
  if (latest && latest !== previous.visited.at(-1)) changed.add(latest);
  const newTimes = new Map<string, number>();
  for (const id of preferences.visited)
    if (!previousVisits.has(id) || (id === latest && changed.has(id)))
      newTimes.set(id, (lastTime = Math.max(Date.now(), lastTime + 1)));
  const updates: ReadingRecord[] = [];
  for (const id of changed) {
    const row = { ...records.get(id), id, favorite: favorites.has(id) };
    if (!visits.has(id)) delete row.lastVisited;
    else if (newTimes.has(id)) row.lastVisited = newTimes.get(id);
    records.set(id, row);
    updates.push(row);
  }
  lastPreferences = preferences;
  const settings = settingsFor(preferences);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* IndexedDB remains the durable store. */
  }
  writes = writes
    .then(async () => {
      // An earlier queued transaction may already have switched to the fallback.
      if (database !== db) return;
      const transaction = db.transaction(["records", "settings"], "readwrite");
      const done = committed(transaction);
      for (const row of updates) {
        if (!row.favorite && row.lastVisited === undefined)
          transaction.objectStore("records").delete(row.id);
        else transaction.objectStore("records").put(row);
      }
      transaction.objectStore("settings").put(settings, "preferences");
      await done;
    })
    .catch(() => {
      database = null;
      // Include interactions made while this transaction was pending.
      saveLocalFallback(latestPreferences ?? preferences);
      errors.forEach((listener) => listener());
    });
  return true;
}
export const flushPreferenceWrites = () => writes;

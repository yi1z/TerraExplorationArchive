import {
  libraryKindNames,
  libraryKinds,
  type LibraryFilter,
  type LibrarySearchDocument,
  type LibrarySearchQuery,
  type LibrarySearchResult,
  type LibrarySummary,
} from "../data/library-types";

export const normalizeSearch = (text: string) =>
  text.normalize("NFKC").toLocaleLowerCase().trim();
export function searchMatchesKind(entry: LibrarySummary, kind: LibraryFilter) {
  return (
    kind === "all" ||
    entry.kind === kind ||
    (kind === "world" &&
      ["country", "city", "faction", "concept"].includes(entry.kind))
  );
}
export function searchFacetValues(entry: LibrarySummary): string[] {
  const values = Object.values(entry.facets ?? {})
    .flat()
    .filter(Boolean);
  return values.length ? [...new Set(values)] : [libraryKindNames[entry.kind]];
}
const fieldNames: Record<string, string> = {
  profession: "职业",
  branch: "分支",
  rarity: "稀有度",
  rank: "级别",
  species: "种类",
  movement: "移动方式",
  category: "分类",
  type: "类型",
  chapter: "章节",
  difficulty: "难度",
  owner: "所属干员",
  operator: "所属干员",
  series: "系列",
  theme: "主题",
};
export function facetLabel(value: string) {
  return libraryKindNames[value as keyof typeof libraryKindNames] ?? value;
}
export function permittedFacetFields(kind: LibraryFilter): string[] {
  return kind === "all"
    ? ["kind"]
    : kind === "operator"
      ? ["profession", "branch", "rarity"]
      : kind === "enemy"
        ? ["rank", "species", "movement"]
        : kind === "item"
          ? ["category", "rarity"]
          : [
              "type",
              "chapter",
              "category",
              "difficulty",
              "rarity",
              "owner",
              "operator",
              "series",
              "theme",
            ];
}
export function libraryFacetGroups(
  records: LibrarySummary[],
  kind: LibraryFilter,
) {
  if (kind === "all")
    return [
      {
        field: "kind",
        label: "资料类别",
        options: libraryKinds.map((value) => ({
          value: `kind:${value}`,
          label: libraryKindNames[value],
        })),
      },
    ];
  const permitted = permittedFacetFields(kind);
  const fields = new Map<string, Set<string>>();
  for (const entry of records) {
    if (!searchMatchesKind(entry, kind)) continue;
    for (const [field, values] of Object.entries(entry.facets ?? {})) {
      if (!permitted.includes(field)) continue;
      const group = fields.get(field) ?? new Set<string>();
      values.filter(Boolean).forEach((value) => group.add(value));
      fields.set(field, group);
    }
  }
  return permitted
    .filter((field) => fields.has(field))
    .map((field) => ({
      field,
      label: fieldNames[field] ?? field,
      options: [...fields.get(field)!]
        .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
        .map((value) => ({
          value: `${field}:${value}`,
          label:
            field === "rarity" && /^\d$/.test(value)
              ? `${value} 星`
              : facetLabel(value),
        })),
    }));
}
export function matchesLibraryFacet(entry: LibrarySummary, facet: string) {
  if (facet === "all") return true;
  const colon = facet.indexOf(":");
  if (colon > 0) {
    const field = facet.slice(0, colon);
    const value = facet.slice(colon + 1);
    return field === "kind"
      ? searchMatchesKind(entry, value as LibraryFilter)
      : (entry.facets?.[field] ?? []).includes(value);
  }
  return searchFacetValues(entry).includes(facet);
}
export function matchesReleaseStatus(
  entry: LibrarySummary,
  filter: LibrarySearchQuery["releaseFilter"] = "available",
) {
  return (
    filter === "all" ||
    (filter === "available"
      ? ["released", "historical"].includes(entry.releaseStatus)
      : ["test", "unreleased"].includes(entry.releaseStatus))
  );
}
const grams = (text: string): Set<string> => {
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index++)
    result.add(text.slice(index, index + 2));
  return result;
};
type Posting = Set<number> | Uint32Array;
const postingSize = (posting: Posting | undefined) =>
  posting ? (posting instanceof Set ? posting.size : posting.length) : 0;
function postingHas(posting: Posting | undefined, value: number): boolean {
  if (!posting) return false;
  if (posting instanceof Set) return posting.has(value);
  let low = 0;
  let high = posting.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (posting[middle] === value) return true;
    if (posting[middle] < value) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

/** Built once inside the worker; UI renders only one bounded result page. */
export class LibrarySearchIndex {
  private readonly records: LibrarySummary[];
  private readonly ids = new Map<string, number>();
  private readonly publicText: string[] = [];
  private readonly privateText: string[] = [];
  private readonly postings = new Map<string, Posting>();
  private readonly facets = new Map<LibraryFilter, Set<string>>();
  private readonly counts: Partial<Record<LibraryFilter, number>> = {
    all: 0,
    world: 0,
  };

  constructor(records: LibrarySummary[]) {
    this.records = records;
    records.forEach((entry, index) => {
      this.ids.set(entry.id, index);
      this.counts.all!++;
      this.counts[entry.kind] = (this.counts[entry.kind] ?? 0) + 1;
      if (entry.kind !== "world" && searchMatchesKind(entry, "world"))
        this.counts.world!++;
      for (const kind of new Set<LibraryFilter>([
        "all",
        entry.kind,
        ...(searchMatchesKind(entry, "world") ? ["world" as const] : []),
      ])) {
        const values = this.facets.get(kind) ?? new Set<string>();
        searchFacetValues(entry).forEach((value) => values.add(value));
        this.facets.set(kind, values);
      }
      this.addDocument({
        id: entry.id,
        text: [
          entry.name,
          entry.en ?? "",
          ...entry.aliases,
          entry.summary,
          ...entry.tags,
          ...searchFacetValues(entry),
        ].join(" "),
      });
    });
  }
  addDocument(document: LibrarySearchDocument) {
    const id = this.ids.get(document.id);
    if (id === undefined) return;
    const text = normalizeSearch(document.text);
    const spoiler = normalizeSearch(document.spoilerText ?? "");
    this.publicText[id] = [this.publicText[id] ?? "", text].join(" ");
    this.privateText[id] = [this.privateText[id] ?? "", spoiler].join(" ");
    for (const gram of grams(text + " " + spoiler)) {
      const existing = this.postings.get(gram);
      const posting =
        existing instanceof Set ? existing : new Set<number>(existing);
      posting.add(id);
      this.postings.set(gram, posting);
    }
  }
  compact() {
    for (const [gram, posting] of this.postings)
      if (posting instanceof Set)
        this.postings.set(gram, Uint32Array.from(posting).sort());
  }
  search(request: LibrarySearchQuery): LibrarySearchResult {
    const query = normalizeSearch(request.query).slice(0, 160);
    const favorites = new Set(request.favorites);
    const visited = new Map(request.visited.map((id, index) => [id, index]));
    const limit = Math.max(1, Math.min(80, Math.floor(request.limit ?? 48)));
    const offset = Math.max(0, Math.floor(request.offset ?? 0));
    let candidates: Iterable<number> = this.records.keys();
    const queryGrams = [...grams(query)];
    const lists = queryGrams
      .map((gram) => this.postings.get(gram))
      .sort((a, b) => postingSize(a) - postingSize(b));
    if (query.length >= 2) candidates = lists[0] ?? [];
    const matches: { id: string; score: number; order: number }[] = [];
    for (const index of candidates) {
      const entry = this.records[index];
      if (
        !searchMatchesKind(entry, request.kind) ||
        !matchesLibraryFacet(entry, request.facet) ||
        !matchesReleaseStatus(entry, request.releaseFilter)
      )
        continue;
      if (request.scope === "favorites" && !favorites.has(entry.id)) continue;
      if (request.scope === "recent" && !visited.has(entry.id)) continue;
      if (query) {
        if (lists.slice(1, 8).some((list) => !postingHas(list, index)))
          continue;
        if (
          !this.publicText[index]?.includes(query) &&
          !(request.spoilers && this.privateText[index]?.includes(query))
        )
          continue;
      }
      const name = normalizeSearch(entry.name);
      const englishName = normalizeSearch(entry.en ?? "");
      const aliases = entry.aliases.map(normalizeSearch);
      const score = !query
        ? 0
        : name === query
          ? 1000
          : englishName === query
            ? 900
            : aliases.includes(query)
              ? 800
              : name.startsWith(query)
                ? 600
                : englishName.startsWith(query)
                  ? 500
                  : aliases.some((alias) => alias.startsWith(query))
                    ? 400
                    : name.includes(query)
                      ? 300
                      : 0;
      matches.push({ id: entry.id, score, order: index });
    }
    matches.sort(
      request.scope === "recent"
        ? (a, b) => (visited.get(b.id) ?? 0) - (visited.get(a.id) ?? 0)
        : (a, b) => b.score - a.score || a.order - b.order,
    );
    return {
      ids: matches.slice(offset, offset + limit).map((match) => match.id),
      total: matches.length,
      offset,
      facets: [...(this.facets.get(request.kind) ?? [])].sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
      counts: this.counts,
      complete: true,
      fullText: true,
    };
  }
}

import type { EntryKind } from "./types";

export const libraryKinds = [
  "operator",
  "enemy",
  "item",
  "world",
  "stage",
  "story",
  "event",
  "module",
  "outfit",
  "furniture",
  "furniture-theme",
  "mode",
  "mechanic",
] as const;
export type LibraryKind = EntryKind | (typeof libraryKinds)[number];
export type LibraryFilter = LibraryKind | "all";
export type LibraryReleaseFilter = "available" | "preview" | "all";
export const libraryKindNames: Record<LibraryKind, string> = {
  operator: "干员档案",
  enemy: "敌人档案",
  item: "道具资料",
  world: "泰拉档案",
  country: "国家与文明",
  city: "城市",
  faction: "势力",
  concept: "世界观",
  stage: "关卡",
  story: "剧情",
  event: "活动",
  module: "模组",
  outfit: "时装",
  furniture: "家具",
  "furniture-theme": "家具主题",
  mode: "玩法",
  mechanic: "机制",
};
export interface LibrarySource {
  title: string;
  url: string;
  pageId?: number;
  revisionId?: number;
  timestamp?: string;
  publisher?: string;
}
export interface LibraryArtwork {
  title?: string;
  url?: string;
  role: string;
}
export interface LibrarySummary {
  id: string;
  kind: LibraryKind;
  name: string;
  en?: string;
  aliases: string[];
  summary: string;
  summaryStatus: "source" | "curated" | "missing";
  tags: string[];
  releaseStatus: "released" | "historical" | "test" | "unreleased" | "unknown";
  source: LibrarySource;
  detailShard: string;
  legacyId?: string;
  facets?: Record<string, string[]>;
  facet?: string;
  artwork?: {
    thumbnail?: string;
    preview?: string;
    full?: string;
    alt?: string;
  };
  artworkRefs?: LibraryArtwork[];
}
export interface LibraryDetail extends LibrarySummary {
  additionalSources?: LibrarySource[];
  facts: { label: string; value: string }[];
  sections: {
    title: string;
    body: string;
    spoiler?: boolean;
    sourceKind?: string;
  }[];
  relationships: { target: string; label: string; spoiler?: boolean }[];
  fields: Record<string, unknown>;
  templates: { name: string; params: Record<string, string> }[];
  levels?: { id: string; fields: Record<string, unknown> }[];
  artworkRefs: LibraryArtwork[];
  missingFacts?: string[];
  provenance?: Record<string, unknown>;
}
export interface LibraryShard {
  path: string;
  count: number;
}
export interface LibraryManifest {
  schemaVersion: 1;
  snapshotId: string;
  generatedAt: string;
  status: "partial" | "complete";
  counts: Partial<Record<LibraryKind, number>>;
  indexShards: LibraryShard[];
  detailShards: { path: string; ids: string[] }[];
  searchShards?: LibraryShard[];
  coverage: { path: string };
  legacyAliases: Record<string, string>;
}
export interface LibrarySearchDocument {
  id: string;
  text: string;
  spoilerText?: string;
}
export interface LibrarySearchQuery {
  query: string;
  kind: LibraryFilter;
  facet: string;
  spoilers: boolean;
  scope: "all" | "favorites" | "recent";
  releaseFilter?: LibraryReleaseFilter;
  favorites: string[];
  visited: string[];
  offset?: number;
  limit?: number;
}
export interface LibrarySearchResult {
  ids: string[];
  total: number;
  offset: number;
  facets: string[];
  counts: Partial<Record<LibraryFilter, number>>;
  complete: boolean;
  fullText: boolean;
}

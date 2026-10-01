import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Clock3,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { entryById } from "../data/archive";
import {
  libraryKinds,
  libraryKindNames,
  type LibrarySummary,
  type LibraryReleaseFilter,
} from "../data/library-types";
import { useArchiveStore } from "../lib/state";
import {
  getLibrarySummary,
  matchesLibraryKind,
  summaryFacetValues,
} from "../lib/library";
import { useLibrarySearch } from "../lib/useLibrarySearch";
import {
  facetLabel,
  libraryFacetGroups,
  matchesReleaseStatus,
} from "../lib/library-search-core";
import Dialog from "./Dialog";
import EntryArtwork from "./EntryArtwork";
import LibraryArtwork from "./LibraryArtwork";

export type SearchScope = "all" | "favorites" | "recent";
const english: Record<(typeof libraryKinds)[number], string> = {
  operator: "OPERATORS",
  enemy: "HOSTILES",
  item: "DEPOT",
  world: "TERRA",
  stage: "STAGES",
  story: "STORIES",
  event: "EVENTS",
  module: "MODULES",
  outfit: "OUTFITS",
  furniture: "FURNITURE",
  "furniture-theme": "COLLECTIONS",
  mode: "MODES",
  mechanic: "MECHANICS",
};
export const catalogueCategories = libraryKinds.map((id, index) => ({
  id,
  name: libraryKindNames[id],
  en: english[id],
  number: String(index + 1).padStart(2, "0"),
}));
const PAGE_SIZE = 48;
function ResultArtwork({
  entry,
  thumbnail = false,
}: {
  entry: LibrarySummary;
  thumbnail?: boolean;
}) {
  const curated = entryById[entry.id];
  return curated ? (
    <EntryArtwork entry={curated} thumbnail={thumbnail} decorative />
  ) : (
    <LibraryArtwork entry={entry} thumbnail={thumbnail} decorative />
  );
}
export default function ArchiveSearch({
  onClose,
  initialScope = "all",
}: {
  onClose: () => void;
  initialScope?: SearchScope;
}) {
  const query = useArchiveStore((state) => state.query);
  const kind = useArchiveStore((state) => state.kind);
  const facet = useArchiveStore((state) => state.facet);
  const releaseFilter = useArchiveStore((state) => state.releaseFilter);
  const preferences = useArchiveStore((state) => state.preferences);
  const setFacet = useArchiveStore((state) => state.setFacet);
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [preview, setPreview] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { result, loading, error, library, retry } = useLibrarySearch({
    query,
    kind,
    facet,
    releaseFilter,
    spoilers: preferences.spoilers,
    scope,
    favorites: preferences.favorites,
    visited: preferences.visited,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const counts = useMemo(
    () =>
      Object.fromEntries(
        catalogueCategories.map((category) => [
          category.id,
          library.summaries.filter(
            (entry) =>
              matchesLibraryKind(entry, category.id) &&
              matchesReleaseStatus(entry, releaseFilter),
          ).length,
        ]),
      ),
    [library.summaries, releaseFilter],
  );
  const favorites = useMemo(
    () => new Set(preferences.favorites),
    [preferences.favorites],
  );
  const results = (result?.ids ?? [])
    .map(getLibrarySummary)
    .filter((entry): entry is LibrarySummary => !!entry);
  const hovered = results.find((entry) => entry.id === preview) ?? results[0];
  const facetGroups = useMemo(
    () => libraryFacetGroups(library.summaries, kind),
    [library.summaries, kind],
  );
  const facetOptions = facetGroups.flatMap((group) => group.options);
  const totalAvailable = useMemo(
    () =>
      library.summaries.filter((entry) =>
        matchesReleaseStatus(entry, releaseFilter),
      ).length,
    [library.summaries, releaseFilter],
  );
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const store = useArchiveStore.getState();
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setPage(0);
    setPreview(null);
  }, [query, kind, facet, scope, releaseFilter]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
    setPreview(null);
  }, [page]);
  useEffect(() => {
    if (!loading && page >= pages) setPage(pages - 1);
  }, [loading, page, pages]);
  const open = (id: string) => {
    store.openEntry(id);
    onClose();
  };
  return (
    <Dialog title="检索泰拉档案" wide onClose={onClose}>
      <div className="terminal-search">
        <Search size={22} />
        <input
          ref={input}
          aria-label="搜索档案"
          placeholder="一个名字，一段故事。"
          value={query}
          maxLength={160}
          onChange={(event) => store.setQuery(event.target.value)}
        />
        {query && (
          <button aria-label="清空搜索" onClick={() => store.setQuery("")}>
            <X size={18} />
          </button>
        )}
        <kbd>ESC</kbd>
      </div>
      <div className="search-categories">
        <button
          className={kind === "all" ? "active" : ""}
          onClick={() => store.setKind("all")}
        >
          全部 <small>{totalAvailable}</small>
        </button>
        {catalogueCategories.map((category) => (
          <button
            key={category.id}
            className={kind === category.id ? "active" : ""}
            onClick={() => store.setKind(category.id)}
          >
            {category.name}
            <small>{counts[category.id] ?? 0}</small>
          </button>
        ))}
      </div>
      <div className="search-tools">
        <div className="scope-tabs">
          {(
            [
              ["all", "全部记录"],
              ["favorites", "我的收藏"],
              ["recent", "最近阅读"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={scope === id}
              className={scope === id ? "active" : ""}
              onClick={() => setScope(id)}
            >
              {id === "favorites" ? (
                <Bookmark size={13} />
              ) : id === "recent" ? (
                <Clock3 size={13} />
              ) : null}
              {label}
            </button>
          ))}
        </div>
        <label>
          <SlidersHorizontal size={13} />
          <select
            aria-label="细分筛选"
            value={facet}
            onChange={(event) => setFacet(event.target.value)}
          >
            <option value="all">
              全部
              {kind === "operator"
                ? "职业与分类"
                : kind === "enemy"
                  ? "级别与分类"
                  : "分类"}
            </option>
            {facet !== "all" &&
              !facetOptions.some((option) => option.value === facet) && (
                <option value={facet}>{facetLabel(facet)}</option>
              )}
            {facetGroups.map((group) => (
              <optgroup key={group.field} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {group.label} · {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="release-filter">
          <select
            aria-label="资料收录状态"
            value={releaseFilter}
            onChange={(event) =>
              store.setReleaseFilter(event.target.value as LibraryReleaseFilter)
            }
          >
            <option value="available">正式与历史</option>
            <option value="preview">测试与未实装</option>
            <option value="all">全部（含未确认）</option>
          </select>
        </label>
      </div>
      {(library.status === "loading" || library.status === "error") && (
        <div className="library-search-notice" role="status">
          {library.status === "loading"
            ? "正在接入全量资料目录，当前显示本地精选。"
            : "全量目录暂不可用，当前显示本地精选。"}
          {library.status === "error" && (
            <button onClick={() => void library.retry()}>重试载入</button>
          )}
        </div>
      )}
      <div className="search-result-layout">
        <div className="search-result-scroll" ref={scroll} aria-busy={loading}>
          <div className="result-caption" role="status" aria-live="polite">
            <span>
              {loading
                ? "正在检索…"
                : `${String(result?.total ?? 0).padStart(2, "0")} RECORDS FOUND`}
            </span>
            <span>{result?.fullText ? "全文检索" : "目录检索"}</span>
          </div>
          {error ? (
            <div className="terminal-empty">
              <Search size={34} />
              <h3>检索暂未完成</h3>
              <p>{error}</p>
              <button onClick={retry}>重试检索</button>
            </div>
          ) : (
            <>
              <div className="terminal-results">
                {results.map((entry, index) => (
                  <button
                    key={entry.id}
                    className={`terminal-result ${entry.id === preview ? "previewing" : ""}`}
                    onMouseEnter={() => setPreview(entry.id)}
                    onFocus={() => setPreview(entry.id)}
                    onClick={() => open(entry.id)}
                    aria-label={`打开档案${entry.name}`}
                  >
                    <div className={`result-art type-${entry.kind}`}>
                      <ResultArtwork entry={entry} thumbnail />
                      {favorites.has(entry.id) && (
                        <Bookmark size={12} fill="currentColor" />
                      )}
                    </div>
                    <span className="result-index">
                      {String(page * PAGE_SIZE + index + 1).padStart(3, "0")}
                    </span>
                    <strong>{entry.name}</strong>
                    <small>
                      {facetLabel(entry.facet ?? summaryFacetValues(entry)[0])}
                    </small>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
              {loading && !results.length && (
                <div className="terminal-empty">
                  <LoaderCircle size={30} />
                  <p>正在检索资料，请稍候。</p>
                </div>
              )}
              {!loading && !results.length && (
                <div className="terminal-empty">
                  <Search size={34} />
                  <h3>未发现匹配档案</h3>
                  <p>尝试其他名字，或清除筛选继续探索。</p>
                  <button
                    onClick={() => {
                      store.setQuery("");
                      store.setKind("all");
                      setFacet("all");
                      setScope("all");
                    }}
                  >
                    重置检索
                  </button>
                </div>
              )}
              {pages > 1 && (
                <nav className="search-pagination" aria-label="检索结果分页">
                  <button
                    disabled={page === 0 || loading}
                    onClick={() => setPage((value) => value - 1)}
                    aria-label="上一页"
                  >
                    <ArrowLeft size={16} />
                    上一页
                  </button>
                  <span>
                    {page + 1} / {pages}
                  </span>
                  <button
                    disabled={page >= pages - 1 || loading}
                    onClick={() => setPage((value) => value + 1)}
                    aria-label="下一页"
                  >
                    下一页
                    <ArrowRight size={16} />
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
        {hovered && (
          <aside className="result-preview" aria-label="档案预览">
            <div className={`preview-art type-${hovered.kind}`}>
              <ResultArtwork key={hovered.id} entry={hovered} />
            </div>
            <span className="terminal-kicker">
              {libraryKindNames[hovered.kind]} / PREVIEW
            </span>
            <h3>{hovered.name}</h3>
            <p>
              {hovered.summary ||
                "这条资料尚无可靠摘要，可接入档案查阅已收录内容。"}
            </p>
            <button onClick={() => open(hovered.id)}>
              接入档案 <ArrowUpRight size={15} />
            </button>
          </aside>
        )}
      </div>
      <div className="search-footer">
        <span>
          PRTS /{" "}
          {library.manifest
            ? `资料快照 ${library.manifest.generatedAt.slice(0, 10)}`
            : "本地精选资料库"}
        </span>
        <span>
          每页 {PAGE_SIZE} 条 ·{" "}
          {library.manifest?.status === "partial"
            ? "收录进度见资料说明"
            : "方向由你决定，故事从这里继续。"}
        </span>
      </div>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Layers,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { libraryKindNames } from "../data/library-types";
import { getLibrarySummary, useLibrary, useLibraryEntry } from "../lib/library";
import { useArchiveStore } from "../lib/state";
import LibraryArtwork, { useLibraryArtwork } from "./LibraryArtwork";
import LibraryDossier, { recordLabel } from "./LibraryDossier";
import VisualScene from "./VisualScene";

export default function LibraryTerminal({
  id,
  hidden,
  onSearch,
}: {
  id: string;
  hidden: boolean;
  onSearch: (kind?: string) => void;
}) {
  const store = useArchiveStore();
  const library = useLibrary();
  const { entry, summary, status, error, retry } = useLibraryEntry(id);
  const { artworks } = useLibraryArtwork(id);
  const record = entry ?? summary;
  const heading = useRef<HTMLHeadingElement>(null);
  const [reading, setReading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [variantId, setVariantId] = useState<string>();
  useEffect(() => {
    setReading(false);
    setVariantId(undefined);
  }, [id]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [record?.id]);
  const siblings = useMemo(
    () =>
      library.summaries.filter(
        (row) =>
          row.kind === record?.kind &&
          (store.releaseFilter === "all" ||
            (store.releaseFilter === "preview"
              ? ["test", "unreleased"].includes(row.releaseStatus)
              : ["released", "historical"].includes(row.releaseStatus))),
      ),
    [library.summaries, record?.kind, store.releaseFilter],
  );
  const index = siblings.findIndex((row) => row.id === record?.id);
  const next = (direction: number) => {
    if (siblings.length)
      store.openEntry(
        siblings[
          index < 0
            ? direction > 0
              ? 0
              : siblings.length - 1
            : (index + direction + siblings.length) % siblings.length
        ].id,
      );
  };
  const openDossier = (nextTab = "overview") => {
    setTab(nextTab);
    setReading(true);
    store.openEntry(id);
  };
  if (!record)
    return (
      <main className="library-entry-state" id="terminal-main" tabIndex={-1}>
        <span className="terminal-kicker">TERRA / CONNECTING ARCHIVE</span>
        <h1>
          {status === "loading" || status === "idle"
            ? "正在接入档案"
            : status === "missing"
              ? "未找到此档案"
              : "资料暂未连接"}
        </h1>
        <p role="status">
          {error ||
            (status === "missing"
              ? "这条链接不在当前资料快照中。"
              : "正在从本地资料库读取记录。")}
        </p>
        {(status === "error" || status === "missing") && (
          <div>
            <button className="terminal-primary" onClick={retry}>
              <RefreshCw size={17} />
              重新载入
            </button>
            <button onClick={() => onSearch()}>
              打开资料目录 <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </main>
    );
  const relations = (entry?.relationships ?? []).filter(
    (relation) =>
      (store.preferences.spoilers || !relation.spoiler) &&
      getLibrarySummary(relation.target),
  );
  const saved = store.preferences.favorites.includes(id);
  const kindName = libraryKindNames[record.kind];
  const roles =
    record.kind === "operator"
      ? ["portrait", "elite", "outfit"]
      : record.kind === "module"
        ? ["module"]
        : record.kind === "outfit"
          ? ["outfit"]
          : record.kind === "enemy"
            ? ["enemy"]
            : record.kind === "furniture"
              ? ["furniture"]
              : record.kind === "furniture-theme"
                ? ["preview", "furniture-theme"]
                : undefined;
  const mainArt = roles
    ? artworks.filter((art) => roles.includes(art.role))
    : artworks;
  const mainVariant =
    variantId ??
    (record.kind === "furniture-theme"
      ? mainArt.find((art) => art.role === "preview")?.id
      : undefined) ??
    mainArt[0]?.id;
  return (
    <main
      id="terminal-main"
      tabIndex={-1}
      className={`archive-terminal library-terminal scene-${record.kind} ${hidden ? "interface-hidden" : ""}`}
      aria-label={`${record.name}档案主舞台`}
    >
      <VisualScene
        entry={record}
        reading={reading}
        reducedMotion={store.preferences.reducedMotion}
      />
      <div className="stage-grid" aria-hidden="true" />
      <div className="stage-orbit" aria-hidden="true" />
      <div className="stage-coordinate" aria-hidden="true">
        TERRA / {record.kind.toUpperCase()} ARCHIVE
        <br />
        RECORDS CONNECT THE WORLD
      </div>
      <div
        className="stage-artwork"
        data-reactive="tilt"
        key={`${id}-${variantId || "main"}`}
      >
        <div className="artwork-shadow">
          <LibraryArtwork entry={record} variantId={mainVariant} decorative />
        </div>
        <div className="artwork-main">
          <LibraryArtwork entry={record} variantId={mainVariant} />
        </div>
      </div>
      <div className="hero-wordmark" aria-hidden="true" key={`word-${id}`}>
        {record.en || record.kind.toUpperCase()}
      </div>
      <div className="subject-reticle interface-part" aria-hidden="true">
        <ScanLine size={19} />
        <span>
          VISUAL RECORD
          <br />
          <b>{String(Math.max(0, index) + 1).padStart(3, "0")}</b>
        </span>
      </div>
      <section
        className={`hero-copy interface-part ${record.name.length > 6 ? "long-name" : ""}`}
        key={id}
      >
        <div className="hero-eyebrow">
          <span className="signal-dot" />
          <span>{record.kind.toUpperCase()} ARCHIVE</span>
          <i />
          <span>PRTS / LOCAL RECORD</span>
        </div>
        <div className="hero-category">
          {kindName}
          <span>
            {record.releaseStatus === "historical"
              ? "历史记录"
              : record.releaseStatus === "test"
                ? "测试资料"
                : record.releaseStatus === "unreleased"
                  ? "未实装"
                  : "FIELD RECORD"}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {record.name}
        </h1>
        <div className="hero-english">{record.en || "TERRA EXPLORATION"}</div>
        <p className="hero-tagline">
          {record.tags.slice(0, 3).join(" / ") || "沿着记录，继续探索这片大地"}
        </p>
        <p className="hero-summary">
          {record.summary || "从资料、图像与关联线索，了解这份记录。"}
        </p>
        <dl className="hero-facts">
          {(entry?.facts ?? [{ label: "资料类别", value: kindName }])
            .slice(0, 3)
            .map((fact) => (
              <div key={fact.label}>
                <dt>{recordLabel(fact.label)}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
        </dl>
        <div className="hero-actions">
          <button
            className="terminal-primary"
            disabled={!entry}
            onClick={() => openDossier()}
          >
            <span>
              <Fingerprint size={18} />
              {entry ? "接入档案" : "正在载入"}
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button
            className={`terminal-square ${saved ? "is-saved" : ""}`}
            aria-label={`${saved ? "取消收藏" : "收藏"}${record.name}`}
            aria-pressed={saved}
            onClick={() => store.favorite(id)}
          >
            {saved ? <Check size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
        {error && (
          <button className="library-inline-retry" onClick={retry}>
            <RefreshCw size={13} />
            {error} · 重试
          </button>
        )}
        <div className="hero-caption">
          <span>PRTS / 本地资料</span>
          <span>档案 · 美术 · 关联记录</span>
        </div>
      </section>
      {mainArt.length > 1 && (
        <div className="art-switch interface-part library-art-switch">
          <label>
            VISUAL RECORD
            <select
              aria-label="主舞台图像版本"
              value={variantId ?? ""}
              onChange={(event) =>
                setVariantId(event.target.value || undefined)
              }
            >
              <option value="">主要视觉</option>
              {mainArt.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="stage-bottom interface-part">
        <div className="related-strip">
          <span className="related-strip-label">
            <Layers size={14} />
            <span>
              关联线索<small>CONNECTED RECORDS</small>
            </span>
          </span>
          {relations.slice(0, 3).map((relation) => (
            <button
              key={`${relation.target}-${relation.label}`}
              onClick={() => store.openEntry(relation.target)}
            >
              <span>{getLibrarySummary(relation.target)?.name}</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
          {relations.length > 3 && (
            <button
              onClick={() => openDossier("relations")}
              aria-label="查看所有关联档案"
            >
              +{relations.length - 3}
            </button>
          )}
          {!relations.length && (
            <button onClick={() => onSearch(record.kind)}>
              发现更多{kindName}
              <ArrowUpRight size={13} />
            </button>
          )}
        </div>
        <div className="record-pager">
          <button
            aria-label="上一篇档案"
            onClick={() => next(-1)}
            disabled={!siblings.length}
          >
            <ChevronLeft size={19} />
          </button>
          <span>
            {index >= 0 ? index + 1 : "—"}
            <small>
              {" "}
              / {library.status === "ready" ? siblings.length || 1 : "…"}
            </small>
          </span>
          <button
            aria-label="下一篇档案"
            onClick={() => next(1)}
            disabled={!siblings.length}
          >
            <ChevronRight size={19} />
          </button>
          <button
            className="pager-directory"
            onClick={() => onSearch(record.kind)}
          >
            全部{kindName}
            <ArrowDown size={13} />
          </button>
        </div>
      </div>
      <div className="stage-footer interface-part">
        <span>
          <i />
          LOCAL ARCHIVE / {library.manifest?.generatedAt.slice(0, 10) ?? "PRTS"}
        </span>
        <span>非官方资料库 · 逐条来源可在档案内查看</span>
      </div>
      {store.atlasSelected && (
        <button
          className="return-atlas interface-part"
          onClick={() => store.returnToAtlas()}
        >
          <ArrowLeft size={14} />
          返回地图探索
        </button>
      )}
      {reading && entry && (
        <LibraryDossier
          key={`dossier-${id}`}
          entry={entry}
          initialTab={tab}
          onClose={() => setReading(false)}
        />
      )}
    </main>
  );
}

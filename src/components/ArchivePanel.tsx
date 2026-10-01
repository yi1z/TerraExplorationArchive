import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  ExternalLink,
  GitCompareArrows,
  LockKeyhole,
  X,
  GripHorizontal,
  RotateCcw,
} from "lucide-react";
import {
  entryById,
  events,
  kindNames,
  sources,
  visibleSections,
  zoneNames,
} from "../data/archive";
import { useArchiveStore } from "../lib/state";
import Emblem from "./Emblem";
import GameArtwork from "./GameArtwork";
import AssetCredits from "./AssetCredits";
import EntryArtwork from "./EntryArtwork";
import LibraryArtwork from "./LibraryArtwork";
import { useLibraryEntry } from "../lib/library";
import { relatedRecords, relatedMapTarget } from "../lib/related-records";
import { useFloatingPanel } from "../lib/useFloatingPanel";
export default function ArchivePanel() {
  const {
    selected,
    preferences,
    close,
    select,
    openEntry,
    favorite,
    toggleCompare,
    compare,
    togglePreference,
    activeEvent,
  } = useArchiveStore();
  const { entry: libraryEntry } = useLibraryEntry(selected);
  const { panel, grip, reset } = useFloatingPanel();
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [selected, activeEvent]);
  useEffect(
    () => () => {
      const previous = previousFocus.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    },
    [],
  );
  if (!selected) return null;
  const entry = entryById[selected];
  if (
    !entry ||
    entry.kind === "operator" ||
    entry.kind === "enemy" ||
    entry.kind === "item"
  )
    return null;
  const event = events.find(
    (e) => e.id === activeEvent && (preferences.spoilers || !e.spoiler),
  );
  const saved = preferences.favorites.includes(entry.id);
  const sections = visibleSections(entry, preferences.spoilers);
  const relations = relatedRecords(entry, preferences.spoilers, libraryEntry);
  return (
    <aside
      ref={panel}
      data-reactive="light"
      className="archive-panel floating-dossier"
      aria-label="档案详情"
      data-testid="archive-panel"
    >
      <div className="panel-topbar">
        <button
          className="drag-grip"
          {...grip}
          aria-label="移动档案浮窗"
          title="拖动移动 · 双击复位 · 方向键微调"
        >
          <GripHorizontal size={16} />
          <span className="eyebrow">FIELD FILE / {kindNames[entry.kind]}</span>
        </button>
        <button
          className="icon-button panel-reset"
          onClick={reset}
          aria-label="复位档案浮窗"
        >
          <RotateCcw size={14} />
        </button>
        <button className="icon-button" onClick={close} aria-label="关闭档案">
          <X size={18} />
        </button>
      </div>
      <div
        className="panel-scroll"
        ref={body}
        key={selected + (activeEvent ?? "")}
      >
        <div className={"file-portrait " + entry.zone} data-reactive="tilt">
          <GameArtwork id={entry.id} />
          <div className="portrait-scrim" />
          <svg className="contours" viewBox="0 0 360 170" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <ellipse
                key={n}
                cx="270"
                cy="80"
                rx={40 + n * 19}
                ry={22 + n * 15}
                transform="rotate(-25 270 80)"
                fill="none"
                stroke="currentColor"
                strokeWidth=".7"
              />
            ))}
          </svg>
          <span className="portrait-index">
            {entry.zone ? zoneNames[entry.zone] : "泰拉"}
            <br />
            <small>FIELD RESEARCH</small>
          </span>
          <div className="portrait-emblem">
            <Emblem id={entry.id} />
          </div>
          <span className="portrait-corner">
            + / {entry.kind === "country" ? "CIVILIZATION" : "ARCHIVE"}
          </span>
        </div>
        <div className="file-heading">
          <span className="file-en">{entry.en}</span>
          <h2 ref={heading} tabIndex={-1}>
            {entry.name}
          </h2>
          <p>{entry.tagline}</p>
        </div>
        <div className="file-actions">
          <button
            className={saved ? "saved" : ""}
            onClick={() => favorite(entry.id)}
            aria-pressed={saved}
          >
            {saved ? <Check size={15} /> : <Bookmark size={15} />}
            <span>{saved ? "已收藏" : "收藏档案"}</span>
          </button>
          {entry.kind === "country" && (
            <button
              onClick={() => toggleCompare(entry.id)}
              aria-pressed={compare.includes(entry.id)}
            >
              <GitCompareArrows size={16} />
              <span>
                {compare.includes(entry.id) ? "移出对比" : "加入对比"}
              </span>
            </button>
          )}
        </div>
        {event && (
          <section className="panel-event">
            <span className="eyebrow">TERRA YEAR / {event.label}</span>
            <h3>{event.title}</h3>
            <p>{event.summary}</p>
            <a
              href={sources[event.source].url}
              target="_blank"
              rel="noreferrer"
            >
              事件出处 · {sources[event.source].publisher}
              <ArrowUpRight size={12} />
            </a>
          </section>
        )}
        <div className="file-summary">
          <span className="section-number">01 / OVERVIEW</span>
          <p>{entry.summary}</p>
        </div>
        <AssetCredits id={entry.id} />
        <dl className="file-facts">
          {entry.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="file-sections">
          {sections.map((section, i) => (
            <section key={section.title}>
              <span className="section-number">
                {String(i + 2).padStart(2, "0")} /{" "}
                {section.spoiler ? "STORY RECORD" : "FIELD NOTES"}
              </span>
              <h3>
                {section.title}
                {section.spoiler && <span className="spoiler-badge">剧透</span>}
              </h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
        {!preferences.spoilers && entry.sections.some((s) => s.spoiler) && (
          <button
            className="spoiler-unlock"
            onClick={() => togglePreference("spoilers")}
          >
            <LockKeyhole size={17} />
            <span>
              部分历史记录已折叠<small>开启全站剧透，继续阅读</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}
        <section className="related-section">
          <div className="section-label">
            <span className="section-number">CONTINUE EXPLORING</span>
            <span>关联档案 · {relations.length}</span>
          </div>
          {relations.map(({ target: id, label, record }) => (
            <button
              key={id}
              onClick={() => {
                const mapTarget = relatedMapTarget(record);
                if (mapTarget) select(mapTarget);
                else openEntry(id);
              }}
              data-record-kind={record.kind}
            >
              <span className="related-icon">
                {entryById[id] ? (
                  <EntryArtwork
                    entry={entryById[id]}
                    thumbnail
                    decorative
                    className="game-artwork"
                  />
                ) : (
                  <LibraryArtwork
                    entry={record}
                    thumbnail
                    decorative
                    className="game-artwork"
                  />
                )}
              </span>
              <span>
                {record.name}
                <small>
                  {label}
                  {record.en ? ` / ${record.en}` : ""}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </section>
        <section className="source-section">
          <h3>
            档案出处 <ExternalLink size={12} />
          </h3>
          {entry.sources
            .map((id) => sources[id])
            .filter(Boolean)
            .map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.title}
                <ArrowUpRight size={12} />
              </a>
            ))}
          <p>
            资料整理 / 2026.09.29
            <br />
            外部来源可能包含完整剧情与社区考据。
            <br />
            社区资料署名：PRTS Wiki 贡献者；改写摘要遵循 CC BY-NC-SA 4.0。
          </p>
        </section>
      </div>
    </aside>
  );
}

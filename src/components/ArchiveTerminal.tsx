import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Fingerprint,
  Globe2,
  Layers,
  LockKeyhole,
  ScanLine,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  entries,
  entryById,
  kindNames,
  sources,
  visibleSections,
} from "../data/archive";
import type { ArchiveEntry } from "../data/types";
import { useArchiveStore } from "../lib/state";
import { useLibrary } from "../lib/library";
import { mapPoint } from "../lib/map";
import DossierFrame, { DossierVisibilityContext } from "./DossierFrame";
import { useDossier } from "../lib/useDossier";
import { sectionForRecord, type DossierSection } from "../lib/dossier";
import { visualProfileFor } from "../data/visual-profiles";
import EntryArtwork, { artworkFor } from "./EntryArtwork";
import { catalogueAssetFor } from "../data/catalogue-assets";
import VisualScene from "./VisualScene";
import { LibraryGallery, LibrarySupplement } from "./LibraryDossier";

export function relatedRecords(entry: ArchiveEntry, spoilers: boolean) {
  const own = (
    entry.relationships ??
    entry.related.map((target) => ({ target, label: "关联档案" }))
  ).filter((r) => spoilers || !("spoiler" in r && r.spoiler));
  const incoming = entries
    .filter((e) => e.id !== entry.id)
    .flatMap((e) => {
      const relation = e.relationships?.find(
        (r) => r.target === entry.id && (spoilers || !r.spoiler),
      );
      return relation
        ? [
            {
              target: e.id,
              label:
                relation.label === "所属势力"
                  ? "所属干员 / 关联记录"
                  : "关联档案",
            },
          ]
        : !e.relationships && e.related.includes(entry.id)
          ? [{ target: e.id, label: "关联档案" }]
          : [];
    });
  return [
    ...new Map(
      [...own, ...incoming]
        .filter((r) => entryById[r.target] && r.target !== entry.id)
        .map((r) => [r.target, r]),
    ).values(),
  ];
}

function StatBlocks({ entry }: { entry: ArchiveEntry }) {
  const stats =
    entry.kind === "operator"
      ? entry.operator.stats
      : entry.kind === "enemy"
        ? entry.enemy.stats
        : undefined;
  return stats ? (
    <>
      <div className="stat-blocks">
        {(
          [
            ["HP", "生命", stats.hp],
            ["ATK", "攻击", stats.atk],
            ["DEF", "防御", stats.def],
            ["RES", "法抗", stats.res],
          ] as const
        ).map(([code, name, value]) => (
          <div key={code}>
            <span>
              {code}
              <small>{name}</small>
            </span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="stat-basis">{stats.basis}</p>
    </>
  ) : null;
}

export function DossierContent({
  entry,
  onClose,
  closing = false,
}: {
  entry: ArchiveEntry;
  onClose: () => void;
  closing?: boolean;
}) {
  const store = useArchiveStore();
  const tab = sectionForRecord(store.dossierSection, true);
  const relations = relatedRecords(entry, store.preferences.spoilers);
  const art = artworkFor(entry);
  const isGame = ["operator", "enemy", "item"].includes(entry.kind);
  const tabs: [DossierSection, string][] = [
    ["overview", "档案概览"],
    [
      "details",
      entry.kind === "item" ? "用途与合成" : isGame ? "战斗速览" : "大地见闻",
    ],
    ["complete", "详细资料"],
    ["gallery", "视觉资料"],
    ["relations", `关联记录 ${relations.length}`],
    ["sources", "资料出处"],
  ];
  const openRelated = (id: string) => {
    store.openEntry(id);
    onClose();
  };
  return (
    <DossierFrame
      name={entry.name}
      kind={kindNames[entry.kind]}
      tabs={tabs}
      section={tab}
      onClose={onClose}
      closing={closing}
    >
      {tab === "complete" && (
        <LibrarySupplement id={entry.id} onNavigate={onClose} />
      )}
      {tab === "gallery" && <LibraryGallery id={entry.id} name={entry.name} />}
      {tab === "overview" && (
        <>
          <span className="terminal-kicker">01 / IDENTITY RECORD</span>
          <h3 className="dossier-lead">{entry.tagline}</h3>
          <p className="dossier-summary">{entry.summary}</p>
          <dl className="identity-grid">
            {entry.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
          {visibleSections(entry, store.preferences.spoilers)
            .filter((section) => section.body.trim() !== entry.summary.trim())
            .map((s, i) => (
              <section className="record-section" key={s.title}>
                <span className="terminal-kicker">
                  RECORD / {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </section>
            ))}
          {!store.preferences.spoilers &&
            entry.sections.some((s) => s.spoiler) && (
              <button
                className="record-locked"
                onClick={() => store.togglePreference("spoilers")}
              >
                <LockKeyhole size={18} />
                <span>
                  部分剧情档案已折叠<small>开启全站剧透后继续阅读</small>
                </span>
                <ArrowRight size={18} />
              </button>
            )}
        </>
      )}
      {tab === "details" && (
        <>
          {entry.kind === "operator" ? (
            <>
              <span className="terminal-kicker">OPERATOR / COMBAT PROFILE</span>
              <h3 className="dossier-lead">
                {entry.operator.profession} · {entry.operator.branch}
              </h3>
              <StatBlocks entry={entry} />
              {entry.operator.stats && (
                <dl className="identity-grid">
                  <div>
                    <dt>部署费用</dt>
                    <dd>{entry.operator.stats.cost}</dd>
                  </div>
                  <div>
                    <dt>阻挡数</dt>
                    <dd>{entry.operator.stats.block}</dd>
                  </div>
                  <div>
                    <dt>再部署</dt>
                    <dd>{entry.operator.stats.redeploy} 秒</dd>
                  </div>
                </dl>
              )}
              <section className="record-section">
                <h3>特性</h3>
                <p>{entry.operator.trait}</p>
              </section>
              <section className="record-section">
                <h3>天赋记录</h3>
                {entry.operator.talents.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </section>
              <div className="skill-records">
                {entry.operator.skills.map((skill, i) => (
                  <article key={skill.name}>
                    <span className="skill-index">S{i + 1}</span>
                    <div>
                      <span className="terminal-kicker">SKILL RECORD</span>
                      <h3>{skill.name}</h3>
                      <p>{skill.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : entry.kind === "enemy" ? (
            <>
              <span className="terminal-kicker">
                HOSTILE / TACTICAL INTELLIGENCE
              </span>
              <h3 className="dossier-lead">
                {entry.enemy.code} · {entry.enemy.rank}
              </h3>
              <StatBlocks entry={entry} />
              <p className="record-note">
                通常数据仅供识别。实际属性可能随关卡、级别和能力变化，请以出处中的关卡情报为准。
              </p>
              <div className="skill-records">
                {entry.enemy.abilities.map((a, i) => (
                  <article key={a}>
                    <span className="skill-index">
                      <Shield size={20} />
                    </span>
                    <div>
                      <span className="terminal-kicker">ABILITY {i + 1}</span>
                      <p>{a}</p>
                    </div>
                  </article>
                ))}
              </div>
              {entry.enemy.stages?.map((s, i) => (
                <section className="record-section" key={s}>
                  <h3>阶段记录 {i + 1}</h3>
                  <p>{s}</p>
                </section>
              ))}
            </>
          ) : entry.kind === "item" ? (
            <>
              <span className="terminal-kicker">DEPOT / MATERIAL RECORD</span>
              <h3 className="dossier-lead">{entry.item.category}</h3>
              <section className="record-section">
                <h3>用途</h3>
                <p>{entry.item.usage}</p>
              </section>
              <section className="record-section">
                <h3>获取途径{entry.item.historical ? " · 历史活动" : ""}</h3>
                {entry.item.acquisition.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </section>
              {entry.item.recipe && (
                <section className="record-section">
                  <h3>加工配方</h3>
                  <div className="recipe-flow">
                    {entry.item.recipe.ingredients.map((i) => (
                      <div className="recipe-ingredient" key={i.name}>
                        <span>
                          {i.entryId && entryById[i.entryId] ? (
                            <button onClick={() => openRelated(i.entryId!)}>
                              {i.name}
                              <ArrowUpRight size={13} />
                            </button>
                          ) : i.url ? (
                            <a href={i.url} target="_blank" rel="noreferrer">
                              {i.name}
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            i.name
                          )}
                        </span>
                        <strong>× {i.quantity}</strong>
                      </div>
                    ))}
                    <ArrowRight size={22} />
                    <div className="recipe-output">
                      {entry.name}
                      <strong>× {entry.item.recipe.quantity}</strong>
                    </div>
                  </div>
                  <p className="stat-basis">
                    {entry.item.recipe.facility}
                    {entry.item.recipe.cost
                      ? ` · 龙门币 ${entry.item.recipe.cost}`
                      : ""}{" "}
                    · 不计概率副产物
                  </p>
                </section>
              )}
            </>
          ) : (
            <>
              {visibleSections(entry, store.preferences.spoilers)
                .filter(
                  (section) => section.body.trim() !== entry.summary.trim(),
                )
                .map((s) => (
                  <section className="record-section" key={s.title}>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </section>
                ))}
              {mapPoint(entry.id) && (
                <button
                  className="terminal-primary"
                  onClick={() => {
                    store.openAtlas(entry.id);
                    onClose();
                  }}
                >
                  在泰拉中探索 <Globe2 size={18} />
                </button>
              )}
            </>
          )}
          {entry.missingFacts?.length ? (
            <div className="record-note">
              <span>资料核验说明</span>
              {entry.missingFacts.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          ) : null}
        </>
      )}
      {tab === "relations" && (
        <>
          <span className="terminal-kicker">
            CONNECTED RECORDS / 沿着线索继续探索
          </span>
          <div className="related-records">
            {relations.map((r) => (
              <button key={r.target} onClick={() => openRelated(r.target)}>
                <div className={`related-art type-${entryById[r.target].kind}`}>
                  <EntryArtwork
                    entry={entryById[r.target]}
                    thumbnail
                    decorative
                  />
                </div>
                <span>
                  <small>{r.label}</small>
                  <strong>{entryById[r.target].name}</strong>
                  <em>{kindNames[entryById[r.target].kind]}</em>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          {!relations.length && (
            <p className="record-note">当前精选资料中暂无关联档案。</p>
          )}
        </>
      )}
      {tab === "sources" && (
        <>
          <span className="terminal-kicker">SOURCE / PROVENANCE</span>
          <h3 className="dossier-lead">每一份记录，都有来处。</h3>
          {entry.sources
            .map((id) => sources[id])
            .filter(Boolean)
            .map((s) => (
              <a
                className="source-record"
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {s.publisher} · 核验 {s.checkedAt}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </a>
            ))}
          {art && (
            <a
              className="source-record"
              href={art.source}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <strong>{art.name}</strong>
                <small>游戏美术 / 鹰角网络及关联权利人 · PRTS 托管</small>
              </span>
              <ArrowUpRight size={18} />
            </a>
          )}
          <p className="record-note">
            本站为非官方精选资料库。社区改写内容署名 PRTS Wiki 贡献者，遵循 CC
            BY-NC-SA
            4.0；游戏美术与文本原文的权利归原权利人。外部资料可能含完整剧情。
          </p>
        </>
      )}
    </DossierFrame>
  );
}

export default function ArchiveTerminal({
  onSearch,
  hidden,
}: {
  onSearch: (kind?: string) => void;
  hidden: boolean;
}) {
  const store = useArchiveStore();
  const library = useLibrary();
  const entry =
    (store.selected && entryById[store.selected]) ||
    entryById["operator-amiya"] ||
    entries[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const dossier = useDossier(entry.id, hidden);
  const profile = visualProfileFor(entry);
  useEffect(() => {
    if (store.selected && !store.dossierOpen)
      heading.current?.focus({ preventScroll: true });
  }, [entry.id, store.selected, store.dossierOpen]);
  const [elite, setElite] = useState(false);
  const openDossier = dossier.enter;
  const [lastId, setLastId] = useState(entry.id);
  if (lastId !== entry.id) {
    setLastId(entry.id);
    setElite(false);
  }
  const related = relatedRecords(entry, store.preferences.spoilers);
  const librarySiblings = library.summaries.filter(
    (e) =>
      e.kind === entry.kind &&
      ["released", "historical"].includes(e.releaseStatus),
  );
  const siblings = librarySiblings.some((e) => e.id === entry.id)
    ? librarySiblings
    : entries.filter((e) => e.kind === entry.kind);
  const index = siblings.findIndex((e) => e.id === entry.id);
  const next = (direction: number) =>
    store.openEntry(
      siblings[(index + direction + siblings.length) % siblings.length].id,
    );
  const facts =
    entry.kind === "operator"
      ? [
          { label: "职业 / CLASS", value: entry.operator.profession },
          { label: "分支 / BRANCH", value: entry.operator.branch },
          { label: "所属 / AFFILIATION", value: entry.operator.affiliation },
        ]
      : entry.kind === "enemy"
        ? [
            { label: "级别 / CLASS", value: entry.enemy.rank },
            { label: "行动 / MOVEMENT", value: entry.enemy.movement },
            { label: "攻击 / ATTACK", value: entry.enemy.attackType },
          ]
        : entry.kind === "item"
          ? [
              { label: "分类 / CATEGORY", value: entry.item.category },
              {
                label: "记录 / ARCHIVE",
                value: entry.item.historical ? "历史活动" : "常规物资",
              },
            ]
          : entry.facts.slice(0, 3);
  const saved = store.preferences.favorites.includes(entry.id);
  const englishKind =
    entry.kind === "operator"
      ? "OPERATOR"
      : entry.kind === "enemy"
        ? "HOSTILE"
        : entry.kind === "item"
          ? "DEPOT"
          : "TERRA";
  return (
    <main
      ref={dossier.stage}
      id="terminal-main"
      tabIndex={-1}
      className={`archive-terminal scene-${entry.kind} dossier-theme-${profile?.theme ?? "default"} ${hidden ? "interface-hidden" : ""}`}
      data-dossier-phase={dossier.phase}
      style={
        profile
          ? ({
              "--dossier-accent": profile.accent,
              "--dossier-secondary": profile.secondary,
            } as CSSProperties)
          : undefined
      }
      aria-label={`${entry.name}档案主舞台`}
    >
      <div className="dossier-focus-scrim" aria-hidden="true" />
      <VisualScene
        entry={entry}
        reading={dossier.reading}
        reducedMotion={store.preferences.reducedMotion}
      />
      <div className="stage-grid" aria-hidden="true" />
      <div className="stage-orbit" aria-hidden="true" />
      <div className="stage-coordinate" aria-hidden="true">
        TERRA / {englishKind} DATABASE
        <br />
        RECORDS CONNECT THE WORLD
      </div>
      <div
        className="stage-artwork"
        data-reactive={dossier.reading ? undefined : "tilt"}
        key={`art-${entry.id}-${elite}`}
      >
        <div className="artwork-shadow">
          <EntryArtwork entry={entry} elite={elite} decorative />
        </div>
        <div className="artwork-main">
          <EntryArtwork entry={entry} elite={elite} />
        </div>
        <div className="artwork-ground" aria-hidden="true" />
      </div>
      <div
        className="hero-wordmark"
        aria-hidden="true"
        key={`word-${entry.id}`}
      >
        {entry.en}
      </div>
      <div className="subject-reticle interface-part" aria-hidden="true">
        <ScanLine size={19} />
        <span>
          VISUAL RECORD
          <br />
          <b>{String(index + 1).padStart(3, "0")}</b>
        </span>
      </div>
      <section
        className={`hero-copy interface-part ${entry.name.length > 6 ? "long-name" : ""}`}
        key={entry.id}
      >
        <div className="hero-eyebrow">
          <span className="signal-dot" />
          <span>{englishKind} ARCHIVE</span>
          <i />
          <span>
            {String(index + 1).padStart(3, "0")} /{" "}
            {String(siblings.length).padStart(3, "0")}
          </span>
        </div>
        <div className="hero-category">
          {kindNames[entry.kind]}
          <span>
            {entry.kind === "operator"
              ? "★".repeat(entry.operator.rarity)
              : entry.kind === "enemy"
                ? entry.enemy.code
                : "FIELD RECORD"}
          </span>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {entry.name}
        </h1>
        <div className="hero-english">{entry.en}</div>
        <p className="hero-tagline">{entry.tagline}</p>
        <p className="hero-summary">{entry.summary}</p>
        <dl className="hero-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="hero-actions">
          <button
            className="terminal-primary"
            data-dossier-trigger
            onClick={() => openDossier()}
          >
            <span>
              <Fingerprint size={18} />
              接入档案
            </span>
            <ArrowUpRight size={19} />
          </button>
          <button
            className={`terminal-square ${saved ? "is-saved" : ""}`}
            aria-label={`${saved ? "取消收藏" : "收藏"}${entry.name}`}
            aria-pressed={saved}
            onClick={() => store.favorite(entry.id)}
          >
            {saved ? <Check size={18} /> : <Bookmark size={18} />}
          </button>
          {mapPoint(entry.id) && (
            <button
              className="terminal-square"
              aria-label="在泰拉中探索"
              title="在泰拉中探索"
              onClick={() => store.openAtlas(entry.id)}
            >
              <Globe2 size={20} />
            </button>
          )}
        </div>
        <div className="hero-caption">
          <span>PRTS / 资料快照</span>
          <span>
            世界观 · {entry.kind === "item" ? "物资" : "档案"} · 关联记录
          </span>
        </div>
      </section>
      <div className="art-switch interface-part">
        {entry.kind === "operator" && catalogueAssetFor(entry.id, "elite") && (
          <>
            <span>ILLUSTRATION</span>
            <button
              aria-pressed={!elite}
              className={!elite ? "active" : ""}
              onClick={() => setElite(false)}
            >
              初始
            </button>
            <button
              aria-pressed={elite}
              className={elite ? "active" : ""}
              onClick={() => setElite(true)}
            >
              <Sparkles size={12} />
              精英化
            </button>
          </>
        )}
        <button
          className="art-expand"
          aria-label="打开资料详情"
          onClick={() => openDossier()}
        >
          <Crosshair size={16} />
        </button>
      </div>
      <div className="stage-side-label interface-part" aria-hidden="true">
        {englishKind} / DATABASE — TERRA EXPLORATION
      </div>
      <div className="stage-bottom interface-part">
        <div className="related-strip">
          <span className="related-strip-label">
            <Layers size={14} />
            <span>
              关联线索<small>CONNECTED RECORDS</small>
            </span>
          </span>
          {related.slice(0, 3).map((r) => (
            <button key={r.target} onClick={() => store.openEntry(r.target)}>
              <span>{entryById[r.target].name}</span>
              <ArrowUpRight size={13} />
            </button>
          ))}
          {related.length > 3 && (
            <button
              aria-label="查看所有关联档案"
              onClick={() => openDossier("relations")}
            >
              +{related.length - 3}
            </button>
          )}
        </div>
        <div className="record-pager">
          <button aria-label="上一篇档案" onClick={() => next(-1)}>
            <ChevronLeft size={19} />
          </button>
          <span>
            {String(index + 1).padStart(2, "0")}
            <small> / {siblings.length}</small>
          </span>
          <button aria-label="下一篇档案" onClick={() => next(1)}>
            <ChevronRight size={19} />
          </button>
          <button
            className="pager-directory"
            onClick={() => onSearch(entry.kind)}
          >
            全部{kindNames[entry.kind]}
            <ArrowDown size={13} />
          </button>
        </div>
      </div>
      <div className="stage-footer interface-part">
        <span>
          <i /> ARCHIVE CONNECTION ESTABLISHED
        </span>
        <span>非官方资料库 · 资料来自 PRTS 与游戏官方</span>
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
      {dossier.visible && (
        <DossierVisibilityContext.Provider value={hidden}>
          <DossierContent
            key={`dossier-${entry.id}`}
            entry={entry}
            closing={dossier.phase === "returning"}
            onClose={dossier.close}
          />
        </DossierVisibilityContext.Provider>
      )}
    </main>
  );
}

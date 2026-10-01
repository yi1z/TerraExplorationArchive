import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  History,
  Layers3,
  LockKeyhole,
  Minus,
  MousePointer2,
  Navigation,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { entryById, events, visibleEvents } from "./data/archive";
import type { Layers } from "./data/types";
import { tour } from "./data/geography";
import { useArchiveStore } from "./lib/state";
import { tone } from "./lib/audio";
import { formatIndex } from "./lib/map";
import { MOTION } from "./lib/motion";
import { useReducedMotion } from "./lib/useMotion";
import Emblem from "./components/Emblem";
import ArchivePanel from "./components/ArchivePanel";
import Dialog from "./components/Dialog";
import Map2D from "./components/Map2D";
import FloatingHUD from "./components/FloatingHUD";
const TerraScene = lazy(() => import("./components/TerraScene"));

function useMedia(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
function CompareDialog() {
  const { compare, setCompareOpen, toggleCompare, select } = useArchiveStore();
  return (
    <Dialog title="并置两片大地" wide onClose={() => setCompareOpen(false)}>
      <p className="dialog-intro">
        从地域特征到社会文化，在同一页里发现相似与不同。
      </p>
      <div className="comparison-grid">
        {compare.map((id) => {
          const e = entryById[id];
          return (
            <article key={id}>
              <div className="comparison-symbol">
                <Emblem id={id} />
                <button
                  className="icon-button"
                  aria-label={"移除对比" + e.name}
                  onClick={() => toggleCompare(id)}
                >
                  <X size={16} />
                </button>
              </div>
              <span className="eyebrow">{e.en}</span>
              <h3>{e.name}</h3>
              <p>{e.summary}</p>
              <dl>
                {e.facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              {e.sections
                .filter((s) => !s.spoiler)
                .map((s) => (
                  <section key={s.title}>
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                  </section>
                ))}
              <button
                className="text-button"
                onClick={() => {
                  setCompareOpen(false);
                  select(id);
                }}
              >
                在地图中查看 <ArrowUpRight size={16} />
              </button>
            </article>
          );
        })}
        {compare.length < 2 && (
          <div className="comparison-empty">
            <Plus size={28} />
            <h3>再选择一片疆域</h3>
            <p>在国家档案中点击“加入对比”。</p>
            <button
              className="outline-button"
              onClick={() => setCompareOpen(false)}
            >
              返回探索
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
export default function AtlasWorkspace({ onSearch }: { onSearch: () => void }) {
  const store = useArchiveStore();
  const {
    selected,
    layers,
    preferences,
    select,
    toggleLayer,
    togglePreference,
    compare,
    compareOpen,
    tourIndex,
    tourPlaying,
    activeEvent,
  } = store;
  const reduced = useReducedMotion();
  const mobile = useMedia("(max-width: 899px)");
  const [manualFlat, setManualFlat] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const selectedEntry = selected ? entryById[selected] : null;
  const event = events.find(
    (e) => e.id === activeEvent && (preferences.spoilers || !e.spoiler),
  );
  const open = (id: string) => {
    tone(preferences.sound);
    select(id);
  };
  useEffect(() => {
    if (!tourPlaying || tourIndex < 0) return;
    const timer = window.setTimeout(() => {
      const current = useArchiveStore.getState();
      if (document.hidden) {
        current.pauseTour();
        return;
      }
      if (current.tourIndex === tour.length - 1) {
        current.pauseTour();
        useArchiveStore.setState({
          notice: "六站初探已完成。接下来，选择你自己的方向。",
        });
      } else current.tourStep(1);
    }, MOTION.tour * 1000);
    return () => window.clearTimeout(timer);
  }, [tourPlaying, tourIndex]);
  useEffect(() => {
    if (reduced) store.finishIntro();
  }, [reduced, store.introPlaying, store.finishIntro]);
  return (
    <div
      className={
        "app floating-ui view-atlas " +
        (reduced ? "reduce-motion " : "") +
        (selected ? "has-selection" : "")
      }
    >
      <div className="workspace">
        <main id="atlas-main" className="main atlas-main" tabIndex={-1}>
          <section
            className="map-stage"
            aria-label="泰拉交互地图"
            data-testid="map-stage"
            data-motion={
              reduced ? "reduced" : store.introPlaying ? "intro" : "ready"
            }
          >
            <FloatingHUD openIndex={onSearch} />
            <div
              key={String(selected) + store.introSequence}
              className={"map-heading " + (selectedEntry ? "compact" : "")}
            >
              <span className="eyebrow">
                <span className="tiny-square" /> TERRA / FIELD OBSERVATION
              </span>
              <h1>
                {selectedEntry ? (
                  <>
                    {selectedEntry.en}
                    <span>{selectedEntry.name}</span>
                  </>
                ) : (
                  <>
                    TERRA
                    <br />
                    EXPLORATION<span className="title-period">.</span>
                  </>
                )}
              </h1>
              <p>
                {selectedEntry
                  ? selectedEntry.tagline
                  : "从一座城市，走进一片文明。"}
              </p>
            </div>
            <div className="map-edition">
              <span>FIELD ATLAS</span>
              <strong>
                01<span>/ 03</span>
              </strong>
              <small>大地 · 城市 · 文明</small>
            </div>
            <div className="map-canvas" data-testid="map-canvas">
              {mobile || manualFlat ? (
                <Map2D />
              ) : (
                <Suspense
                  fallback={
                    <div className="scene-loading">
                      <span />
                      正在展开泰拉地图<small>PREPARING THE ATLAS</small>
                    </div>
                  }
                >
                  <TerraScene />
                </Suspense>
              )}
            </div>
            <div className="map-watermark" aria-hidden="true">
              TERRA / KNOWN WORLD
            </div>
            <div
              className="survey-sweep"
              key={store.introSequence}
              aria-hidden="true"
            />
            <div className="map-topline">
              <span>
                {store.introPlaying
                  ? "SURVEYING TERRA / 地图展开中"
                  : "MAP REV. 01"}
              </span>
              <span>+ &nbsp; SCHEMATIC PROJECTION &nbsp; +</span>
            </div>
            <div className="map-controls">
              <button
                className="icon-button replay-map"
                disabled={reduced}
                aria-label={
                  store.introPlaying ? "跳过地图展开" : "重播地图展开"
                }
                title={
                  reduced
                    ? "减少动态效果已开启"
                    : store.introPlaying
                      ? "跳过地图展开"
                      : "重播地图展开"
                }
                onClick={() =>
                  store.introPlaying ? store.finishIntro() : store.replayIntro()
                }
              >
                {store.introPlaying ? <X size={17} /> : <Play size={17} />}
              </button>
              {!mobile && !manualFlat && (
                <>
                  <button
                    className="icon-button"
                    aria-label="放大地图"
                    onClick={() => store.camera("in")}
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="缩小地图"
                    onClick={() => store.camera("out")}
                  >
                    <Minus size={18} />
                  </button>
                  <span className="control-separator" />
                  <button
                    className="icon-button"
                    aria-label="复位地图视角"
                    onClick={() => store.camera("reset")}
                  >
                    <RotateCcw size={17} />
                  </button>
                </>
              )}
              {!mobile && (
                <button
                  className="mode-button"
                  onClick={() => setManualFlat(!manualFlat)}
                  aria-label={manualFlat ? "切换到三维地图" : "切换到轻量地图"}
                >
                  {manualFlat ? "2D" : "3D"}
                </button>
              )}
            </div>
            <div className="compass-control">
              <button
                aria-label="地图朝北"
                disabled={mobile || manualFlat}
                onClick={() => store.camera("north")}
              >
                <span>N</span>
                <Navigation size={29} strokeWidth={1.15} />
                <small>+</small>
              </button>
            </div>
            {!selected && !event && (
              <div className="explore-prompt">
                <span className="prompt-arrow">
                  <ArrowUpRight size={26} strokeWidth={1.3} />
                </span>
                <div>
                  <strong>从哪里开始？</strong>
                  <p>
                    选择地图上的名字，
                    <br />
                    或跟随我们，初探泰拉。
                  </p>
                  <button onClick={() => store.startTour()}>
                    开启六站导览 <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
            {event && (
              <article className="event-peek">
                <button
                  className="icon-button"
                  aria-label="关闭事件预览"
                  onClick={() =>
                    useArchiveStore.setState({ activeEvent: null })
                  }
                >
                  <X size={15} />
                </button>
                <span className="eyebrow">TERRA YEAR / {event.label}</span>
                <h3>{event.title}</h3>
                <p>{event.summary}</p>
                <div>
                  {event.related.map((id) => (
                    <button key={id} onClick={() => open(id)}>
                      {entryById[id].name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
              </article>
            )}
            <div className="map-bottomline">
              <span>
                <MousePointer2 size={12} />
                {mobile || manualFlat
                  ? "轻触地区以打开档案"
                  : "拖动旋转 · 滚轮缩放 · 右键平移"}
              </span>
              <span>疆域与高度为示意 · 城市点位非实时</span>
            </div>
            <div className="layer-bar">
              <span>
                <Layers3 size={15} />
                <b>地图图层</b>
              </span>
              {(
                [
                  ["countries", "疆域"],
                  ["cities", "城市"],
                  ["relations", "关联"],
                ] as [keyof Layers, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={layers[key]}
                  onClick={() => toggleLayer(key)}
                >
                  <i className={layers[key] ? "checked" : ""}>
                    {layers[key] && <Check size={10} />}
                  </i>
                  {label}
                </button>
              ))}
              <span className="layer-divider" />
              <button
                className="timeline-trigger"
                onClick={() => {
                  store.pauseTour();
                  setTimelineOpen(true);
                }}
              >
                <History size={14} />
                事件轴
                <ChevronRight size={13} />
              </button>
            </div>
          </section>
          {selected && <ArchivePanel />}
        </main>
      </div>
      <footer className="journey-bar">
        {tourPlaying && (
          <div key={tourIndex} className="journey-progress" aria-hidden="true">
            <span />
          </div>
        )}
        <div className="journey-title">
          <span className="eyebrow">
            {tourIndex >= 0
              ? "CHAPTER " + formatIndex(tourIndex) + " / 06"
              : "A GUIDED JOURNEY"}
          </span>
          <strong>
            初探泰拉<span> / 六段大地见闻</span>
          </strong>
        </div>
        <div className="journey-stops">
          {tour.map((id, i) => (
            <button
              className={
                (tourIndex === i ? "tour-active " : "") +
                (selected === id ? "stop-selected" : "")
              }
              key={id}
              onClick={() => {
                useArchiveStore.setState({ tourIndex: i, tourPlaying: false });
                select(id, true);
              }}
              aria-label={"导览站点" + entryById[id].name}
            >
              <span>{formatIndex(i)}</span>
              <i />
              {entryById[id].name}
            </button>
          ))}
        </div>
        <div className="journey-controls">
          {tourIndex >= 0 && (
            <>
              <button
                className="journey-step"
                aria-label="上一站"
                disabled={tourIndex === 0}
                onClick={() => store.tourStep(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="journey-step"
                aria-label="下一站"
                disabled={tourIndex === tour.length - 1}
                onClick={() => store.tourStep(1)}
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <button
            className="journey-play"
            onClick={() =>
              tourPlaying ? store.pauseTour() : store.resumeTour()
            }
            aria-label={tourPlaying ? "暂停导览" : "开始导览"}
          >
            {tourPlaying ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            <span>
              {tourPlaying ? "暂停" : tourIndex >= 0 ? "继续导览" : "开始导览"}
            </span>
          </button>
          {tourIndex >= 0 && (
            <button
              className="journey-step"
              aria-label="退出导览"
              onClick={() => store.stopTour()}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </footer>
      {compare.length > 0 && (
        <div className="compare-tray">
          <GitCompareArrows size={16} />
          <span>{compare.map((id) => entryById[id].name).join(" / ")}</span>
          <button onClick={() => store.setCompareOpen(true)}>
            地区对比 <b>{compare.length}/2</b>
            <ArrowRight size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="清空对比"
            onClick={() => compare.forEach((id) => store.toggleCompare(id))}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {compareOpen && <CompareDialog />}
      {timelineOpen && (
        <Dialog title="泰拉事件轴" wide onClose={() => setTimelineOpen(false)}>
          <p className="dialog-intro">
            让时间成为另一条探索路径。以下是精选事件，年份以来源记述为准，不代表完整年表。
          </p>
          <div className="timeline-list">
            {visibleEvents(preferences.spoilers).map((ev) => (
              <button
                key={ev.id}
                onClick={() => {
                  store.setEvent(ev.id);
                  setTimelineOpen(false);
                }}
              >
                <span className="event-year">{ev.label}</span>
                <span className="event-dot" />
                <span>
                  <strong>
                    {ev.title}
                    {ev.spoiler && (
                      <small className="spoiler-badge">剧透</small>
                    )}
                  </strong>
                  <p>{ev.summary}</p>
                </span>
                <ArrowUpRight size={19} />
              </button>
            ))}
          </div>
          {!preferences.spoilers && (
            <button
              className="timeline-locked"
              onClick={() => togglePreference("spoilers")}
            >
              <LockKeyhole size={16} />
              还有 {events.filter((e) => e.spoiler).length} 条剧情记录已折叠 ·
              开启剧透显示
            </button>
          )}
        </Dialog>
      )}
    </div>
  );
}

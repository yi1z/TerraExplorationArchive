import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  AudioLines,
  Bookmark,
  Check,
  ChevronUp,
  Eye,
  EyeOff,
  Globe2,
  Hexagon,
  Info,
  Layers,
  Search,
  Settings2,
  Shield,
  Users,
  X,
  Package,
  Radio,
  VolumeX,
  MapPinned,
  BookOpen,
  CalendarDays,
  Component,
  Shirt,
  Armchair,
  PanelsTopLeft,
  Gamepad2,
  Wrench,
} from "lucide-react";
import { entries, entryById } from "./data/archive";
import { gameAssets } from "./data/assets";
import { useArchiveStore } from "./lib/state";
import { useReducedMotion } from "./lib/useMotion";
import { usePointerEffects } from "./lib/usePointerEffects";
import {
  closeAudio,
  tone,
  configureUiSound,
  previewUiSound,
} from "./lib/audio";
import { useLibrary } from "./lib/library";
import ArchiveTerminal from "./components/ArchiveTerminal";
import ArchiveSearch, { catalogueCategories } from "./components/ArchiveSearch";
import type { SearchScope } from "./lib/search-state";
import HomePage from "./components/HomePage";
import Dialog from "./components/Dialog";
import LibraryCoverage from "./components/LibraryCoverage";
const AtlasWorkspace = lazy(() => import("./AtlasWorkspace"));
const LibraryTerminal = lazy(() => import("./components/LibraryTerminal"));
const categoryIcons = [
  Users,
  Shield,
  Package,
  Globe2,
  MapPinned,
  BookOpen,
  CalendarDays,
  Component,
  Shirt,
  Armchair,
  PanelsTopLeft,
  Gamepad2,
  Wrench,
];

export default function App() {
  const store = useArchiveStore();
  const ref = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const library = useLibrary(store.view !== "home" || aboutOpen);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hidden, setHidden] = useState(false);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const focusBeforeHide = useRef<HTMLElement | null>(null);
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const reduced = useReducedMotion();
  const atlas = store.view === "atlas";
  usePointerEffects(ref);
  useEffect(() => {
    void useArchiveStore.getState().hydratePreferences();
  }, []);
  const openSearch = (kind?: string, nextScope?: SearchScope) => {
    store.openSearch(kind, nextScope);
    setCategoriesOpen(false);
    setHidden(false);
    tone(store.preferences.sound);
  };
  useEffect(() => {
    const onRoute = () =>
      useArchiveStore.getState().navigate(window.location.hash);
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("popstate", onRoute);
    onRoute();
    return () => {
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("popstate", onRoute);
    };
  }, []);
  useEffect(() => {
    if (store.view === "about") setAboutOpen(true);
  }, [store.view]);
  useEffect(() => {
    setHidden(false);
    setCategoriesOpen(false);
    if (store.view !== "search")
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [store.selected, store.view]);
  useEffect(() => {
    if (hidden) {
      focusBeforeHide.current = document.activeElement as HTMLElement | null;
      restoreButton.current?.focus({ preventScroll: true });
    } else if (focusBeforeHide.current?.isConnected) {
      focusBeforeHide.current.focus({ preventScroll: true });
      focusBeforeHide.current = null;
    }
  }, [hidden]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const editable =
        event.target instanceof HTMLElement &&
        (event.target.matches("input,textarea,select") ||
          event.target.isContentEditable);
      if (
        (event.key === "/" && !editable) ||
        (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))
      ) {
        event.preventDefault();
        useArchiveStore.getState().openSearch();
        setHidden(false);
      }
      if (
        event.key.toLowerCase() === "h" &&
        !editable &&
        !document.querySelector("dialog[open]")
      )
        setHidden((v) => !v);
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        if (hidden) setHidden(false);
        else if (categoriesOpen) setCategoriesOpen(false);
        else if (atlas) store.close();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hidden, categoriesOpen, atlas, store.close]);
  useEffect(() => {
    const update = () => {
      setPageHidden(document.hidden);
      if (document.hidden) useArchiveStore.getState().pauseTour();
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    configureUiSound({
      enabled: store.preferences.sound,
      volume: store.preferences.soundVolume,
    });
  }, [store.preferences.sound, store.preferences.soundVolume]);
  useEffect(() => () => closeAudio(), []);
  useEffect(() => {
    if (!store.notice) return;
    const timer = setTimeout(
      () => useArchiveStore.getState().clearNotice(),
      4200,
    );
    return () => clearTimeout(timer);
  }, [store.notice]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const closeAbout = () => {
    setAboutOpen(false);
    if (store.view === "about") store.setView("home");
  };
  const leaveLauncher = () => {
    clearTimeout(closeTimer.current);
    if (!pinned)
      closeTimer.current = setTimeout(() => {
        if (!launcher.current?.contains(document.activeElement))
          setCategoriesOpen(false);
      }, 700);
  };
  return (
    <div
      ref={ref}
      className={`database-app view-${store.view} ${atlas ? "theme-atlas" : "theme-terminal"} ${reduced ? "reduce-motion" : ""} ${pageHidden ? "motion-paused" : ""} ${hidden ? "ui-hidden" : ""}`}
    >
      <a
        className="skip-link"
        href="#terminal-main"
        onClick={(e) => {
          e.preventDefault();
          document
            .getElementById(
              atlas
                ? "main-content"
                : store.view === "home"
                  ? "home-main"
                  : store.view === "search"
                    ? "search-main"
                    : "terminal-main",
            )
            ?.focus();
        }}
      >
        跳至主要内容
      </a>
      <header className="terminal-header interface-part">
        <button
          className="terminal-brand"
          aria-label="泰拉档案首页"
          onClick={() => store.setView("home")}
        >
          <span className="brand-glyph">
            <i />
            <i />
            <i />
          </span>
          <span>
            TERRA<small>EXPLORATION ARCHIVE</small>
          </span>
        </button>
        <div className="terminal-header-caption">
          <span>泰拉探索档案</span>
          <small>AN UNOFFICIAL ARKNIGHTS DATABASE</small>
        </div>
        <div className="terminal-header-actions">
          <button
            className="header-search"
            onClick={() => openSearch()}
            aria-label="检索档案"
          >
            <Search size={17} />
            <span>检索档案</span>
            <kbd>/</kbd>
          </button>
          <button
            className="terminal-icon"
            onClick={() => openSearch("all", "favorites")}
            aria-label="我的收藏"
            title="我的收藏"
          >
            <Bookmark size={17} />
          </button>
          <span className="header-divider" />
          <button
            className="terminal-icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="阅读偏好设置"
            title="阅读偏好设置"
          >
            <Settings2 size={18} />
          </button>
          <button
            className="terminal-icon"
            onClick={() => setHidden(true)}
            aria-label="隐藏界面"
            title="隐藏界面 · H"
          >
            <EyeOff size={18} />
          </button>
        </div>
      </header>
      {store.view === "home" || store.view === "about" ? (
        <HomePage />
      ) : store.view === "search" ? (
        <ArchiveSearch hidden={hidden} />
      ) : atlas ? (
        <div className="atlas-shell">
          <Suspense
            fallback={
              <div className="terminal-loading">
                <Globe2 size={32} />
                <span>正在展开泰拉地图</span>
              </div>
            }
          >
            <AtlasWorkspace onSearch={() => openSearch("world")} />
          </Suspense>
        </div>
      ) : store.selected && !entryById[store.selected] ? (
        <Suspense
          fallback={<div className="terminal-loading">正在接入资料库</div>}
        >
          <LibraryTerminal
            id={store.selected}
            onSearch={openSearch}
            hidden={hidden}
          />
        </Suspense>
      ) : (
        <ArchiveTerminal onSearch={openSearch} hidden={hidden} />
      )}
      {store.view === "archive" && !store.dossierOpen && (
        <button
          className="return-search interface-part"
          onClick={() => store.returnToSearch()}
        >
          <ArrowLeft size={14} /> 返回检索
        </button>
      )}
      {store.view !== "home" && store.view !== "search" && (
        <div
          ref={launcher}
          className={`archive-launcher interface-part ${categoriesOpen ? "expanded" : ""}`}
          onMouseEnter={() => clearTimeout(closeTimer.current)}
          onMouseLeave={leaveLauncher}
          onBlur={leaveLauncher}
        >
          {categoriesOpen && (
            <div className="category-popover">
              <div className="category-popover-head">
                <span>选择一条探索路径</span>
                <button
                  aria-pressed={pinned}
                  onClick={() => setPinned(!pinned)}
                >
                  {pinned ? "取消固定" : "固定展开"}
                </button>
              </div>
              <div className="category-portals">
                {catalogueCategories.map((category, i) => {
                  const Icon = categoryIcons[i] ?? Layers;
                  return (
                    <button
                      key={category.id}
                      onClick={() => openSearch(category.id)}
                    >
                      <span className="portal-number">{category.number}</span>
                      <Icon size={26} strokeWidth={1.3} />
                      <strong>{category.name}</strong>
                      <small>{category.en}</small>
                      <ArrowUpRight size={14} />
                    </button>
                  );
                })}
              </div>
              <button
                className="category-about"
                onClick={() => {
                  setAboutOpen(true);
                  setCategoriesOpen(false);
                }}
              >
                <Info size={13} />
                资料来源与项目说明
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
          <button
            className="archive-beacon"
            aria-expanded={categoriesOpen}
            onClick={() => setCategoriesOpen(!categoriesOpen)}
          >
            <span className="beacon-symbol">
              {categoriesOpen ? (
                <X size={21} />
              ) : (
                <Hexagon size={23} strokeWidth={1.4} />
              )}
            </span>
            <span>
              档案目录<small>ACCESS THE ARCHIVES</small>
            </span>
            <ChevronUp size={14} className={categoriesOpen ? "turned" : ""} />
          </button>
        </div>
      )}
      {hidden && (
        <button
          ref={restoreButton}
          className="restore-interface"
          onClick={() => setHidden(false)}
        >
          <Eye size={17} />
          恢复界面 <kbd>ESC</kbd>
        </button>
      )}
      {settingsOpen && (
        <Dialog title="阅读偏好" onClose={() => setSettingsOpen(false)}>
          <div className="terminal-settings">
            {(
              [
                {
                  key: "spoilers",
                  name: "显示剧情剧透",
                  description: "同时影响正文、检索和关联预览。",
                  icon: Shield,
                },
                {
                  key: "reducedMotion",
                  name: "减少动态效果",
                  description: "关闭视差与装饰动画，直接切换场景。",
                  icon: Eye,
                },
                {
                  key: "sound",
                  name: "界面提示音",
                  description: "使用明日方舟战斗界面采样，默认关闭。",
                  icon: AudioLines,
                },
              ] as const
            ).map((setting) => {
              const Icon = setting.icon;
              return (
                <label key={setting.key}>
                  <Icon size={20} />
                  <span>
                    <strong>{setting.name}</strong>
                    <small>{setting.description}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={store.preferences[setting.key]}
                    onChange={() => store.togglePreference(setting.key)}
                  />
                </label>
              );
            })}
            <div className="sound-controls">
              <label htmlFor="sound-volume">
                提示音量{" "}
                <output>
                  {Math.round(store.preferences.soundVolume * 100)}%
                </output>
              </label>
              <input
                id="sound-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={store.preferences.soundVolume}
                onChange={(event) =>
                  store.setSoundVolume(Number(event.target.value))
                }
              />
              <button
                onClick={() =>
                  previewUiSound("confirm", store.preferences.soundVolume)
                }
              >
                <AudioLines size={16} /> 试听音效
              </button>
              <small>试听仅播放一次；开关关闭时，其他操作保持静音。</small>
            </div>
            <button
              className="reset-history"
              onClick={() => store.resetProgress()}
            >
              重置阅读足迹<span>保留收藏</span>
            </button>
            <p>快捷键：/ 或 Ctrl / ⌘ K 检索 · H 显隐界面 · Esc 返回</p>
            <button
              className="settings-about"
              onClick={() => {
                setSettingsOpen(false);
                setAboutOpen(true);
              }}
            >
              资料来源与项目说明 <ArrowUpRight size={14} />
            </button>
          </div>
        </Dialog>
      )}
      {aboutOpen && (
        <Dialog title="关于泰拉探索档案" wide onClose={closeAbout}>
          <div className="terminal-about">
            <span className="terminal-kicker">
              TERRA EXPLORATION / FIELD ARCHIVE
            </span>
            <h3>每个名字，都是一段故事。</h3>
            <p>
              这是一个以《明日方舟》世界观为内容的非官方交互资料库。用人物、物品与地域之间的联系，重新认识这片大地。
            </p>
            <div className="about-counts">
              <div>
                <strong>{library.summaries.length.toLocaleString()}</strong>
                <span>可检索档案</span>
              </div>
              <div>
                <strong>
                  {entries.filter((e) => e.kind === "country").length}
                </strong>
                <span>国家与文明</span>
              </div>
              <div>
                <strong>{gameAssets.length}</strong>
                <span>地图视觉资料</span>
              </div>
            </div>
            <p>
              资料与美术参考 PRTS Wiki 和游戏官方。社区资料经摘要改写，署名 PRTS
              Wiki 贡献者并按 CC BY-NC-SA 4.0
              提供；游戏图像、原文与商标属于鹰角网络及关联权利人。逐条出处可在档案内查看。
            </p>
            <p>
              地图为导航示意，不代表精确疆域、实际海拔或城市实时位置。资料来自固定版本快照，来源版本及核验状态可在档案内查看。
            </p>
            {library.manifest && (
              <div className="library-snapshot-note">
                <span>
                  资料快照 · {library.manifest.generatedAt.slice(0, 10)}
                </span>
                <strong>
                  {library.manifest.status === "complete"
                    ? "本次收录范围已整理完成"
                    : "资料仍有待核验项目"}
                </strong>
                <LibraryCoverage manifest={library.manifest} />
              </div>
            )}
            <p>
              收藏和阅读偏好只保存在当前浏览器。网站无需登录，不包含追踪或远程写入。
            </p>
            <div className="about-links">
              <a href="https://prts.wiki/" target="_blank" rel="noreferrer">
                PRTS Wiki <ArrowUpRight size={14} />
              </a>
              <a
                href="https://ak.hypergryph.com/"
                target="_blank"
                rel="noreferrer"
              >
                明日方舟官网 <ArrowUpRight size={14} />
              </a>
              <a
                href="https://github.com/yi1z/TerraExplorationArchive/blob/main/resources/library-assets.json"
                target="_blank"
                rel="noreferrer"
              >
                档案素材清单 <ArrowUpRight size={14} />
              </a>
              <a
                href={`${import.meta.env.BASE_URL}third-party-notices.txt`}
                target="_blank"
                rel="noreferrer"
              >
                软件许可证 <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </Dialog>
      )}
      {store.notice && (
        <div className="terminal-toast" role="status">
          <Check size={16} />
          {store.notice}
        </div>
      )}
      {!store.storageAvailable && (
        <div className="terminal-storage" role="status">
          浏览器未允许保存；刷新后收藏与阅读偏好可能丢失。
        </div>
      )}
      {store.view !== "home" && store.view !== "search" && (
        <div className="terminal-connection interface-part" aria-hidden="true">
          <Radio size={13} />
          <span>TERRA / CONNECTED</span>
          {store.preferences.sound ? (
            <AudioLines size={13} />
          ) : (
            <VolumeX size={13} />
          )}
        </div>
      )}
    </div>
  );
}

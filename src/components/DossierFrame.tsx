import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { ArrowLeft, ScanLine } from "lucide-react";
import { useArchiveStore } from "../lib/state";
import type { DossierSection } from "../lib/dossier";
import { playUiSound } from "../lib/audio";

export const DossierVisibilityContext = createContext(false);

export default function DossierFrame({
  name,
  kind,
  tabs,
  section,
  onClose,
  closing,
  children,
}: {
  name: string;
  kind: string;
  tabs: readonly (readonly [DossierSection, string])[];
  section: DossierSection;
  onClose: () => void;
  closing?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const hidden = useContext(DossierVisibilityContext);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!hidden) heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (hidden) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [hidden]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [section]);
  const select = (next: DossierSection) => {
    const state = useArchiveStore.getState();
    if (next !== section) playUiSound("page", state.preferences.sound);
    state.setDossierSection(next);
  };
  return (
    <section
      className={`dossier-workspace${closing ? " is-closing" : ""}`}
      aria-labelledby={`${id}-heading`}
      aria-hidden={hidden || undefined}
      inert={closing || hidden}
    >
      <header className="dossier-heading">
        <button className="dossier-return" onClick={onClose}>
          <ArrowLeft size={16} />
          <span>返回主视觉</span>
          <kbd>ESC</kbd>
        </button>
        <div className="dossier-title-row">
          <div>
            <span className="terminal-kicker">{kind} / RECORD CONNECTED</span>
            <h2 id={`${id}-heading`} ref={heading} tabIndex={-1}>
              {name}
            </h2>
          </div>
          <ScanLine aria-hidden="true" size={28} />
        </div>
      </header>
      <div
        className="dossier-tabs"
        role="tablist"
        aria-label="档案章节"
        onKeyDown={(event) => {
          const current = tabs.findIndex(([key]) => key === section);
          const next =
            event.key === "ArrowRight"
              ? (current + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (current + tabs.length - 1) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : -1;
          if (next >= 0) {
            event.preventDefault();
            select(tabs[next][0]);
            (event.currentTarget.children[next] as HTMLElement).focus();
          }
        }}
      >
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`${id}-${key}`}
            aria-controls={`${id}-content`}
            role="tab"
            tabIndex={section === key ? 0 : -1}
            aria-selected={section === key}
            onClick={() => select(key)}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {label}
          </button>
        ))}
      </div>
      <div
        className="dossier-content library-dossier-content"
        ref={scroll}
        role="tabpanel"
        id={`${id}-content`}
        aria-labelledby={`${id}-${section}`}
        tabIndex={0}
      >
        <div className="dossier-section-body" key={section}>
          {children}
        </div>
      </div>
      <footer className="dossier-reading-footer">
        <span>PRTS / FIELD ARCHIVE</span>
        <span>沿着记录，继续探索</span>
      </footer>
    </section>
  );
}

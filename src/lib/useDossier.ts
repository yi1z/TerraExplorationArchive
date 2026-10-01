import { useEffect, useRef, useState } from "react";
import { useArchiveStore } from "./state";
import { useReducedMotion } from "./useMotion";
import {
  DOSSIER_MOTION,
  type DossierPhase,
  type DossierSection,
} from "./dossier";
import { playUiSound } from "./audio";

function closeReading() {
  const state = useArchiveStore.getState();
  if (!state.dossierOpen) return;
  playUiSound("back", state.preferences.sound);
  state.closeDossier();
}

/** Owns only presentation; reading location and history live in the store. */
export function useDossier(id: string, hidden = false) {
  const open = useArchiveStore(
    (state) => state.selected === id && state.dossierOpen,
  );
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<DossierPhase>(open ? "reading" : "stage");
  const stage = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const originalAria = useRef(new WeakMap<HTMLElement, string | null>());
  const restoreFocus = useRef(open);
  const previous = useRef({ id, open });
  useEffect(() => {
    const changedEntry = previous.current.id !== id;
    const changedOpen = previous.current.open !== open;
    previous.current = { id, open };
    if (reduced || changedEntry) {
      setPhase(open ? "reading" : "stage");
      return;
    }
    if (!changedOpen) return;
    setPhase(open ? "departing" : "returning");
    const timer = window.setTimeout(
      () => setPhase(open ? "reading" : "stage"),
      DOSSIER_MOTION.depart,
    );
    return () => window.clearTimeout(timer);
  }, [id, open, reduced]);
  useEffect(() => {
    const elements = stage.current?.querySelectorAll<HTMLElement>(
      ":scope > .interface-part",
    );
    elements?.forEach((element) => {
      if (!originalAria.current.has(element))
        originalAria.current.set(element, element.getAttribute("aria-hidden"));
      const blocked = hidden || phase !== "stage";
      element.inert = blocked;
      if (blocked) element.setAttribute("aria-hidden", "true");
      else {
        const previousAria = originalAria.current.get(element);
        if (previousAria === null || previousAria === undefined)
          element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", previousAria);
      }
    });
    if (phase !== "stage") restoreFocus.current = true;
    if (phase === "stage" && !hidden && restoreFocus.current) {
      const target = trigger.current?.isConnected
        ? trigger.current
        : stage.current?.querySelector<HTMLElement>("[data-dossier-trigger]");
      target?.focus({ preventScroll: true });
      trigger.current = null;
      restoreFocus.current = false;
    }
  });
  useEffect(() => {
    if (!open || hidden) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      closeReading();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, hidden]);
  return {
    stage,
    phase,
    open,
    reading: phase !== "stage",
    visible: phase === "reading" || phase === "returning",
    enter: (section: DossierSection = "overview") => {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const state = useArchiveStore.getState();
      if (!state.dossierOpen) playUiSound("enter", state.preferences.sound);
      useArchiveStore.getState().openDossier(id, section);
    },
    close: closeReading,
  };
}

import { useEffect, useRef } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import { panelOffset } from "./pointer";
export function useFloatingPanel() {
  const panel = useRef<HTMLElement>(null);
  const position = useRef({ x: 0, y: 0 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    box: DOMRect;
    handle: HTMLElement;
  } | null>(null);
  const apply = (
    x: number,
    y: number,
    box?: { left: number; right: number; top: number; bottom: number },
  ) => {
    const node = panel.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const base = box ?? {
      left: rect.left - position.current.x,
      right: rect.right - position.current.x,
      top: rect.top - position.current.y,
      bottom: rect.bottom - position.current.y,
    };
    position.current = panelOffset(x, y, base, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    node.style.setProperty("--drag-x", position.current.x + "px");
    node.style.setProperty("--drag-y", position.current.y + "px");
  };
  const end = () => {
    const active = drag.current;
    if (active?.handle.hasPointerCapture(active.id))
      active.handle.releasePointerCapture(active.id);
    drag.current = null;
    panel.current?.removeAttribute("data-dragging");
  };
  const reset = () => {
    end();
    position.current = { x: 0, y: 0 };
    panel.current?.style.removeProperty("--drag-x");
    panel.current?.style.removeProperty("--drag-y");
  };
  useEffect(() => {
    window.addEventListener("resize", reset);
    window.addEventListener("blur", end);
    return () => {
      end();
      window.removeEventListener("resize", reset);
      window.removeEventListener("blur", end);
    };
  }, []);
  const grip = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || window.innerWidth < 900 || !panel.current)
        return;
      const rect = panel.current.getBoundingClientRect();
      const box = new DOMRect(
        rect.x - position.current.x,
        rect.y - position.current.y,
        rect.width,
        rect.height,
      );
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: position.current.x,
        startY: position.current.y,
        box,
        handle: event.currentTarget,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      panel.current.setAttribute("data-dragging", "true");
      event.preventDefault();
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const d = drag.current;
      if (d && d.id === event.pointerId)
        apply(
          d.startX + event.clientX - d.x,
          d.startY + event.clientY - d.y,
          d.box,
        );
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onDoubleClick: reset,
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === "Home") {
        event.preventDefault();
        reset();
        return;
      }
      if (window.innerWidth < 900) return;
      const directions: Record<string, number[]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 16;
      apply(
        position.current.x + direction[0] * step,
        position.current.y + direction[1] * step,
      );
    },
  };
  return { panel, grip, reset };
}

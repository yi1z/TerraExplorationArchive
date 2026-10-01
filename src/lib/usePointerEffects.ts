import { useEffect } from "react";
import type { RefObject } from "react";
import { useReducedMotion } from "./useMotion";
import { pointerResponse } from "./pointer";
export function usePointerEffects(root: RefObject<HTMLDivElement | null>) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const node = root.current;
    if (!node || reduced) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    let surface: HTMLElement | null = null;
    let button: HTMLElement | null = null;
    const animations = new Map<HTMLElement, Animation>();
    const reset = (element: HTMLElement | null) => {
      if (!element) return;
      for (const key of [
        "--tilt-x",
        "--tilt-y",
        "--mag-x",
        "--mag-y",
        "--pointer-x",
        "--pointer-y",
      ])
        element.style.removeProperty(key);
      element.removeAttribute("data-pointer-active");
    };
    const update = () => {
      frame = 0;
      if (!last || !(last.target instanceof Element)) return;
      const nextSurface = last.target.closest<HTMLElement>("[data-reactive]");
      const nextButton = last.target.closest<HTMLElement>(
        "button:not(.drag-grip)",
      );
      if (surface !== nextSurface) {
        reset(surface);
        surface = nextSurface;
      }
      if (button !== nextButton) {
        reset(button);
        button = nextButton;
      }
      for (const target of new Set([surface, button])) {
        if (!target) continue;
        const rect = target.getBoundingClientRect();
        const p = pointerResponse(
          last.clientX - rect.left,
          last.clientY - rect.top,
          rect.width,
          rect.height,
        );
        target.style.setProperty("--pointer-x", p.x + "%");
        target.style.setProperty("--pointer-y", p.y + "%");
        target.setAttribute("data-pointer-active", "true");
        if (target === surface && target.dataset.reactive === "tilt") {
          target.style.setProperty("--tilt-x", p.tiltX + "deg");
          target.style.setProperty("--tilt-y", p.tiltY + "deg");
        }
        if (target === button) {
          target.style.setProperty("--mag-x", p.magnetX + "px");
          target.style.setProperty("--mag-y", p.magnetY + "px");
        }
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons || document.hidden)
        return;
      last = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = null;
      reset(surface);
      reset(button);
      surface = null;
      button = null;
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element))
        return;
      const target = event.target.closest<HTMLElement>(
        "button:not(.drag-grip)",
      );
      if (!target || target.hasAttribute("disabled")) return;
      animations.get(target)?.cancel();
      const animation = target.animate(
        [
          { boxShadow: "inset 0 0 0 1px #cfe888cc, 0 0 0 0 #cfe88850" },
          { boxShadow: "inset 0 0 0 1px #cfe88800, 0 0 0 12px #cfe88800" },
        ],
        { duration: 420, easing: "ease-out" },
      );
      animations.set(target, animation);
      animation.onfinish = () => {
        if (animations.get(target) === animation) animations.delete(target);
      };
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("pointerdown", down);
    window.addEventListener("blur", leave);
    return () => {
      leave();
      for (const animation of animations.values()) animation.cancel();
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("pointerdown", down);
      window.removeEventListener("blur", leave);
    };
  }, [root, reduced]);
}

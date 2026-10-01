import { useEffect } from "react";
import type { RefObject } from "react";
import { useReducedMotion } from "./useMotion";
import {
  approachPointer,
  neutralPointer,
  pointerResponse,
  type PointerResponse,
} from "./pointer";

export function usePointerEffects(root: RefObject<HTMLDivElement | null>) {
  const reduced = useReducedMotion();
  useEffect(() => {
    const node = root.current;
    if (!node || reduced) return;
    type Motion = {
      current: PointerResponse;
      target: PointerResponse;
      rect: DOMRect;
      active: boolean;
      tilt: boolean;
      magnet: boolean;
      dirty: boolean;
    };
    const motions = new Map<HTMLElement, Motion>();
    const animations = new Map<HTMLElement, Animation>();
    let frame = 0,
      lastTime = 0;
    const reset = (element: HTMLElement) => {
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
    const tick = (time: number) => {
      frame = 0;
      const elapsed = lastTime ? time - lastTime : 16;
      lastTime = time;
      let running = false;
      for (const [element, motion] of motions) {
        if (!element.isConnected) {
          motions.delete(element);
          continue;
        }
        const { value, settled } = approachPointer(
          motion.current,
          motion.target,
          elapsed,
        );
        motion.current = value;
        element.style.setProperty("--pointer-x", `${value.x}%`);
        element.style.setProperty("--pointer-y", `${value.y}%`);
        if (motion.tilt) {
          element.style.setProperty("--tilt-x", `${value.tiltX}deg`);
          element.style.setProperty("--tilt-y", `${value.tiltY}deg`);
        }
        if (motion.magnet) {
          element.style.setProperty("--mag-x", `${value.magnetX}px`);
          element.style.setProperty("--mag-y", `${value.magnetY}px`);
        }
        if (settled && !motion.active) {
          reset(element);
          motions.delete(element);
        } else if (!settled) running = true;
      }
      if (running) frame = requestAnimationFrame(tick);
      else lastTime = 0;
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      for (const motion of motions.values()) {
        motion.active = false;
        motion.target = { ...neutralPointer };
      }
      start();
    };
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      for (const element of motions.keys()) reset(element);
      motions.clear();
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons || document.hidden) {
        clear();
        return;
      }
      if (!(event.target instanceof Element)) return;
      const surface = event.target.closest<HTMLElement>("[data-reactive]");
      const button = event.target.closest<HTMLElement>(
        "button:not(.drag-grip):not(:disabled)",
      );
      const active = new Set(
        [surface, button].filter(
          (target): target is HTMLElement =>
            !!target && !target.closest("[inert]"),
        ),
      );
      for (const [element, motion] of motions)
        if (!active.has(element)) {
          motion.active = false;
          motion.target = { ...neutralPointer };
        }
      for (const element of active) {
        let motion = motions.get(element);
        if (!motion) {
          motion = {
            current: { ...neutralPointer },
            target: { ...neutralPointer },
            rect: element.getBoundingClientRect(),
            active: true,
            tilt: element === surface && element.dataset.reactive === "tilt",
            magnet: element === button,
            dirty: false,
          };
          motions.set(element, motion);
        }
        if (motion.dirty) {
          const rect = element.getBoundingClientRect();
          motion.rect = new DOMRect(
            rect.x - (motion.magnet ? motion.current.magnetX : 0),
            rect.y - (motion.magnet ? motion.current.magnetY : 0),
            rect.width,
            rect.height,
          );
          motion.dirty = false;
        }
        motion.active = true;
        motion.target = pointerResponse(
          event.clientX - motion.rect.left,
          event.clientY - motion.rect.top,
          motion.rect.width,
          motion.rect.height,
        );
        element.setAttribute("data-pointer-active", "true");
      }
      start();
    };
    const boundsChanged = () => {
      for (const motion of motions.values()) motion.dirty = true;
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element))
        return;
      const target = event.target.closest<HTMLElement>(
        "button:not(.drag-grip):not(:disabled)",
      );
      if (!target || target.closest("[inert]")) return;
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
    window.addEventListener("blur", clear);
    window.addEventListener("resize", boundsChanged);
    document.addEventListener("scroll", boundsChanged, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("pointerdown", down);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", boundsChanged);
      document.removeEventListener("scroll", boundsChanged, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [root, reduced]);
}

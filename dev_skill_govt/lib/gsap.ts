import { gsap } from "gsap";

export { gsap };
export { useGSAP } from "@gsap/react";

export const DUR = { base: 0.3, fast: 0.15, slow: 0.5 } as const;
export const EASE = { out: "power2.out", inOut: "power2.inOut", snap: "expo.out" } as const;

/** Transforms/animations only run when the user has no reduced-motion preference. */
export function motionOk() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Highlight a freshly updated row (polling) without replaying entrance animation. */
export function flash(el: HTMLElement | null, color = "var(--accent-soft)") {
  if (!el) return;
  gsap.fromTo(
    el,
    { backgroundColor: color },
    { backgroundColor: "transparent", duration: 0.8, ease: "power2.out", clearProps: "backgroundColor" }
  );
}

export function shake(el: HTMLElement | null) {
  if (!el || !motionOk()) return;
  gsap.fromTo(el, { x: -8 }, { x: 0, duration: 0.4, ease: "elastic.out(1, 0.4)" });
}

export function countUp(el: HTMLElement | null, endValue: number, duration = 0.8) {
  if (!el) return;
  if (!motionOk()) {
    el.textContent = Math.round(endValue).toLocaleString("en-IN");
    return;
  }
  const obj = { value: 0 };
  gsap.to(obj, {
    value: endValue,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      if (el) el.textContent = Math.round(obj.value).toLocaleString("en-IN");
    },
  });
}

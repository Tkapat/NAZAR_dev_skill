"use client";

import { useEffect, useRef } from "react";
import { DUR, EASE, countUp, flash, gsap, motionOk, shake } from "./gsap";

export { useGSAP } from "./gsap";
export { flash, shake };

/* ------------------------------------------------------------------ 9.1 */
/** Sliding pill behind the active nav item (top nav desktop + bottom dock). */
export function useSlidingPill(activeKey: string, deps: unknown[] = []) {
  const listRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;

    const place = (animate: boolean) => {
      const a = list.querySelector<HTMLElement>(`[data-nav="${activeKey}"]`);
      if (!a) {
        gsap.set(pill, { opacity: 0 });
        return;
      }
      const to = {
        x: a.offsetLeft,
        y: a.offsetTop,
        width: a.offsetWidth,
        height: a.offsetHeight,
        opacity: 1,
      };
      if (animate && !first.current && motionOk()) {
        gsap.to(pill, { ...to, duration: DUR.base, ease: EASE.out });
      } else {
        gsap.set(pill, to);
      }
      first.current = false;
    };
    place(false);

    const ro = new ResizeObserver(() => place(false));
    ro.observe(list);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, ...deps]);

  return { listRef, pillRef };
}

/* ------------------------------------------------------------------ 9.2 */
/** Hero entrance for Home: one timeline on first ready only. */
export function useHeroEntrance(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  useEffect(() => {
    const root = ref.current;
    if (!ready || played.current || !root || !motionOk()) return;
    played.current = true;
    gsap
      .timeline({ defaults: { ease: EASE.out } })
      .from("[data-hero-eyebrow]", { opacity: 0, y: 6, duration: DUR.base, clearProps: "transform,opacity" })
      .from("[data-hero-title]", { opacity: 0, y: 10, duration: DUR.page, clearProps: "transform,opacity" }, "-=0.15")
      .from(
        "[data-hero-sub], [data-hero-action]",
        { opacity: 0, y: 8, duration: DUR.base, stagger: 0.05, clearProps: "transform,opacity" },
        "-=0.2",
      )
      .from(
        "[data-stat]",
        { opacity: 0, y: 8, duration: DUR.base, stagger: 0.05, clearProps: "transform,opacity" },
        "-=0.1",
      );
  }, [ready]);
  return ref;
}

/* ------------------------------------------------------------------ 9.3 */
/** Vertical status rail: line grows, then rows stagger (max 10). */
export function useRail(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !motionOk() || !ref.current) return;
    const line = ref.current.querySelector("[data-rail-line]");
    const rows = gsap.utils.toArray<HTMLElement>("[data-rail-row]", ref.current).slice(0, 10);
    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    if (line) {
      tl.fromTo(line, { scaleY: 0, transformOrigin: "top" }, { scaleY: 1, duration: 0.4, clearProps: "transform" });
    }
    tl.from(rows, { opacity: 0, x: 8, duration: DUR.base, stagger: 0.035, clearProps: "transform,opacity" }, "-=0.25");
    return () => {
      tl.kill();
    };
  }, [ready]);
  return ref;
}

/* ------------------------------------------------------------------ 9.4 */
/** One-shot face-scan sweep (1.2 s), then onDone. */
export function scanSweep(line: Element | null, frame: Element | null, onDone: () => void) {
  if (!line || !frame || !motionOk()) {
    onDone();
    return;
  }
  gsap.fromTo(
    line,
    { top: "0%", opacity: 1 },
    {
      top: "100%",
      duration: 1.2,
      ease: "power1.inOut",
      onComplete: () => {
        gsap.set(line, { opacity: 0 });
        onDone();
      },
    },
  );
}

/* ------------------------------------------------------------------ 9.5 */
/** Draw SVG strokes once (login plan, checklist ticks, success rings). */
export function drawSvg(root: Element | null, sel = "[data-draw]", stagger = 0.08) {
  if (!root || !motionOk()) return;
  const els = gsap.utils.toArray<SVGGeometryElement>(sel, root);
  els.forEach((el) => {
    const l = el.getTotalLength?.() ?? 0;
    gsap.set(el, { strokeDasharray: l, strokeDashoffset: l });
  });
  gsap.to(els, {
    strokeDashoffset: 0,
    duration: 0.5,
    ease: EASE.out,
    stagger,
    clearProps: "strokeDasharray,strokeDashoffset",
  });
}

/* ------------------------------------------------------------------ 9.6 */
/** One-shot staggered entrance for [data-stagger-item] children (max 10). */
export function useStagger(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!ready || played.current || !el || !motionOk()) return;
    const items = el.querySelectorAll<HTMLElement>("[data-stagger-item]");
    if (!items.length) return;
    played.current = true;
    const tween = gsap.fromTo(
      Array.from(items).slice(0, 10),
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: DUR.base, stagger: 0.035, ease: EASE.out, clearProps: "opacity,transform" },
    );
    return () => {
      tween.kill();
    };
  }, [ready]);
  return ref;
}

/** Slide a step panel in (dir 1 = forward, -1 = back). */
export function animateStep(el: Element | null, dir: 1 | -1 = 1) {
  if (!el || !motionOk()) return;
  gsap.fromTo(
    el,
    { opacity: 0, x: 14 * dir },
    { opacity: 1, x: 0, duration: DUR.base, ease: EASE.out, clearProps: "transform,opacity" },
  );
}

/* ------------------------------------------------------------- CountUp */
/** Counts once on mount / when value changes (display numbers). */
export function CountUp({ value, duration = 0.6, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    if (done.current) {
      ref.current.textContent = Math.round(value).toLocaleString("en-IN");
      return;
    }
    done.current = true;
    countUp(ref.current, value, duration);
  }, [value, duration]);
  return <span ref={ref} className={className} aria-label={String(value)} />;
}

/** Flashes a row when deps change (polling) — never replays entrance motion. */
export function useFlash(deps: unknown[] = []) {
  const ref = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    flash(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Counts once to `endValue` when the value first appears (KPI numbers). */
export function useCountUp(endValue: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    if (done.current) {
      ref.current.textContent = Math.round(endValue).toLocaleString("en-IN");
      return;
    }
    done.current = true;
    countUp(ref.current, endValue);
  }, [endValue]);
  return ref;
}

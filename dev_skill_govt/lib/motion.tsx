"use client";

import { useEffect, useRef } from "react";
import { gsap, countUp, flash, motionOk, shake } from "./gsap";

export { useGSAP } from "./gsap";

/** Counts a number up once on mount / when value changes. */
export function useCountUp(endValue: number, duration = 0.8) {
  const ref = useRef<HTMLElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    if (done.current) {
      ref.current.textContent = Math.round(endValue).toLocaleString("en-IN");
      return;
    }
    done.current = true;
    countUp(ref.current, endValue, duration);
  }, [endValue, duration]);
  return ref;
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

export function useShake(deps: unknown[] = []) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    shake(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** One-shot staggered entrance for a group of children (never re-run on poll). */
export function useStaggerIn() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    const items = el.querySelectorAll<HTMLElement>("[data-stagger-item]");
    if (!items.length) return;
    const tween = gsap.fromTo(
      items,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.035,
        ease: "power2.out",
        clearProps: "opacity,transform",
      }
    );
    return () => {
      tween.kill();
    };
  }, []);
  return ref;
}

"use client";

import { useGSAP } from "@/lib/motion";
import { gsap, DUR, EASE, motionOk } from "@/lib/gsap";

export default function Template({ children }: { children: React.ReactNode }) {
  useGSAP(() => {
    if (!motionOk()) return;
    gsap.fromTo(
      "[data-page-enter]",
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: "opacity,transform" }
    );
  }, []);

  return <div data-page-enter>{children}</div>;
}

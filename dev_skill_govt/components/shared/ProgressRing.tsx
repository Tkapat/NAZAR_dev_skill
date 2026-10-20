"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0..1 */
  ratio: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}

export function ProgressRing({ ratio, size = 48, stroke = 4, label, className }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(clamped);
  }, [clamped]);

  const tone = clamped >= 0.9 ? "stroke-danger" : clamped >= 0.7 ? "stroke-warning" : "stroke-success";

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label ?? `${Math.round(clamped * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className={cn(tone, "transition-all duration-500 ease-out")}
        />
      </svg>
      <span className="tabular text-xs font-medium">{Math.round(clamped * 100)} %</span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface MeterProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  /** 0..1 thresholds on the ratio */
  threshold?: { warning: number; danger: number };
  showValue?: boolean;
}

export function Meter({
  value,
  max = 100,
  label,
  threshold = { warning: 0.7, danger: 0.9 },
  showValue = true,
  className,
  ...props
}: MeterProps) {
  const ratio = max > 0 ? value / max : 0;
  const percentage = Math.min(100, ratio * 100);
  const isDanger = ratio >= threshold.danger;
  const isWarning = !isDanger && ratio >= threshold.warning;

  const color = isDanger ? "bg-danger" : isWarning ? "bg-warning" : "bg-success";
  const tone = isDanger ? "text-danger" : isWarning ? "text-warning" : "text-success";

  return (
    <div className={cn("space-y-1", className)} {...props}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {label && <span className="font-medium">{label}</span>}
          {showValue && (
            <span className={cn("tabular", tone)}>
              {value} / {max}
            </span>
          )}
        </div>
      )}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

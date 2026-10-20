"use client";

import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
}

/** 40 px high line, no axes, 1.5 px stroke in var(--primary), animation only on first render. */
export function Sparkline({ data, className }: SparklineProps) {
  const points = useMemo(() => data.map((v, i) => ({ i, v })), [data]);

  return (
    <div className={cn("h-10 w-full", className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

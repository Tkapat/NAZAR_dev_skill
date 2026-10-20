"use client";

import { ArrowRight, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "./Sparkline";

export interface KpiCardProps {
  eyebrow: string;
  value: number;
  delta?: { value: string; direction: "up" | "down"; good?: boolean };
  sparkline?: number[];
  href?: string;
  loading?: boolean;
  className?: string;
}

export function KpiCard({ eyebrow, value, delta, sparkline, href, loading, className }: KpiCardProps) {
  const countRef = useCountUp(value);

  const body = (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span ref={countRef as React.RefObject<HTMLSpanElement>} className="tabular text-[28px] font-semibold leading-8">
          {loading ? "" : undefined}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              delta.good ? "text-success" : "text-danger"
            )}
          >
            {delta.direction === "up" ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {delta.value}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        {sparkline && sparkline.length > 1 ? (
          <Sparkline data={sparkline} className="h-10 w-24" />
        ) : (
          <span />
        )}
        {href && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </div>
    </>
  );

  if (loading) {
    return (
      <div className={cn("card p-5", className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-16" />
        <Skeleton className="mt-3 h-10 w-24" />
      </div>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        data-stagger-item
        className={cn("card-hover group block card p-5", className)}
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-stagger-item className={cn("card p-5", className)}>
      {body}
    </div>
  );
}

export function KpiRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCard key={i} eyebrow="" value={0} loading />
      ))}
    </div>
  );
}

export const KpiLinkArrow = ArrowRight;

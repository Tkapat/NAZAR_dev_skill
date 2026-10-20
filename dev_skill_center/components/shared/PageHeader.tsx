"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, action, children, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-[28px] font-semibold leading-8 tracking-[-0.02em]">{title}</h1>
          {description && <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </div>
  );
}

"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** One human sentence — never raw JSON or stack traces. */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = "We could not load this data. Check your connection and try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="max-w-[45ch] text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw className="mr-2 h-4 w-4" aria-hidden />
          Retry
        </Button>
      )}
    </div>
  );
}

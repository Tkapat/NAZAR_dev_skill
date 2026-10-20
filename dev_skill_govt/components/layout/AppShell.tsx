"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { User } from "@/types";

const LS_KEY = "sidebar:collapsed";
const useIsoLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  useIsoLayoutEffect(() => {
    setCollapsed(localStorage.getItem(LS_KEY) === "1");
  }, []);

  const handleChange = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem(LS_KEY, v ? "1" : "0");
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={user.role} collapsed={collapsed} onCollapsedChange={handleChange} />
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 md:pl-16",
          collapsed ? "lg:pl-16" : "lg:pl-60"
        )}
      >
        <TopBar user={user} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LogOut, Moon, Search, Settings, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MobileNav } from "./Sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User as MeUser } from "@/types";

interface TopBarProps {
  user: MeUser;
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link href="/overview" className="hidden text-muted-foreground hover:text-foreground sm:inline">
        Overview
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
          {c.isLast ? (
            <span className="truncate font-medium">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** URL read behind a Suspense boundary — the shell ships the home crumb only. */
function BreadcrumbsFromPath() {
  const pathname = usePathname();
  return <Breadcrumbs pathname={pathname} />;
}

export function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { data: openFlags } = useQuery({
    queryKey: ["flags", "open-count"],
    queryFn: () => api<{ items: unknown[] }>("/flags?status=open&limit=100"),
    refetchInterval: 15_000,
    select: (d) => d.items.length,
  });
  const openFlagsCount = openFlags ?? 0;

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background">
      <div className="flex h-full items-center gap-3 px-4 md:px-6">
        <MobileNav role={user.role} />

        <Suspense fallback={<Breadcrumbs pathname="" />}>
          <BreadcrumbsFromPath />
        </Suspense>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Search (gov) */}
          <form
            className="relative hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("q");
              if (typeof v === "string" && v.trim()) router.push(`/centres?q=${encodeURIComponent(v.trim())}`);
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search centres, codes..."
              aria-label="Search centres"
              className="h-9 w-56 rounded-md border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:w-64"
            />
          </form>

          {/* Notifications: open flags */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`${openFlagsCount} open flags`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {openFlagsCount > 0 && (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-primary-foreground",
                      "bg-danger"
                    )}
                    aria-hidden
                  >
                    {openFlagsCount > 99 ? "99" : openFlagsCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/flags?status=open" className="flex w-full cursor-pointer items-center justify-between">
                  <span>Open flags</span>
                  <span className="tabular text-muted-foreground">{openFlagsCount}</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="h-9 w-9"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-primary">
                  <User className="h-4 w-4" aria-hidden />
                </span>
                <span className="hidden max-w-32 truncate text-sm font-medium lg:inline">{user.full_name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block truncate">{user.full_name}</span>
                <span className="block truncate font-mono text-xs font-normal text-muted-foreground">{user.role}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex cursor-pointer items-center gap-2">
                  <Settings className="h-4 w-4" aria-hidden />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  await logout();
                  router.push("/login");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarClock,
  Camera,
  ClipboardList,
  FileText,
  Flag,
  Gavel,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  ScrollText,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, DUR, EASE, motionOk } from "@/lib/gsap";
import { BrandMark } from "@/components/shared/BrandMark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { LiveFeed } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const GROUPS: { items: NavItem[]; divider?: boolean }[] = [
  {
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/live", label: "Live", icon: Radio },
      { href: "/sessions", label: "Sessions", icon: CalendarClock },
    ],
  },
  {
    divider: true,
    items: [
      { href: "/applications", label: "Applications", icon: FileText },
      { href: "/centres", label: "Centres", icon: Building2 },
      { href: "/flags", label: "Flags", icon: Flag },
      { href: "/cameras", label: "Cameras", icon: Camera },
      { href: "/requests", label: "Requests", icon: ClipboardList },
      { href: "/enforcement", label: "Enforcement", icon: Gavel },
    ],
  },
  {
    divider: true,
    items: [
      { href: "/schemes", label: "Schemes", icon: ScrollText },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/accuracy", label: "Accuracy", icon: Target },
      { href: "/audit-log", label: "Audit log", icon: History },
    ],
  },
  {
    divider: true,
    items: [
      { href: "/users", label: "Users", icon: Users, adminOnly: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Rooms currently streaming — drives the small live dot on the "Live" nav item. */
function useLiveRoomCount() {
  const { data } = useQuery({
    queryKey: ["live", "sidebar-count"],
    queryFn: () => api<LiveFeed>("/live?limit=1"),
    refetchInterval: 15_000,
    staleTime: 15_000,
    select: (d) => d.counts?.live ?? 0,
  });
  return data ?? 0;
}

interface NavListProps {
  /** inside the icon rail (desktop/tablet aside) labels collapse */
  rail?: boolean;
  collapsed?: boolean;
  role?: string;
  onNavigate?: () => void;
  /** "" in the static shell (no active state until the URL resolves). */
  pathname?: string;
}

function NavList({ rail = false, collapsed = false, role, onNavigate, pathname = "" }: NavListProps) {
  const listRef = React.useRef<HTMLUListElement>(null);
  const barRef = React.useRef<HTMLSpanElement>(null);
  const firstBar = React.useRef(true);
  const liveCount = useLiveRoomCount();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useGSAP(
    () => {
      const a = listRef.current?.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!a || !barRef.current) {
        gsap.set(barRef.current, { opacity: 0 });
        return;
      }
      const to = { y: a.offsetTop + 8, height: a.offsetHeight - 16, opacity: 1 };
      if (firstBar.current || !motionOk()) {
        gsap.set(barRef.current, to);
        firstBar.current = false;
      } else {
        gsap.to(barRef.current, { ...to, duration: DUR.base, ease: EASE.out });
      }
    },
    { scope: listRef, dependencies: [pathname, collapsed] }
  );

  const hideLabels = rail && collapsed;

  return (
    <ul ref={listRef} className="relative space-y-1 px-3" role="navigation" aria-label="Main navigation">
      <span ref={barRef} className="absolute left-0 top-0 w-[3px] rounded-full bg-primary opacity-0" aria-hidden />
      {GROUPS.map((group, gi) => (
        <React.Fragment key={gi}>
          {group.divider && <li className="my-3 border-t border-border" aria-hidden />}
          {group.items.map((item) => {
            if (item.adminOnly && role !== "super_admin") return null;
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-nav-active={active}
                  onClick={onNavigate}
                  title={rail && hideLabels ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent-soft text-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                    rail &&
                      (hideLabels
                        ? "justify-center px-0"
                        : "justify-center px-0 lg:justify-start lg:px-3")
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className={cn("truncate", hideLabels && "hidden")}>{item.label}</span>
                  {item.href === "/live" && liveCount > 0 && (
                    <span className={cn("ml-auto flex items-center", hideLabels && "ml-1")}>
                      <span className="h-2 w-2 rounded-full bg-success live-dot" aria-hidden />
                      <span className="sr-only">{liveCount} rooms live now</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </React.Fragment>
      ))}
    </ul>
  );
}

/** URL read behind a Suspense boundary: under cacheComponents the static shell
 *  prerenders the same list with no active state, then active styles resolve. */
function NavListWithActiveState(props: NavListProps) {
  const pathname = usePathname();
  return <NavList {...props} pathname={pathname} />;
}

function NavListBoundary(props: NavListProps) {
  return (
    <React.Suspense fallback={<NavList {...props} pathname="" />}>
      <NavListWithActiveState {...props} />
    </React.Suspense>
  );
}

export function Sidebar({
  role,
  collapsed,
  onCollapsedChange,
}: {
  role?: string;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
}) {
  const toggle = () => onCollapsedChange(!collapsed);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-16 flex-col border-r border-border bg-card md:flex",
        collapsed ? "lg:w-16" : "lg:w-60"
      )}
      aria-label="Sidebar"
    >
      <div className="flex h-14 items-center justify-center overflow-hidden border-b border-border px-3 lg:justify-start">
        <Link href="/overview" aria-label="Dev_Skill home" className="flex items-center gap-2">
          <BrandMark showWord={false} />
          <span className={cn("hidden text-sm font-semibold tracking-tight lg:inline", collapsed && "lg:hidden")}>
            Dev_Skill
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <NavListBoundary rail collapsed={collapsed} role={role} />
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted-foreground",
              collapsed && "hidden"
            )}
          >
            Demo
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-9 w-9 shrink-0"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** Mobile (<768): hamburger opens a Sheet with the full nav. */
export function MobileNav({ role }: { role?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center border-b border-border px-4">
          <BrandMark />
        </div>
        <nav className="overflow-y-auto py-3">
          <NavListBoundary role={role} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

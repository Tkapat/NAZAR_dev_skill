"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarCheck,
  ClipboardList,
  FlaskConical,
  Home,
  LogOut,
  Moon,
  Radio,
  Settings,
  Sun,
  UserRound,
  Users,
  Video,
  Wrench,
  TriangleAlert,
  MessageSquareWarning,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useSlidingPill } from "@/lib/motion";
import { BrandMark } from "@/components/shared/BrandMark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Me } from "@/lib/types";

/* ------------------------------------------------------------- nav model */

export function navKey(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/attendance")) return "attendance";
  if (pathname.startsWith("/live")) return "live";
  if (pathname.startsWith("/trainees") || pathname.startsWith("/staff") || pathname.startsWith("/schedule"))
    return "people";
  if (pathname.startsWith("/cameras") || pathname.startsWith("/equipment")) return "setup";
  if (pathname.startsWith("/requests")) return "requests";
  if (pathname.startsWith("/flags")) return "flags";
  if (pathname.startsWith("/notices")) return "notices";
  if (pathname.startsWith("/demo") || pathname.startsWith("/settings")) return "more";
  return "";
}

interface NavChild {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}
interface NavItem {
  key: string;
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children?: NavChild[];
}

export const NAV: NavItem[] = [
  { key: "home", label: "Dashboard", href: "/", icon: Home },
  { key: "attendance", label: "Attendance", href: "/attendance", icon: CalendarCheck },
  { key: "live", label: "Live Monitor", href: "/live", icon: Radio },
  {
    key: "people",
    label: "People",
    icon: Users,
    children: [
      { label: "Trainees", href: "/trainees" },
      { label: "Staff", href: "/staff" },
      { label: "Batches", href: "/schedule" },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    icon: Video,
    children: [
      { label: "Cameras", href: "/cameras" },
      { label: "Equipment", href: "/equipment" },
    ],
  },
  { key: "requests", label: "Requests", href: "/requests", icon: ClipboardList },
  { key: "flags", label: "Flags", href: "/flags", icon: TriangleAlert },
  { key: "notices", label: "Notices", href: "/notices", icon: MessageSquareWarning },
  {
    key: "more",
    label: "More",
    icon: FlaskConical,
    children: [
      { label: "Demo Lab", href: "/demo" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

/* ----------------------------------------------------------------- bell */

function useAlertCount() {
  const notices = useQuery({
    queryKey: ["notices", "unread"],
    queryFn: () => api<{ items: { read_at?: string | null }[] }>("/my/notices?limit=100"),
    select: (d) => d.items.filter((n) => !n.read_at).length,
    refetchInterval: 30_000,
  });
  const flags = useQuery({
    queryKey: ["flags", "open-count"],
    queryFn: () => api<{ items: unknown[] }>("/my/flags?status=open&limit=100"),
    select: (d) => d.items.length,
    refetchInterval: 30_000,
  });
  return (notices.data ?? 0) + (flags.data ?? 0);
}

function BellLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/notices"
      aria-label={unread > 0 ? `${unread} items need attention` : "Notices"}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
    >
      <Bell className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
      {unread > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular"
          aria-hidden
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

/* ----------------------------------------------------------- avatar menu */

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function AvatarMenu({ user }: { user: Me }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = user.role === "centre_admin" ? "Centre admin" : "Trainer";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {user.id ? initials(user.full_name || user.login_id) : "…"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{user.full_name || "…"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {label} · <span className="font-mono">{user.centre_id ?? "—"}</span>
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="mr-2 h-4 w-4" aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/change-password")}>
          <UserRound className="mr-2 h-4 w-4" aria-hidden />
          Change password
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {isDark ? <Sun className="mr-2 h-4 w-4" aria-hidden /> : <Moon className="mr-2 h-4 w-4" aria-hidden />}
          {isDark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------- nav pill */

function PillList({
  activeKey,
  unread,
  listRef,
  pillRef,
}: {
  activeKey: string;
  unread: number;
  listRef: React.RefObject<HTMLElement | null>;
  pillRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <nav
      ref={listRef}
      aria-label="Main"
      className="relative hidden items-center gap-0.5 md:flex"
    >
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-accent-soft"
        style={{ opacity: 0 }}
      />
      {NAV.map((item) => {
        const active = activeKey === item.key;
        const cls = cn(
          "relative z-10 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        );

        if (item.children) {
          return (
            <DropdownMenu key={item.key}>
              <DropdownMenuTrigger asChild>
                <button type="button" data-nav={item.key} className={cls} aria-label={item.label}>
                  {item.label}
                  <span className="text-[10px] opacity-70" aria-hidden>
                    ▾
                  </span>
                  {active && <span className="sr-only">current section</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {item.children.map((c) => (
                  <DropdownMenuItem key={c.href} asChild>
                    <Link href={c.href}>{c.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        return (
          <Link key={item.key} href={item.href!} data-nav={item.key} className={cls} aria-current={active ? "page" : undefined}>
            {item.label}
            {item.key === "notices" && unread > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------- bottom dock */

function DockItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active?: boolean;
  badge?: boolean;
  onClick?: () => void;
}) {
  const cls = cn(
    "flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground",
  );
  const inner = (
    <>
      <span className="relative">
        <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
        {badge && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />}
      </span>
      {label}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href!} className={cls} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}

/* ---------------------------------------------------------------- shell */

interface AppShellProps {
  user: Me;
  /** mirrored from AuthGate's Suspense-safe PathnameSync */
  pathname: string;
  children: React.ReactNode;
}

export function AppShell({ user, pathname, children }: AppShellProps) {
  const activeKey = navKey(pathname);
  const { listRef, pillRef } = useSlidingPill(activeKey, [pathname]);
  const unread = useAlertCount();
  const [moreOpen, setMoreOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-3 px-4 md:px-8">
          <Link href="/" aria-label="Dev_skill centre — home" className="shrink-0">
            <BrandMark />
            <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Centre
            </span>
          </Link>

          <div className="ml-4 flex-1">
            <PillList activeKey={activeKey} unread={unread} listRef={listRef} pillRef={pillRef} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <BellLink unread={unread} />
            <AvatarMenu user={user} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-8">
        {children}
      </main>

      {/* mobile dock */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 pb-[env(safe-area-inset-bottom)] pt-1">
          <DockItem href="/" label="Today" icon={Home} active={activeKey === "home"} />
          <DockItem href="/attendance" label="Attendance" icon={CalendarCheck} active={activeKey === "attendance"} />
          <DockItem href="/trainees" label="People" icon={Users} active={activeKey === "people"} />
          <DockItem href="/requests" label="Requests" icon={ClipboardList} active={activeKey === "requests"} />
          <DockItem
            label="More"
            icon={Wrench}
            active={["live", "setup", "flags", "notices", "more"].includes(activeKey)}
            badge={unread > 0}
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-[24px]">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1">
            {[
              { label: "Live Monitor", href: "/live", icon: Radio },
              { label: "Cameras", href: "/cameras", icon: Video },
              { label: "Equipment", href: "/equipment", icon: Wrench },
              { label: "Staff", href: "/staff", icon: UserRound },
              { label: "Batches", href: "/schedule", icon: CalendarCheck },
              { label: "Flags", href: "/flags", icon: TriangleAlert },
              { label: "Notices", href: "/notices", icon: MessageSquareWarning, badge: unread > 0 },
              { label: "Demo Lab", href: "/demo", icon: FlaskConical },
              { label: "Settings", href: "/settings", icon: Settings },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-[12px] px-3 py-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                <item.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                {item.label}
                {item.badge && <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-hidden />}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

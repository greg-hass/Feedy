"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Compass, Flame, LogOut, Rss, Settings } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@/types/app";

const navItems = [
  { href: "/app/unread", label: "Unread", icon: Flame },
  { href: "/app/feeds", label: "Feeds", icon: Rss },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
    staleTime: 10_000,
  });
}

export function MobileShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.clear();
      router.replace("/login");
    },
  });

  const unreadTotal = me.data?.navigation.stats.unreadTotal ?? 0;

  return (
    <div className="app-shell screen-fade">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-4">
        <header className="sticky top-3 z-20">
          <div className="surface rounded-[24px] border border-subtle px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold leading-tight">{title}</h1>
                {subtitle ? <p className="mt-0.5 text-xs text-secondary">{subtitle}</p> : null}
              </div>
              <div className="ml-3 flex items-center gap-2 shrink-0">
                {actions}
                <button
                  onClick={() => logout.mutate()}
                  className="rounded-xl border border-subtle p-2 text-secondary active:bg-[var(--surface-muted)]"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {unreadTotal > 0 && pathname === "/app/unread" ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm">
            <span className="text-secondary">Unread items</span>
            <span className="text-base font-semibold accent">{unreadTotal}</span>
          </div>
        ) : null}

        <main className="mt-4 flex-1">{children}</main>

        <nav className="surface fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-center justify-around rounded-t-[20px] border-t border-subtle px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "accent text-[var(--accent)]" : "text-secondary",
                )}
              >
                <div className="relative">
                  <Icon className="size-5" />
                  {item.href === "/app/unread" && unreadTotal > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex size-4 items-center justify-center rounded-full bg-[var(--danger)] text-[8px] font-bold text-white">
                      {unreadTotal > 99 ? "99" : unreadTotal}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="surface animate-pulse rounded-[24px] border border-subtle p-4"
        >
          <div className="h-3 w-16 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-3 h-5 w-3/4 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-2 h-3 w-full rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-4 flex gap-2">
            <div className="h-10 flex-1 rounded-xl bg-[var(--surface-muted)]" />
            <div className="h-10 flex-1 rounded-xl bg-[var(--surface-muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="surface rounded-[24px] border border-subtle p-6 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-secondary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-xl bg-[var(--accent)] px-6 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="surface rounded-[24px] border border-dashed border-subtle px-5 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-secondary">{body}</p>
    </div>
  );
}

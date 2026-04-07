"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, ChevronRight, EyeOff, FolderOpen, FolderPlus, MoreHorizontal, Plus, RefreshCcw, Rss, Search, Trash2, Upload, X } from "lucide-react";
import { useTheme } from "next-themes";

import { MobileShell, useMe, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { FeedAvatar } from "@/components/feed-avatar";
import { AddFeedForm, AddFolderForm, EditFeedSheet, EditFolderSheet } from "@/components/forms";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { accentOptions } from "@/lib/theme";
import { relativeTime } from "@/lib/utils";
import type { ItemRecord, NavFeed, NavFolder } from "@/types/app";

function formatSourceType(value: string) {
  return value.replaceAll("_RSS", "").replaceAll("_", " ");
}

function getHealthPresentation(status: string) {
  switch (status) {
    case "HEALTHY":
      return {
        label: "Healthy",
        className: "text-emerald-300",
        dotClassName: "bg-emerald-400",
        compact: true,
      };
    case "DEGRADED":
      return {
        label: "Issue",
        className: "text-amber-300",
        dotClassName: "bg-amber-400",
        compact: false,
      };
    case "ERROR":
      return {
        label: "Error",
        className: "text-rose-300",
        dotClassName: "bg-rose-400",
        compact: false,
      };
    default:
      return {
        label: "Pending",
        className: "text-slate-300",
        dotClassName: "bg-slate-400",
        compact: false,
      };
  }
}

function getHealthSummary(feed: NavFeed) {
  if (feed.healthStatus === "ERROR" && feed.lastError) {
    return "Tap for latest refresh error";
  }

  if (feed.healthStatus === "HEALTHY") {
    return feed.lastSuccessfulRefreshAt
      ? `Last good refresh ${relativeTime(feed.lastSuccessfulRefreshAt)}`
      : "Feed is refreshing normally";
  }

  if (feed.healthStatus === "DEGRADED") {
    return "Feed has intermittent refresh issues";
  }

  return "Waiting for the first successful refresh";
}

function SectionLabel({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
        {eyebrow}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em]">{title}</h2>
        {meta ? <p className="text-[11px] text-secondary">{meta}</p> : null}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  columns,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ key: T; label: string }>;
  columns?: string;
}) {
  return (
    <div className={`grid gap-1 rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] p-1 ${columns ?? `grid-cols-${options.length}`}`}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)]"
                : "text-secondary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function useRefreshController(endpoint: string, invalidate: string[]) {
  const queryClient = useQueryClient();
  const [trackedBatchId, setTrackedBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const refreshStatus = useQuery({
    queryKey: ["refresh-status", endpoint, trackedBatchId],
    queryFn: () =>
      api<{
        active: number;
        completed: number;
        failed: number;
        queued: number;
        running: number;
        succeeded: number;
        total: number;
      }>(`/api/refresh/status?batchId=${encodeURIComponent(trackedBatchId ?? "")}`),
    enabled: !!trackedBatchId,
    refetchInterval: trackedBatchId ? 1500 : false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ batchId?: string; batchStartedAt?: string; queued?: number }>(endpoint, { method: "POST" }),
    onSuccess: async (data) => {
      setProgress(8);
      setTrackedBatchId(data.batchId ?? null);
      await queryClient.invalidateQueries({ queryKey: invalidate });
      await queryClient.refetchQueries({ queryKey: invalidate, type: "active" });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
    },
    onError: () => {
      setTrackedBatchId(null);
      setProgress(0);
    },
  });

  useEffect(() => {
    if (!trackedBatchId) {
      return;
    }

    const status = refreshStatus.data;
    if (!status) {
      return;
    }

    const total = Math.max(status.total, 1);
    const nextProgress =
      status.active > 0
        ? Math.min(94, Math.max(12, Math.round((status.completed / total) * 100)))
        : 100;

    setProgress(nextProgress);

    void queryClient.invalidateQueries({ queryKey: invalidate });
    void queryClient.refetchQueries({ queryKey: invalidate, type: "active" });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });

    if (status.total > 0 && status.active === 0) {
      const timeout = window.setTimeout(() => {
        setTrackedBatchId(null);
        setProgress(0);
      }, 500);

      return () => window.clearTimeout(timeout);
    }
  }, [invalidate, queryClient, refreshStatus.data, trackedBatchId]);

  return {
    active: mutation.isPending || !!trackedBatchId,
    progress,
    start: () => mutation.mutate(),
    status: refreshStatus.data,
  };
}

type RefreshController = ReturnType<typeof useRefreshController>;

export function UnreadScreen() {
  const timelineStateStorageKey = "feedy-timeline-state-v2";
  const timelineSourceStorageKey = "feedy-timeline-source-v2";
  const timelineAnchorStorageKey = "feedy-timeline-anchor-item";
  const [stateFilter, setStateFilter] = useState<"UNREAD" | "ALL" | "READ">(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.sessionStorage.getItem(timelineStateStorageKey);
    return saved === "UNREAD" || saved === "ALL" || saved === "READ" ? saved : "ALL";
  });
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "RSS" | "REDDIT" | "YOUTUBE">(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.sessionStorage.getItem(timelineSourceStorageKey);
    return saved === "ALL" || saved === "RSS" || saved === "REDDIT" || saved === "YOUTUBE" ? saved : "ALL";
  });
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    window.sessionStorage.setItem(timelineStateStorageKey, stateFilter);
    window.sessionStorage.setItem(timelineSourceStorageKey, sourceFilter);
  }, [sourceFilter, stateFilter, timelineSourceStorageKey, timelineStateStorageKey]);

  const params = new URLSearchParams();
  if (stateFilter !== "UNREAD") {
    params.set("stateFilter", stateFilter);
  }
  if (sourceFilter !== "ALL") {
    params.set("sourceFilter", sourceFilter);
  }
  const itemsUrl = `/api/items${params.toString() ? `?${params.toString()}` : ""}`;

  const items = useQuery({
    queryKey: ["items", "timeline", stateFilter, sourceFilter],
    queryFn: () => api<ItemRecord[]>(itemsUrl),
  });
  const refresh = useRefreshController("/api/refresh/all", ["items"]);
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);

  const scrollStorageKey = `feedy-timeline-scroll:${stateFilter}:${sourceFilter}`;

  useEffect(() => {
    restoredScrollRef.current = false;
  }, [stateFilter, sourceFilter]);

  useEffect(() => {
    const saveScroll = () => {
      window.sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      saveScroll();
      window.removeEventListener("scroll", saveScroll);
    };
  }, [scrollStorageKey]);

  useEffect(() => {
    if (items.isLoading || restoredScrollRef.current) {
      return;
    }

    const anchorItemId = window.sessionStorage.getItem(timelineAnchorStorageKey);
    const savedScroll = Number(window.sessionStorage.getItem(scrollStorageKey) || "0");
    restoredScrollRef.current = true;

    requestAnimationFrame(() => {
      if (anchorItemId) {
        const anchorElement = document.querySelector<HTMLElement>(
          `[data-timeline-item-id="${anchorItemId}"]`,
        );

        if (anchorElement) {
          const anchorTop = anchorElement.getBoundingClientRect().top + window.scrollY;
          const fixedOffset = 190;
          window.scrollTo({
            top: Math.max(anchorTop - fixedOffset, 0),
            behavior: "auto",
          });
          window.sessionStorage.removeItem(timelineAnchorStorageKey);
          return;
        }
      }

      window.scrollTo({ top: savedScroll, behavior: "auto" });
    });
  }, [items.isLoading, items.data, scrollStorageKey, timelineAnchorStorageKey]);

  useEffect(() => {
    if (!refresh.active) {
      return;
    }

    void items.refetch();
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
  }, [items, queryClient, refresh.active, refresh.status?.completed, refresh.status?.failed, refresh.status?.succeeded]);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

    if (!isStandalone) {
      return;
    }

    let startY: number | null = null;
    let dragging = false;
    let latestDistance = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 4 || refresh.active) {
        startY = null;
        dragging = false;
        latestDistance = 0;
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, button, a")) {
        startY = null;
        dragging = false;
        latestDistance = 0;
        return;
      }

      startY = event.touches[0]?.clientY ?? null;
      dragging = false;
      latestDistance = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY == null || window.scrollY > 4) {
        return;
      }

      const currentY = event.touches[0]?.clientY ?? startY;
      const delta = currentY - startY;
      if (delta <= 0) {
        return;
      }

      dragging = true;
      latestDistance = Math.min(88, Math.round(delta * 0.45));
      setPullDistance(latestDistance);
      event.preventDefault();
    };

    const finishDrag = () => {
      if (dragging && latestDistance >= 56 && !refresh.active) {
        refresh.start();
      } else if (dragging && !refresh.active) {
        void queryClient.invalidateQueries({ queryKey: ["items"] });
        void queryClient.refetchQueries({ queryKey: ["items"], type: "active" });
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }

      startY = null;
      dragging = false;
      latestDistance = 0;
      setPullDistance(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finishDrag, { passive: true });
    window.addEventListener("touchcancel", finishDrag, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finishDrag);
      window.removeEventListener("touchcancel", finishDrag);
    };
  }, [queryClient, refresh]);

  return (
    <MobileShell
      title="Timeline"
      actions={
        <RefreshButton controller={refresh} />
      }
    >
      {pullDistance > 0 && !refresh.active ? (
        <div
          className="fixed inset-x-0 z-30 px-5"
          style={{ top: `calc(env(safe-area-inset-top) + 112px + ${Math.max(pullDistance - 36, 0)}px)` }}
        >
          <div className="mx-auto flex max-w-md items-center justify-center">
            <div className="rounded-full border border-subtle bg-[color-mix(in_srgb,var(--surface)_94%,black_6%)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
              {pullDistance >= 56 ? "Release to refresh feeds" : "Pull to refresh"}
            </div>
          </div>
        </div>
      ) : null}
      <section
        className="fixed inset-x-0 z-30 px-5 pb-3 pt-1"
        style={{ top: "calc(env(safe-area-inset-top) + 92px)", backgroundColor: "var(--app-bg)" }}
      >
        <div className="mx-auto max-w-md grid grid-cols-2 gap-3">
          <label className="block">
            <span className="sr-only">Timeline state</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as "UNREAD" | "ALL" | "READ")}
              className="h-12 w-full rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              <option value="UNREAD">Unread</option>
              <option value="ALL">All</option>
              <option value="READ">Read</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Timeline source</span>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as "ALL" | "RSS" | "REDDIT" | "YOUTUBE")}
              className="h-12 w-full rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              <option value="ALL">All feeds</option>
              <option value="RSS">RSS</option>
              <option value="REDDIT">Reddit</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
          </label>
        </div>
      </section>

      <div className="h-[68px]" />

      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div className="space-y-3">
          {items.data.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            stateFilter === "READ"
              ? "No read items here"
              : stateFilter === "ALL"
                ? "Nothing in this view"
              : "Inbox clear"
          }
          body={
            stateFilter === "READ"
              ? "Items you open will appear here so you can revisit them."
              : stateFilter === "ALL"
                ? "Try another feed type or refresh to pull in more items."
              : "New items will land here as feeds refresh."
          }
          icon={<Bookmark className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function FeedsScreen() {
  const me = useMe();
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<"ALL" | "HEALTHY" | "ISSUES">("ALL");
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const dismissed = window.localStorage.getItem("feedy-swipe-hint-dismissed");
    if (!dismissed) {
      setShowSwipeHint(true);
    }
  }, []);

  if (me.isLoading) return <MobileShell title="Feeds"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Feeds"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  const feeds = me.data?.navigation.feeds ?? [];
  const folders = me.data?.navigation.folders ?? [];

  const normalizedQuery = query.trim().toLowerCase();
  const matchesHealth = (feed: NavFeed) =>
    healthFilter === "ALL" ||
    (healthFilter === "HEALTHY" ? feed.healthStatus === "HEALTHY" : feed.healthStatus !== "HEALTHY");
  const matchesFeed = (feed: NavFeed) =>
    matchesHealth(feed) &&
    (!normalizedQuery ||
      [feed.label, feed.title, feed.description, feed.sourceUrl, feed.siteUrl, formatSourceType(feed.sourceType)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)));

  const pinnedFeeds = feeds.filter((f) => f.isPinned && matchesFeed(f));
  const uncategorizedFeeds = feeds.filter((f) => !f.folderId && !f.isPinned && matchesFeed(f));
  const matchingFeeds = feeds.filter(matchesFeed);
  const selectedSet = new Set(selectedFeedIds);
  const selectedCount = selectedFeedIds.length;
  const folderNameById = new Map(folders.map((folder) => [folder.id, folder.title]));
  const visibleFolders = folders
    .map((folder) => {
      const folderFeeds = feeds.filter((feed) => feed.folderId === folder.id);
      const matchingFeeds = folderFeeds.filter(matchesFeed);
      const folderMatches = folder.title.toLowerCase().includes(normalizedQuery);

      return {
        ...folder,
        matchingFeeds,
        visible:
          !normalizedQuery ||
          folderMatches ||
          matchingFeeds.length > 0,
      };
    })
    .filter((folder) => folder.visible);

  useEffect(() => {
    if (!selectionMode) {
      setSelectedFeedIds([]);
      setShowBulkMove(false);
    }
  }, [selectionMode]);

  useEffect(() => {
    setSelectedFeedIds((current) => current.filter((id) => matchingFeeds.some((feed) => feed.id === id)));
  }, [matchingFeeds]);

  const moveFeeds = useMutation({
    mutationFn: async (folderId: string | null) => {
      await Promise.all(
        selectedFeedIds.map((feedId) =>
          api(`/api/feeds/${feedId}`, {
            method: "PATCH",
            body: JSON.stringify({ folderId }),
          }),
        ),
      );
    },
    onSuccess: async () => {
      setShowBulkMove(false);
      setSelectionMode(false);
      setSelectedFeedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  return (
    <MobileShell
      title="Feeds"
      subtitle="Manage subscriptions and folders"
      actions={
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={() => setSelectionMode(false)}
                className="rounded-2xl border border-subtle bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowBulkMove(true)}
                disabled={!selectedCount}
                className="rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)] disabled:opacity-50"
              >
                Move {selectedCount ? `(${selectedCount})` : ""}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="rounded-2xl border border-subtle bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-secondary"
              >
                Select
              </button>
              <button
                onClick={() => setShowAddFolder(true)}
                className="rounded-2xl border border-subtle bg-[var(--surface)] p-2.5 text-secondary"
                aria-label="Create folder"
              >
                <FolderPlus className="size-4" />
              </button>
              <button
                onClick={() => setShowAddFeed(true)}
                className="rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] p-2.5 text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)]"
                aria-label="Add feed"
              >
                <Plus className="size-4" />
              </button>
            </>
          )}
        </div>
      }
    >
      {showAddFolder && (
        <div className="mb-3">
          <AddFolderForm onClose={() => setShowAddFolder(false)} />
        </div>
      )}

      {showAddFeed && (
        <div className="mb-3">
          <AddFeedForm
            folders={folders}
            onClose={() => setShowAddFeed(false)}
          />
        </div>
      )}

      <section className="mb-4 rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_90%,black_10%)] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
          <Search className="size-4 shrink-0 text-secondary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search feeds, folders, or source names"
            className="h-11 border-0 bg-transparent px-0"
          />
        </div>
        <div className="mt-3">
          <SegmentedControl
            value={healthFilter}
            onChange={setHealthFilter}
            options={[
              { key: "ALL", label: "All" },
              { key: "HEALTHY", label: "Healthy" },
              { key: "ISSUES", label: "Issues" },
            ]}
            columns="grid-cols-3"
          />
        </div>
      </section>

      {!selectionMode && showSwipeHint ? (
        <section className="mb-4 flex items-center justify-between gap-3 rounded-[20px] border border-subtle bg-[var(--accent-soft)]/35 px-3.5 py-3 text-sm">
          <p className="text-[13px] text-secondary">
            Swipe a row left for edit and delete actions.
          </p>
          <button
            onClick={() => {
              setShowSwipeHint(false);
              window.localStorage.setItem("feedy-swipe-hint-dismissed", "1");
            }}
            className="rounded-full border border-subtle bg-[var(--surface)] px-3 py-1 text-[11px] font-medium text-secondary"
          >
            Got it
          </button>
        </section>
      ) : null}

      {selectionMode ? (
        <>
          <section className="mb-4 rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_90%,black_10%)] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
                  Multi-select
                </p>
                <h2 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.03em]">Select feeds to move</h2>
                <p className="mt-1 text-xs text-secondary">
                  {selectedCount} selected across {matchingFeeds.length} visible feeds.
                </p>
              </div>
              <button
                onClick={() => setShowBulkMove(true)}
                disabled={!selectedCount}
                className="rounded-2xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)] disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </section>

          <div className="space-y-2">
            {matchingFeeds.map((feed) => (
              <SelectableFeedRow
                key={feed.id}
                feed={feed}
                selected={selectedSet.has(feed.id)}
                folderTitle={feed.folderId ? (folderNameById.get(feed.folderId) ?? null) : null}
                onToggle={() =>
                  setSelectedFeedIds((current) =>
                    current.includes(feed.id)
                      ? current.filter((id) => id !== feed.id)
                      : [...current, feed.id],
                  )
                }
              />
            ))}
            {!matchingFeeds.length && (
              <EmptyState
                title="No feeds in this view"
                body="Try another search or filter, then select feeds to move."
                icon={<Rss className="size-6" />}
              />
            )}
          </div>
        </>
      ) : (
      <div className="space-y-4">
        {pinnedFeeds.length > 0 && (
          <section>
            <SectionLabel eyebrow="Quick access" title="Pinned" meta={`${pinnedFeeds.length} feeds`} />
            <div className="space-y-2">
              {pinnedFeeds.map((feed, index) => (
                <FeedRow key={feed.id} feed={feed} feeds={pinnedFeeds} index={index} />
              ))}
            </div>
          </section>
        )}

        {visibleFolders.length > 0 && (
          <section>
            <SectionLabel eyebrow="Library" title="Folders" meta={`${visibleFolders.length} groups`} />
            <div className="space-y-2">
              {visibleFolders.map((folder, index) => (
                <FolderRow key={folder.id} folder={folder} folders={visibleFolders} index={index} />
              ))}
            </div>
          </section>
        )}

        {uncategorizedFeeds.length > 0 && (
          <section>
            <SectionLabel
              eyebrow={folders.length > 0 ? "Loose feeds" : "Library"}
              title={folders.length > 0 ? "Uncategorized" : "All feeds"}
              meta={`${uncategorizedFeeds.length} feeds`}
            />
            <div className="space-y-2">
              {uncategorizedFeeds.map((feed, index) => (
                <FeedRow key={feed.id} feed={feed} feeds={uncategorizedFeeds} index={index} />
              ))}
            </div>
          </section>
        )}

        {!feeds.length && (
          <EmptyState
            title="No feeds yet"
            body="Add a standard RSS/Atom feed, a Reddit RSS URL, or a YouTube RSS URL."
            icon={<Rss className="size-6" />}
          />
        )}

        {!!feeds.length && (normalizedQuery || healthFilter !== "ALL") && !pinnedFeeds.length && !visibleFolders.length && !uncategorizedFeeds.length && (
          <EmptyState
            title={healthFilter === "ISSUES" ? "No feeds with issues" : "No feeds match this search"}
            body={
              healthFilter === "ISSUES"
                ? "Everything visible right now is healthy."
                : healthFilter === "HEALTHY"
                  ? "Try another search or switch back to all feeds."
                  : "Try a feed title, folder name, source URL, or source type."
            }
            icon={<Search className="size-6" />}
          />
        )}
      </div>
      )}

      {showBulkMove ? (
        <BulkMoveSheet
          folders={folders}
          selectedCount={selectedCount}
          onClose={() => setShowBulkMove(false)}
          onMove={(folderId) => moveFeeds.mutate(folderId)}
          isPending={moveFeeds.isPending}
        />
      ) : null}
    </MobileShell>
  );
}

export function FoldersScreen() {
  const me = useMe();
  const [showAddFolder, setShowAddFolder] = useState(false);

  if (me.isLoading) return <MobileShell title="Folders"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Folders"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  const folders = me.data?.navigation.folders ?? [];

  return (
    <MobileShell
      title="Folders"
      subtitle="Keep feeds organized"
      actions={
        <button
          onClick={() => setShowAddFolder(true)}
          className="rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] p-2.5 text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)]"
        >
          <FolderPlus className="size-4" />
        </button>
      }
    >
      {showAddFolder && (
        <div className="mb-3">
          <AddFolderForm onClose={() => setShowAddFolder(false)} />
        </div>
      )}

      <div className="space-y-2">
        {folders.map((folder, index) => (
          <FolderRow key={folder.id} folder={folder} folders={folders} index={index} />
        ))}
        {!folders.length && (
          <EmptyState
            title="No folders yet"
            body="Create folders to organize your feeds."
            icon={<FolderOpen className="size-6" />}
          />
        )}
      </div>
    </MobileShell>
  );
}

export function SavedScreen() {
  const items = useQuery({
    queryKey: ["items", "saved"],
    queryFn: () => api<ItemRecord[]>("/api/items?saved=true"),
  });

  return (
    <MobileShell title="Saved" subtitle="Your quiet backlog">
      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div className="space-y-3">
          {items.data.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing saved yet"
          body="Bookmark articles, videos, or Reddit posts to keep them close."
          icon={<Bookmark className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "RSS" | "REDDIT" | "YOUTUBE">("ALL");
  const [recentlyAdded, setRecentlyAdded] = useState<Record<string, true>>({});
  const searchParams = new URLSearchParams({
    q: query,
    sourceFilter,
  });
  const local = useQuery({
    queryKey: ["search", query, sourceFilter],
    queryFn: () =>
      api<Array<{ id: string; title: string; label: string | null; description: string | null; sourceType: string; sourceUrl: string }>>(
        `/api/search?${searchParams.toString()}`,
      ),
    enabled: query.trim().length > 0,
  });
  const discover = useQuery({
    queryKey: ["discover", query, sourceFilter],
    queryFn: () =>
      api<Array<{ title: string; description?: string | null; siteName?: string | null; favicon?: string | null; feedUrl: string; sourceType: string }>>(
        `/api/discover?${searchParams.toString()}`,
      ),
    enabled: query.trim().length > 1,
  });
  const queryClient = useQueryClient();
  const addFeed = useMutation({
    mutationFn: (body: { sourceUrl: string; label?: string | null }) =>
      api("/api/feeds", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      setRecentlyAdded((current) => ({ ...current, [variables.sourceUrl]: true }));
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["search"] });
      await queryClient.invalidateQueries({ queryKey: ["discover"] });
    },
  });

  return (
    <MobileShell title="Discover" subtitle="Find new feeds by keyword">
      <section className="rounded-[26px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
            Source scope
          </p>
          <p className="mt-1 text-xs text-secondary">
            Search everything or focus on one feed type.
          </p>
        </div>
        <div className="mt-3">
          <SegmentedControl
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { key: "ALL", label: "All" },
              { key: "RSS", label: "RSS" },
              { key: "REDDIT", label: "Reddit" },
              { key: "YOUTUBE", label: "YouTube" },
            ]}
            columns="grid-cols-4"
          />
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
          <Search className="size-4 shrink-0 text-secondary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              sourceFilter === "YOUTUBE"
                ? "creator, channel, presenter..."
                : sourceFilter === "REDDIT"
                  ? "topic, subreddit, community..."
                  : sourceFilter === "RSS"
                    ? "website, publication, topic..."
                    : "topic, creator, website, subreddit..."
            }
            className="h-11 border-0 bg-transparent px-0"
          />
        </div>
      </section>

      {query.trim().length > 0 && (
        <>
          <section className="mt-4">
            <SectionLabel
              eyebrow="Library search"
              title="My feeds"
              meta={sourceFilter === "ALL" ? undefined : formatSourceType(sourceFilter)}
            />
            <div className="space-y-2">
              {local.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {local.data?.map((feed) => (
                <div key={feed.id} className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FeedAvatar feedId={feed.id} title={feed.label || feed.title} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">{formatSourceType(feed.sourceType)}</p>
                        <h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">{feed.label || feed.title}</h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-secondary">{feed.description || feed.sourceUrl}</p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
                      Added
                    </span>
                  </div>
                </div>
              ))}
              {local.data && !local.data.length && (
                <p className="text-sm text-secondary">No matching feeds in your library.</p>
              )}
            </div>
          </section>

          <section className="mt-6">
            <SectionLabel
              eyebrow="New results"
              title="Discover feeds"
              meta={
                discover.data?.length
                  ? `${discover.data.length} matches`
                  : sourceFilter === "YOUTUBE"
                    ? "Channel-first results"
                    : undefined
              }
            />
            <div className="space-y-2">
              {discover.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {discover.data?.map((result) => {
                const justAdded = Boolean(recentlyAdded[result.feedUrl]);
                const isSubmitting =
                  addFeed.isPending && addFeed.variables?.sourceUrl === result.feedUrl;

                return (
                <div key={result.feedUrl} className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <DiscoveryAvatar
                        title={result.title}
                        sourceType={result.sourceType}
                        favicon={result.favicon || null}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
                          {result.siteName || formatSourceType(result.sourceType)}
                        </p>
                        <h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">{result.title}</h3>
                        {result.description ? (
                          <p className="mt-1.5 text-xs leading-relaxed text-secondary line-clamp-2">
                            {result.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {justAdded ? (
                      <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)]">
                        <Check className="size-3.5" />
                        Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => addFeed.mutate({ sourceUrl: result.feedUrl, label: result.title })}
                        disabled={addFeed.isPending}
                      >
                        {isSubmitting ? "Adding..." : "Add"}
                      </Button>
                    )}
                  </div>
                </div>
              )})}
              {discover.data && !discover.data.length && (
                <EmptyState
                  title="No feed matches yet"
                  body="Try a creator name, topic, website, subreddit, or channel keyword."
                />
              )}
            </div>
          </section>
        </>
      )}

      {!query.trim() && (
        <EmptyState
          title="Search for feeds"
          body="Type a keyword to search your library and discover new feeds."
          icon={<Search className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

function DiscoveryAvatar({
  title,
  sourceType,
  favicon,
}: {
  title: string;
  sourceType: string;
  favicon: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const fallbackLabel = title.trim().charAt(0).toUpperCase() || "F";
  const isYouTube = sourceType === "YOUTUBE_RSS";
  const isReddit = sourceType === "REDDIT_RSS";

  if (favicon && !failed) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_82%,black_18%)] p-1.5">
        <img
          src={favicon}
          alt=""
          className="size-full rounded-[12px] object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border border-subtle text-sm font-semibold ${
        isYouTube
          ? "bg-rose-500/12 text-rose-300"
          : isReddit
            ? "bg-orange-500/12 text-orange-300"
            : "bg-[var(--surface-muted)] text-secondary"
      }`}
    >
      {fallbackLabel}
    </div>
  );
}

export function SettingsScreen() {
  const { setTheme, theme } = useTheme();
  const me = useMe();
  const queryClient = useQueryClient();
  const settings = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <MobileShell title="Settings" subtitle="Theme, refresh, and data">
      <div className="space-y-3">
        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Account</h3>
          <p className="mt-2 text-sm text-secondary">
            Signed in as <span className="font-medium text-[var(--text-primary)]">{me.data?.user.username}</span>
          </p>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTheme(t);
                  settings.mutate({ theme: t.toUpperCase() });
                }}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  theme === t
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--text-primary)]">Accent colour</p>
            <p className="mt-1 text-xs text-secondary">Used for active states and highlights.</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {accentOptions.map((option) => {
                const active = me.data?.user.settings.accentColor === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => settings.mutate({ accentColor: option.key })}
                    className={`flex size-11 items-center justify-center rounded-full border-2 transition-transform ${
                      active ? "scale-105 border-white" : "border-transparent"
                    }`}
                    style={{
                      backgroundColor: option.hex,
                      boxShadow: active ? "0 0 0 3px rgba(255,255,255,0.82)" : "none",
                    }}
                    aria-label={`Use ${option.label} accent`}
                    title={option.label}
                  >
                    {active ? <span className="text-lg font-semibold text-white">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Refresh cadence</h3>
          <p className="mt-2 text-xs text-secondary">
            Current: {me.data?.user.settings.refreshIntervalMinutes ?? 60} minutes
          </p>
          <div className="mt-3 flex gap-2">
            {[15, 30, 60, 180].map((minutes) => (
              <button
                key={minutes}
                onClick={() => settings.mutate({ refreshIntervalMinutes: minutes })}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  me.data?.user.settings.refreshIntervalMinutes === minutes
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Storage retention</h3>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            The timeline shows up to 100 items at once. Old read items that are not bookmarked are cleaned up automatically.
            Unread items and saved items are preserved.
          </p>
          <div className="mt-3 flex gap-2">
            {[30, 90, 180, 365].map((days) => (
              <button
                key={days}
                onClick={() => settings.mutate({ itemRetentionDays: days })}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  me.data?.user.settings.itemRetentionDays === days
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Import & export</h3>
          <p className="mt-2 text-xs text-secondary">
            Move subscriptions with OPML or keep a full JSON backup.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/app/import-export">
              <Button variant="secondary" className="w-full text-xs">
                <Upload className="size-3.5 mr-1.5" />
                Import / Export
              </Button>
            </Link>
            <a href="/api/export/json">
              <Button className="w-full text-xs">Download JSON</Button>
            </a>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

export function ImportExportScreen() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an OPML file");
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/import/opml", { method: "POST", body: form });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Import failed");
      }
      return response.json();
    },
    onMutate: () => {
      setStatus("uploading");
      setStatusMessage("Importing subscriptions and preserving folder structure...");
    },
    onSuccess: (result: {
      imported?: number;
      duplicates?: number;
      failed?: number;
      foldersCreated?: number;
    }) => {
      setFile(null);
      setStatus("success");
      const parts = [
        `${result.imported ?? 0} imported`,
        `${result.duplicates ?? 0} duplicates skipped`,
      ];
      if (typeof result.foldersCreated === "number") {
        parts.push(`${result.foldersCreated} folders created`);
      }
      if ((result.failed ?? 0) > 0) {
        parts.push(`${result.failed} failed`);
      }
      setStatusMessage(parts.join(" · "));
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Import failed");
    },
  });

  return (
    <MobileShell title="Import / Export" subtitle="Portable subscriptions and backups">
      <div className="space-y-3">
        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Import OPML</h3>
          <p className="mt-1 text-xs text-secondary">Upload an OPML file from another feed reader.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setStatus("idle");
              setStatusMessage("");
            }}
          />
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 items-center rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-secondary"
            >
              <span className="truncate">{file ? file.name : "Choose OPML file"}</span>
            </button>
            {file ? (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setStatus("idle");
                  setStatusMessage("");
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="h-12 rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-secondary"
              >
                Clear
              </button>
            ) : null}
          </div>
          <Button
            onClick={() => {
              if (!file) {
                setStatus("error");
                setStatusMessage("Choose an OPML file first.");
                return;
              }
              upload.mutate();
            }}
            className="mt-3 w-full"
            disabled={status === "uploading"}
          >
            {status === "uploading" ? "Importing..." : "Import subscriptions"}
          </Button>
          {status !== "idle" && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                status === "success"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : status === "error"
                  ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "bg-[var(--surface-muted)] text-secondary"
              }`}
            >
              {statusMessage}
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Export</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/api/export/opml">
              <Button variant="secondary" className="w-full text-xs">
                Export OPML
              </Button>
            </a>
            <a href="/api/export/json">
              <Button className="w-full text-xs">Export JSON</Button>
            </a>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

function FeedRow({ feed, feeds, index }: { feed: NavFeed; feeds: NavFeed[]; index: number }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const queryClient = useQueryClient();
  const health = getHealthPresentation(feed.healthStatus);

  const deleteFeed = useMutation({
    mutationFn: () => api(`/api/feeds/${feed.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const reorder = useMutation({
    mutationFn: (direction: "up" | "down") => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= feeds.length) return Promise.resolve();
      const target = feeds[targetIndex];
      return api(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        body: JSON.stringify({ position: target.position }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <>
      <SwipeRow
        actions={
          <>
            <button
              onClick={() => {
                if (confirm(`Delete ${feed.label || feed.title}?`)) {
                  deleteFeed.mutate();
                }
              }}
              disabled={deleteFeed.isPending}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
              aria-label={`Delete ${feed.label || feed.title}`}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--surface-muted)] text-secondary"
              aria-label={`Edit ${feed.label || feed.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </>
        }
      >
        <div className="flex min-w-0 items-center gap-3 rounded-[20px] px-3 py-3">
          <Link href={`/app/feeds/${feed.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <FeedAvatar feedId={feed.id} title={feed.label || feed.title} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{feed.label || feed.title}</h3>
                {feed.counts.unreadCount > 0 && (
                  <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.22)]">
                    {feed.counts.unreadCount}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-secondary">
                {feed.description || feed.sourceUrl}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-secondary">
                <span>{formatSourceType(feed.sourceType)}</span>
                <span>·</span>
                <span>{relativeTime(feed.lastRefreshedAt)}</span>
                {feed.excludeFromTimeline ? (
                  <>
                    <span>·</span>
                    <span
                      className="inline-flex items-center text-rose-300"
                      aria-label="Hidden from Timeline"
                      title="Hidden from Timeline"
                    >
                      <EyeOff className="size-3.5" />
                    </span>
                  </>
                ) : null}
                <span>·</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowHealth(true);
                  }}
                  className={`inline-flex items-center ${health.compact ? "" : "gap-1.5"} text-[9px] font-semibold tracking-[0.12em] ${health.className}`}
                  aria-label={`View ${feed.label || feed.title} health`}
                  title={health.label}
                >
                  <span className={`size-1.5 rounded-full ${health.dotClassName}`} />
                  {!health.compact ? <span>{health.label}</span> : null}
                </button>
              </div>
            </div>
          </Link>
        </div>
      </SwipeRow>

      {showEdit && (
        <EditFeedSheet
          feed={feed}
          onClose={() => setShowEdit(false)}
          onDelete={() => deleteFeed.mutate()}
          onReorder={(direction) => reorder.mutate(direction)}
        />
      )}
      {showHealth && (
        <FeedHealthSheet
          feed={feed}
          onClose={() => setShowHealth(false)}
        />
      )}
    </>
  );
}

function SelectableFeedRow({
  feed,
  selected,
  folderTitle,
  onToggle,
}: {
  feed: NavFeed;
  selected: boolean;
  folderTitle: string | null;
  onToggle: () => void;
}) {
  const health = getHealthPresentation(feed.healthStatus);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.16)] transition-colors ${
        selected
          ? "border-[var(--accent)]/45 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface)_90%)]"
          : "border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)]"
      }`}
    >
      <div
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
            : "border-subtle bg-[var(--surface-muted)] text-transparent"
        }`}
      >
        <Check className="size-3.5" />
      </div>
      <FeedAvatar feedId={feed.id} title={feed.label || feed.title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{feed.label || feed.title}</h3>
          {feed.counts.unreadCount > 0 ? (
            <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.22)]">
              {feed.counts.unreadCount}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-secondary">
          {folderTitle || "No folder"} · {feed.description || feed.sourceUrl}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-secondary">
          <span>{formatSourceType(feed.sourceType)}</span>
          <span>·</span>
          <span>{relativeTime(feed.lastRefreshedAt)}</span>
          {feed.excludeFromTimeline ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center text-rose-300" title="Hidden from Timeline">
                <EyeOff className="size-3.5" />
              </span>
            </>
          ) : null}
          <span>·</span>
          <span className={`inline-flex items-center ${health.compact ? "" : "gap-1.5"} text-[9px] font-semibold tracking-[0.12em] ${health.className}`}>
            <span className={`size-1.5 rounded-full ${health.dotClassName}`} />
            {!health.compact ? <span>{health.label}</span> : null}
          </span>
        </div>
      </div>
    </button>
  );
}

function BulkMoveSheet({
  folders,
  selectedCount,
  onClose,
  onMove,
  isPending,
}: {
  folders: NavFolder[];
  selectedCount: number;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
  isPending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-8"
      onClick={onClose}
    >
      <div
        className="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface-strong)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-center">
          <div className="h-1.5 w-11 rounded-full bg-[var(--surface-muted)]" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">Move selected feeds</h3>
            <p className="mt-1 text-xs text-secondary">
              Choose where to place {selectedCount} selected {selectedCount === 1 ? "feed" : "feeds"}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-1.5 text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={() => onMove(null)}
            disabled={isPending}
            className="flex w-full items-center justify-between rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] px-4 py-3 text-left disabled:opacity-50"
          >
            <div>
              <p className="text-sm font-semibold">No folder</p>
              <p className="mt-1 text-xs text-secondary">Keep these feeds loose in the main library.</p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.16em] text-secondary">Move</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onMove(folder.id)}
              disabled={isPending}
              className="flex w-full items-center justify-between rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] px-4 py-3 text-left disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{folder.title}</p>
                <p className="mt-1 text-xs text-secondary">
                  {folder.counts.feedCount} feeds · {folder.counts.unreadCount} unread
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-secondary">Move</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeedHealthSheet({
  feed,
  onClose,
}: {
  feed: NavFeed;
  onClose: () => void;
}) {
  const health = getHealthPresentation(feed.healthStatus);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-8"
      onClick={onClose}
    >
      <div
        className="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface-strong)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-center">
          <div className="h-1.5 w-11 rounded-full bg-[var(--surface-muted)]" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">Feed health</h3>
            <p className="mt-1 truncate text-xs text-secondary">
              {feed.label || feed.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-1.5 text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_82%,black_18%)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Status</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {getHealthSummary(feed)}
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${health.className}`}>
              <span className={`size-2 rounded-full ${health.dotClassName}`} />
              {health.label}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="rounded-[18px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Last refresh</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {feed.lastRefreshedAt ? relativeTime(feed.lastRefreshedAt) : "Never"}
            </p>
          </div>

          <div className="rounded-[18px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Last successful refresh</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {feed.lastSuccessfulRefreshAt ? relativeTime(feed.lastSuccessfulRefreshAt) : "No successful refresh yet"}
            </p>
          </div>

          <div className="rounded-[18px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Last failure</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {feed.lastFailureAt ? relativeTime(feed.lastFailureAt) : "No recent failures"}
            </p>
          </div>

          {feed.lastError ? (
            <div className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-rose-300">Latest error</p>
              <p className="mt-1 text-sm leading-relaxed text-rose-100">
                {feed.lastError}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FolderRow({ folder, folders, index }: { folder: NavFolder; folders: NavFolder[]; index: number }) {
  const [showEdit, setShowEdit] = useState(false);
  const queryClient = useQueryClient();

  const deleteFolder = useMutation({
    mutationFn: () => api(`/api/folders/${folder.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const reorder = useMutation({
    mutationFn: (direction: "up" | "down") => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= folders.length) return Promise.resolve();
      const target = folders[targetIndex];
      return api(`/api/folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ position: target.position }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <>
      <SwipeRow
        actions={
          <>
            <button
              onClick={() => {
                if (confirm(`Delete folder ${folder.title}? Feeds will become uncategorized.`)) {
                  deleteFolder.mutate();
                }
              }}
              disabled={deleteFolder.isPending}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
              aria-label={`Delete folder ${folder.title}`}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--surface-muted)] text-secondary"
              aria-label={`Edit folder ${folder.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </>
        }
      >
        <Link href={`/app/folders/${folder.id}`} className="group flex items-center justify-between gap-3 rounded-[24px] px-3.5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]">
              <FolderOpen className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{folder.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
                <span>{folder.counts.unreadCount} unread</span>
                <span>·</span>
                <span>{folder.counts.feedCount} feeds</span>
                {folder.counts.issueCount > 0 ? (
                  <>
                    <span>·</span>
                    <span className="font-medium text-amber-300">
                      {folder.counts.issueCount} issues
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-secondary transition-colors group-hover:text-[var(--accent)]" />
        </Link>
      </SwipeRow>

      {showEdit && (
        <EditFolderSheet
          folder={folder}
          onClose={() => setShowEdit(false)}
          onDelete={() => deleteFolder.mutate()}
          onReorder={(direction) => reorder.mutate(direction)}
        />
      )}
    </>
  );
}

function SwipeRow({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
      <div className="absolute inset-y-[5px] right-[5px] flex items-center gap-2">
        {actions}
      </div>
      <div
        className={`relative z-10 bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] transition-transform duration-200 ease-out ${
          open ? "-translate-x-[132px]" : "translate-x-0"
        }`}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
          touchDeltaX.current = 0;
        }}
        onTouchMove={(event) => {
          if (touchStartX.current === null) return;
          touchDeltaX.current = (event.touches[0]?.clientX ?? 0) - touchStartX.current;
        }}
        onTouchEnd={() => {
          if (touchDeltaX.current < -36) setOpen(true);
          if (touchDeltaX.current > 36) setOpen(false);
          touchStartX.current = null;
          touchDeltaX.current = 0;
        }}
        onClickCapture={(event) => {
          if (open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

function RefreshButton({
  controller,
  endpoint,
  invalidate,
}: {
  controller?: RefreshController;
  endpoint?: string;
  invalidate?: string[];
}) {
  const refresh = controller ?? useRefreshController(endpoint ?? "/api/refresh/all", invalidate ?? ["items"]);

  return (
    <>
      <button
        onClick={() => refresh.start()}
        disabled={refresh.active}
        className={`rounded-2xl border p-2.5 active:bg-[var(--surface-muted)] disabled:opacity-70 ${
          refresh.active
            ? "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]"
            : "border-subtle bg-[var(--surface)] text-secondary"
        }`}
        aria-label={refresh.active ? "Refreshing feeds" : "Refresh feeds"}
      >
        <RefreshCcw className={`size-4 ${refresh.active ? "animate-spin" : ""}`} />
      </button>
      {refresh.active ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+70px)] z-50 px-5">
          <div className="mx-auto w-full max-w-md rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_94%,black_6%)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {!refresh.status ? "Queueing refresh" : "Refreshing feeds"}
                </p>
                <p className="mt-0.5 text-[11px] text-secondary">
                  {refresh.status
                    ? `${refresh.status.completed} of ${refresh.status.total} feeds finished${refresh.status.failed ? ` · ${refresh.status.failed} failed` : ""}`
                    : "Pulling in the latest items from your subscriptions."}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--accent)]">
                {refresh.progress}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_100%,white_20%)_100%)] transition-[width] duration-500 ease-out"
                style={{ width: `${refresh.progress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

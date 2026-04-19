"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, ChevronRight, EyeOff, FolderOpen, FolderPlus, MoreHorizontal, Plus, RefreshCcw, Rss, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { useTheme } from "next-themes";

import { MobileShell, useMe, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { FeedAvatar } from "@/components/feed-avatar";
import { ItemCard } from "@/components/item-card";
import { TimelineRefreshToast } from "@/components/timeline-refresh-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { computeTimelineRefreshDelta } from "@/lib/timeline-refresh";
import { accentOptions } from "@/lib/theme";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord, MeResponse, NavFeed, NavFolder } from "@/types/app";

const AddFeedForm = dynamic(() => import("@/components/forms").then((module) => module.AddFeedForm), {
  ssr: false,
});
const AddFolderForm = dynamic(() => import("@/components/forms").then((module) => module.AddFolderForm), {
  ssr: false,
});
const EditFeedSheet = dynamic(() => import("@/components/forms").then((module) => module.EditFeedSheet), {
  ssr: false,
});
const EditFolderSheet = dynamic(() => import("@/components/forms").then((module) => module.EditFolderSheet), {
  ssr: false,
});

type StorageStats = {
  dbSizeBytes: number;
  feedCount: number;
  articleCount: number;
  bookmarkedArticleCount: number;
  retentionDays: number;
};

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[exponent]}`;
}

function formatSourceType(value: string) {
  return value.replaceAll("_RSS", "").replaceAll("_", " ");
}

function compareFeedLabels(a: NavFeed, b: NavFeed) {
  const aLabel = decodeHtmlEntities(a.label || a.title).toLocaleLowerCase();
  const bLabel = decodeHtmlEntities(b.label || b.title).toLocaleLowerCase();
  return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
}

function formatDuration(ms: number | null | undefined) {
  if (!ms || ms <= 0) {
    return "n/a";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

function captureTimelineScrollAnchor(timelineFixedTop: number) {
  const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-timeline-item-id]"));
  const threshold = timelineFixedTop + 12;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > threshold) {
      return {
        itemId: element.dataset.timelineItemId ?? "",
        top: rect.top,
      };
    }
  }

  return null;
}

function getTimelineRefreshFingerprint(feeds: MeResponse["navigation"]["feeds"]) {
  return feeds
    .map(
      (feed) =>
        `${feed.id}:${feed.lastSuccessfulRefreshAt ?? ""}:${feed.lastRefreshedAt ?? ""}:${feed.lastFailureAt ?? ""}`,
    )
    .join("|");
}

function getSuggestedRefreshInterval(
  currentMinutes: number,
  performance: NavFeed["performance"],
) {
  if (!performance.isSlow) {
    return null;
  }

  let targetMinutes: number | null = null;

  if ((performance.latestDurationMs ?? 0) >= 2000 || (performance.averageDurationMs ?? 0) >= 1500 || performance.slowCount24h >= 4) {
    targetMinutes = 180;
  } else if ((performance.latestDurationMs ?? 0) >= 1200 || (performance.averageDurationMs ?? 0) >= 1000 || performance.slowCount24h >= 2) {
    targetMinutes = 60;
  }

  if (!targetMinutes || currentMinutes >= targetMinutes) {
    return null;
  }

  const cadenceSteps = [15, 30, 60, 180, 360, 720, 1440];
  return cadenceSteps.find((minutes) => minutes >= targetMinutes && minutes > currentMinutes) ?? null;
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
  const [batchSummary, setBatchSummary] = useState<{
    totalFeeds: number;
    queued: number;
    skipped: number;
  } | null>(null);
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
      api<{
        batchId?: string;
        batchStartedAt?: string;
        queued?: number;
        skipped?: number;
        totalFeeds?: number;
      }>(endpoint, { method: "POST" }),
    onSuccess: async (data) => {
      setTrackedBatchId(data.batchId ?? null);
      setBatchSummary(
        typeof data.totalFeeds === "number" && typeof data.queued === "number"
          ? {
              totalFeeds: data.totalFeeds,
              queued: data.queued,
              skipped: data.skipped ?? Math.max(0, data.totalFeeds - data.queued),
            }
          : null,
      );
      await queryClient.refetchQueries({ queryKey: invalidate, type: "active" });
    },
    onError: () => {
      setTrackedBatchId(null);
      setBatchSummary(null);
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

    void queryClient.refetchQueries({ queryKey: invalidate, type: "active" });

    if (status.total > 0 && status.active === 0) {
      const timeout = window.setTimeout(() => {
        setTrackedBatchId(null);
      }, 500);

      return () => window.clearTimeout(timeout);
    }
  }, [invalidate, queryClient, refreshStatus.data, trackedBatchId]);

  const progress = (() => {
    if (!trackedBatchId) {
      return 0;
    }

    if (!refreshStatus.data) {
      return 8;
    }

    const total = Math.max(refreshStatus.data.total, 1);
    return refreshStatus.data.active > 0
      ? Math.min(94, Math.max(12, Math.round((refreshStatus.data.completed / total) * 100)))
      : 100;
  })();

  return {
    active: mutation.isPending || !!trackedBatchId,
    progress,
    summary: batchSummary,
    start: () => mutation.mutate(),
    status: refreshStatus.data,
  };
}

type RefreshController = ReturnType<typeof useRefreshController>;

export function UnreadScreen() {
  const timelineStateStorageKey = "feedy-timeline-state-v2";
  const timelineSourceStorageKey = "feedy-timeline-source-v2";
  const timelineAnchorStorageKey = "feedy-timeline-anchor-item";
  const timelinePendingReadStorageKey = "feedy-timeline-pending-read";
  const [timelineFixedTop, setTimelineFixedTop] = useState(146);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(0);
  const [refreshToast, setRefreshToast] = useState<{
    count: number;
    jumpTargetId: string;
  } | null>(null);
  const restoredScrollRef = useRef(false);
  const timelinePanelRef = useRef<HTMLElement | null>(null);
  const saveScrollFrameRef = useRef<number | null>(null);
  const saveScrollYRef = useRef(0);
  const pendingRefreshIdsRef = useRef<string[] | null>(null);
  const pendingScrollAnchorRef = useRef<{ itemId: string; top: number } | null>(null);
  const lastRefreshFingerprintRef = useRef<string | null>(null);
  const refreshStartRef = useRef<(() => void) | null>(null);
  const deferredQuery = useDeferredValue(query);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    window.sessionStorage.setItem(timelineStateStorageKey, stateFilter);
    window.sessionStorage.setItem(timelineSourceStorageKey, sourceFilter);
  }, [sourceFilter, stateFilter, timelineSourceStorageKey, timelineStateStorageKey]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById("timeline-search-input")?.focus();
    });
  }, [searchOpen]);

  const params = new URLSearchParams();
  if (stateFilter !== "UNREAD") {
    params.set("stateFilter", stateFilter);
  }
  if (sourceFilter !== "ALL") {
    params.set("sourceFilter", sourceFilter);
  }
  if (deferredQuery.trim()) {
    params.set("q", deferredQuery.trim());
  }
  const itemsUrl = `/api/items${params.toString() ? `?${params.toString()}` : ""}`;

  const items = useQuery({
    queryKey: ["items", "timeline", stateFilter, sourceFilter, deferredQuery.trim()],
    queryFn: () => api<ItemRecord[]>(itemsUrl),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const refetchItems = items.refetch;
  const refresh = useRefreshController("/api/refresh/all", ["items"]);
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const filtersActive = stateFilter !== "ALL" || sourceFilter !== "ALL";
  const timelinePanelOpen = filtersOpen || searchOpen || !!query.trim();

  const scrollStorageKey = `feedy-timeline-scroll:${stateFilter}:${sourceFilter}`;
  const timelineSectionGap = 12;
  const timelineControlsTopGap = timelineSectionGap;
  const timelineControlsBottomGap = timelineSectionGap;
  const timelineContentPullUp = filtersOpen && !searchOpen && !query.trim() ? 9 : 0;
  const timelineControlsPanelHeight = timelinePanelOpen ? timelinePanelHeight : 0;
  const refreshFingerprint = me.data?.navigation.feeds ? getTimelineRefreshFingerprint(me.data.navigation.feeds) : null;

  const captureRefreshSnapshot = useCallback(() => {
    pendingRefreshIdsRef.current = items.data?.map((item) => item.id) ?? null;
    pendingScrollAnchorRef.current = captureTimelineScrollAnchor(timelineFixedTop);
  }, [items.data, timelineFixedTop]);

  const startRefresh = useCallback(() => {
    captureRefreshSnapshot();
    refreshStartRef.current?.();
  }, [captureRefreshSnapshot]);

  useEffect(() => {
    restoredScrollRef.current = false;
  }, [stateFilter, sourceFilter]);

  useEffect(() => {
    refreshStartRef.current = refresh.start;
  }, [refresh.start]);

  useEffect(() => {
    pendingRefreshIdsRef.current = null;
    pendingScrollAnchorRef.current = null;
    queueMicrotask(() => setRefreshToast(null));
  }, [deferredQuery, sourceFilter, stateFilter]);

  useEffect(() => {
    if (!refreshFingerprint) {
      return;
    }

    const previousFingerprint = lastRefreshFingerprintRef.current;
    lastRefreshFingerprintRef.current = refreshFingerprint;

    if (!previousFingerprint || previousFingerprint === refreshFingerprint) {
      return;
    }

    if (refresh.active || pendingRefreshIdsRef.current) {
      return;
    }

    captureRefreshSnapshot();
    void refetchItems();
  }, [captureRefreshSnapshot, refresh.active, refreshFingerprint, refetchItems]);

  useEffect(() => {
    const updateHeaderOffset = () => {
      const header = document.querySelector<HTMLElement>("[data-mobile-shell-header='true']");
      const nextTop = header?.offsetHeight ?? 146;
      setTimelineFixedTop(nextTop);
    };

    updateHeaderOffset();
    window.addEventListener("resize", updateHeaderOffset);

    return () => {
      window.removeEventListener("resize", updateHeaderOffset);
    };
  }, []);

  useLayoutEffect(() => {
    const updatePanelHeight = () => {
      const nextHeight = timelinePanelRef.current?.offsetHeight ?? 0;
      setTimelinePanelHeight(nextHeight);
    };

    updatePanelHeight();
    const panelElement = timelinePanelRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && panelElement
        ? new ResizeObserver(() => updatePanelHeight())
        : null;

    if (resizeObserver && panelElement) {
      resizeObserver.observe(panelElement);
    }
    window.addEventListener("resize", updatePanelHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePanelHeight);
    };
  }, [filtersOpen, query, searchOpen]);

  // scrollRestoration is set globally to "manual" in providers.tsx — no
  // per-component effect needed here. A per-component effect with a cleanup
  // that resets to "auto" was the root cause of the scroll-loss bug: the
  // cleanup fired on unmount (when navigating to an article), and the browser
  // would then auto-scroll to 0 on popstate before this component could set
  // it back to "manual".

  useEffect(() => {
    const flushScroll = () => {
      window.sessionStorage.setItem(scrollStorageKey, String(Math.max(0, Math.round(saveScrollYRef.current))));
    };

    const saveScroll = () => {
      saveScrollYRef.current = window.scrollY;
      if (saveScrollFrameRef.current != null) {
        return;
      }

      saveScrollFrameRef.current = window.requestAnimationFrame(() => {
        saveScrollFrameRef.current = null;
        flushScroll();
      });
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", flushScroll);
    window.addEventListener("visibilitychange", flushScroll);
    return () => {
      if (saveScrollFrameRef.current != null) {
        window.cancelAnimationFrame(saveScrollFrameRef.current);
        saveScrollFrameRef.current = null;
      }
      saveScrollYRef.current = window.scrollY;
      flushScroll();
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", flushScroll);
      window.removeEventListener("visibilitychange", flushScroll);
    };
  }, [scrollStorageKey]);

  useEffect(() => {
    if (!items.data?.length) {
      return;
    }

    const pendingReadItemId = window.sessionStorage.getItem(timelinePendingReadStorageKey);
    if (!pendingReadItemId) {
      return;
    }

    queryClient.setQueriesData<ItemRecord[]>({ queryKey: ["items", "timeline"] }, (current) =>
      current?.map((entry) => (entry.id === pendingReadItemId ? { ...entry, read: true } : entry)) ?? current,
    );
    window.sessionStorage.removeItem(timelinePendingReadStorageKey);
  }, [items.data, queryClient]);

  useLayoutEffect(() => {
    const previousIds = pendingRefreshIdsRef.current;
    if (!previousIds || !items.data?.length || refresh.active || items.isFetching) {
      return;
    }

    const nextIds = items.data.map((item) => item.id);
    pendingRefreshIdsRef.current = null;

    const delta = computeTimelineRefreshDelta(previousIds, nextIds);
    const anchor = pendingScrollAnchorRef.current;
    pendingScrollAnchorRef.current = null;

    if (delta.newCount <= 0) {
      queueMicrotask(() => setRefreshToast(null));
      return;
    }

    if (anchor?.itemId) {
      const element = document.querySelector<HTMLElement>(`[data-timeline-item-id="${anchor.itemId}"]`);
      if (element) {
        const nextTop = element.getBoundingClientRect().top;
        window.scrollBy({ top: nextTop - anchor.top, behavior: "auto" });
      }
    }

    setRefreshToast({
      count: delta.newCount,
      jumpTargetId: delta.jumpTargetId ?? nextIds[0],
    });
  }, [items.data, items.isFetching, refresh.active]);

  useLayoutEffect(() => {
    if (items.isLoading || restoredScrollRef.current) {
      return;
    }

    restoredScrollRef.current = true;

    // Parse saved anchor state — prefers element-based restoration (itemId)
    // over pixel-based (scrollY) because it is immune to layout timing issues.
    const anchorStateRaw = window.sessionStorage.getItem(timelineAnchorStorageKey);
    let anchorItemId: string | null = null;
    let anchorScrollY: number | null = null;

    if (anchorStateRaw) {
      try {
        const parsed = JSON.parse(anchorStateRaw) as { itemId?: string; scrollY?: number };
        anchorItemId = parsed.itemId ?? null;
        anchorScrollY = typeof parsed.scrollY === "number" ? parsed.scrollY : null;
      } catch {
        // Ignore malformed saved anchor state.
      }
    }

    const savedScroll = anchorScrollY ?? Number(window.sessionStorage.getItem(scrollStorageKey) || "0");

    if (savedScroll <= 0 && !anchorItemId) {
      window.sessionStorage.removeItem(timelineAnchorStorageKey);
      return;
    }

    // Prefer the saved pixel offset — it is accurate now that contentVisibility:auto
    // has been removed from ItemCard (that CSS was giving the browser a fake page
    // height that made scrollTo land at the wrong position).
    // Element-based positioning is kept as a last-resort fallback only, for cases
    // where no scrollY was recorded but we have an itemId to navigate to.
    const computeTarget = (): number => {
      if (savedScroll > 0) {
        return savedScroll;
      }
      if (anchorItemId) {
        const el = document.querySelector<HTMLElement>(`[data-timeline-item-id="${anchorItemId}"]`);
        if (el) {
          // No saved scroll — best we can do is put the card near the top.
          return Math.max(0, el.offsetTop - timelineFixedTop - 8);
        }
      }
      return 0;
    };

    let guardActive = true;

    const restoreScroll = () => {
      if (!guardActive) return;
      window.scrollTo({ top: computeTarget(), behavior: "auto" });
    };

    // Guard against any rogue scroll-to-0 fired by the browser or Next.js
    // router during the restoration window.
    const onUnwantedScroll = () => {
      if (guardActive && window.scrollY < savedScroll * 0.5) {
        restoreScroll();
      }
    };

    window.addEventListener("scroll", onUnwantedScroll, { passive: true });

    // Retry several times — layout may still be settling over the first few
    // frames (fonts, lazy images, flex layout recalculation).
    restoreScroll();
    const frameOne = window.requestAnimationFrame(restoreScroll);
    const frameTwo = window.requestAnimationFrame(() => window.requestAnimationFrame(restoreScroll));
    const timeoutOne = window.setTimeout(restoreScroll, 60);
    const timeoutTwo = window.setTimeout(restoreScroll, 200);
    const timeoutThree = window.setTimeout(restoreScroll, 400);
    const timeoutFour = window.setTimeout(() => {
      guardActive = false;
      window.removeEventListener("scroll", onUnwantedScroll);
      window.sessionStorage.removeItem(timelineAnchorStorageKey);
    }, 650);

    return () => {
      guardActive = false;
      window.removeEventListener("scroll", onUnwantedScroll);
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timeoutOne);
      window.clearTimeout(timeoutTwo);
      window.clearTimeout(timeoutThree);
      window.clearTimeout(timeoutFour);
    };
  }, [items.isLoading, items.data, scrollStorageKey, timelineAnchorStorageKey, timelineFixedTop]);

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
      if (target?.closest("input, textarea, select")) {
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
        startRefresh();
      } else if (dragging && !refresh.active) {
        void refetchItems();
        void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
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
  }, [queryClient, refetchItems, refresh.active, startRefresh]);

  return (
    <MobileShell
      title="Timeline"
      subtitle="Your latest reading"
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              if (searchOpen && !query.trim()) {
                setSearchOpen(false);
                return;
              }

              setSearchOpen(true);
            }}
            className={`rounded-2xl border p-2.5 active:bg-[var(--surface-muted)] ${
              searchOpen || query.trim()
                ? "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]"
                : "border-subtle bg-[var(--surface)] text-secondary"
            }`}
            aria-label={searchOpen || query.trim() ? "Hide article search" : "Search articles"}
          >
            <Search className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className={`rounded-2xl border p-2.5 active:bg-[var(--surface-muted)] ${
              filtersOpen || filtersActive
                ? "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]"
                : "border-subtle bg-[var(--surface)] text-secondary"
            }`}
            aria-label={filtersOpen ? "Hide timeline filters" : "Show timeline filters"}
          >
            <SlidersHorizontal className="size-4" />
          </button>
          <RefreshButton controller={refresh} onStart={startRefresh} />
        </>
      }
    >
      <TimelineRefreshToast
        count={refreshToast?.count ?? 0}
        onJump={() => {
          const targetId = refreshToast?.jumpTargetId;
          if (!targetId) {
            return;
          }

          const element = document.querySelector<HTMLElement>(`[data-timeline-item-id="${targetId}"]`);
          element?.scrollIntoView({ block: "start", behavior: "smooth" });
          setRefreshToast(null);
        }}
        onDismiss={() => setRefreshToast(null)}
      />

      {pullDistance > 0 && !refresh.active ? (
        <div className="mb-2 flex items-center justify-center">
          <div className="rounded-full border border-subtle bg-[color-mix(in_srgb,var(--surface)_94%,black_6%)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
            {pullDistance >= 56 ? "Release to refresh feeds" : "Pull to refresh"}
          </div>
        </div>
      ) : null}

      {timelinePanelOpen ? (
        <section
          ref={timelinePanelRef}
          className="fixed inset-x-0 z-30"
          style={{
            top: `${timelineFixedTop}px`,
            backgroundColor: "var(--app-bg)",
          }}
        >
          <div
            className="mx-auto w-full max-w-md px-5"
            style={{ paddingTop: `${timelineControlsTopGap}px`, paddingBottom: `${timelineControlsBottomGap}px` }}
          >
            {filtersOpen ? (
              <div className="grid w-full grid-cols-2 gap-3">
                <label className="block">
                  <span className="sr-only">Timeline state</span>
                  <select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value as "UNREAD" | "ALL" | "READ")}
                    className="h-12 w-full rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
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
                    className="h-12 w-full rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
                  >
                    <option value="ALL">All feeds</option>
                    <option value="RSS">RSS</option>
                    <option value="REDDIT">Reddit</option>
                    <option value="YOUTUBE">YouTube</option>
                  </select>
                </label>
              </div>
            ) : null}

            {searchOpen || query.trim() ? (
              <section className={filtersOpen ? "mt-3" : undefined}>
                <div className="flex items-center gap-3 rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
                  <Search className="size-4 shrink-0 text-secondary" />
                  <Input
                    id="timeline-search-input"
                    value={query}
                    onChange={(event) => {
                      const nextQuery = event.target.value;
                      setQuery(nextQuery);

                      if (!nextQuery.trim()) {
                        setSearchOpen(false);
                      } else {
                        setSearchOpen(true);
                      }
                    }}
                    placeholder="Search articles, feeds, people, topics..."
                    className="h-11 border-0 bg-transparent px-0"
                  />
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}

      <div style={{ height: `${timelineControlsPanelHeight}px` }} />

      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div
          className="space-y-3"
          style={
            timelineContentPullUp
              ? { marginTop: `-${timelineContentPullUp}px`, paddingTop: "1px" }
              : undefined
          }
        >
          {items.data.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
            />
          ))}
        </div>
      ) : (
        <div
          style={
            timelineContentPullUp
              ? { marginTop: `-${timelineContentPullUp}px`, paddingTop: "1px" }
              : undefined
          }
        >
          <EmptyState
            title={
              stateFilter === "READ"
                ? "No read items here"
                : stateFilter === "ALL"
                  ? "Nothing in this view"
                : "Inbox clear"
            }
            body={
              deferredQuery.trim()
                ? "Try a different phrase, topic, feed name, or source filter."
                : stateFilter === "READ"
                ? "Items you open will appear here so you can revisit them."
                : stateFilter === "ALL"
                  ? "Try another feed type or refresh to pull in more items."
                : "New items will land here as feeds refresh."
            }
            icon={<Bookmark className="size-6" />}
          />
        </div>
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
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return !window.localStorage.getItem("feedy-swipe-hint-dismissed");
  });
  const queryClient = useQueryClient();
  const deferredQuery = useDeferredValue(query);

  const feeds = useMemo(() => me.data?.navigation.feeds ?? [], [me.data?.navigation.feeds]);
  const folders = useMemo(() => me.data?.navigation.folders ?? [], [me.data?.navigation.folders]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const healthCounts = useMemo(
    () => ({
      all: feeds.length,
      healthy: feeds.filter((feed) => feed.healthStatus === "HEALTHY").length,
      issues: feeds.filter((feed) => feed.healthStatus !== "HEALTHY").length,
      slow: feeds.filter((feed) => feed.performance.isSlow).length,
    }),
    [feeds],
  );

  const matchingFeeds = useMemo(() => {
    if (!normalizedQuery) {
      return feeds.slice().sort(compareFeedLabels);
    }

    return feeds
      .filter((feed) =>
        [feed.label, feed.title, feed.description, feed.sourceUrl, feed.siteUrl, formatSourceType(feed.sourceType)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery)),
      )
      .sort(compareFeedLabels);
  }, [feeds, normalizedQuery]);

  const pinnedFeeds = useMemo(
    () => matchingFeeds.filter((feed) => feed.isPinned),
    [matchingFeeds],
  );
  const uncategorizedFeeds = useMemo(
    () => matchingFeeds.filter((feed) => !feed.folderId && !feed.isPinned),
    [matchingFeeds],
  );
  const looseSelectableFeeds = useMemo(
    () => matchingFeeds.filter((feed) => !feed.folderId),
    [matchingFeeds],
  );
  const effectiveSelectedFeedIds = useMemo(
    () => selectedFeedIds.filter((id) => matchingFeeds.some((feed) => feed.id === id)),
    [matchingFeeds, selectedFeedIds],
  );
  const selectedSet = useMemo(() => new Set(effectiveSelectedFeedIds), [effectiveSelectedFeedIds]);
  const selectedCount = effectiveSelectedFeedIds.length;
  const feedsByFolderId = useMemo(() => {
    const grouped = new Map<string, NavFeed[]>();

    for (const feed of feeds) {
      if (!feed.folderId) {
        continue;
      }

      const current = grouped.get(feed.folderId);
      if (current) {
        current.push(feed);
      } else {
        grouped.set(feed.folderId, [feed]);
      }
    }

    return grouped;
  }, [feeds]);
  const visibleFolders = useMemo(
    () =>
      folders
        .map((folder) => {
          const folderFeeds = feedsByFolderId.get(folder.id) ?? [];
          const matchingFolderFeeds = folderFeeds
            .filter((feed) =>
              !normalizedQuery ||
              [feed.label, feed.title, feed.description, feed.sourceUrl, feed.siteUrl, formatSourceType(feed.sourceType)]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(normalizedQuery)),
            )
            .sort(compareFeedLabels);
          const folderMatches = folder.title.toLowerCase().includes(normalizedQuery);

          return {
            ...folder,
            matchingFeeds: matchingFolderFeeds,
            visible:
              !normalizedQuery ||
              folderMatches ||
              matchingFolderFeeds.length > 0,
          };
        })
        .filter((folder) => folder.visible),
    [feedsByFolderId, folders, normalizedQuery],
  );

  const moveFeeds = useMutation({
    mutationFn: async (folderId: string | null) => {
      await Promise.all(
        effectiveSelectedFeedIds.map((feedId) =>
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

  if (me.isLoading) return <MobileShell title="Feeds"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Feeds"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  return (
    <MobileShell
      title="Feeds"
      subtitle="Manage subscriptions and folders"
      actions={
        <div className="flex h-10 items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedFeedIds([]);
                  setShowBulkMove(false);
                }}
                className="inline-flex h-10 items-center rounded-2xl border border-subtle bg-[var(--surface)] px-3 text-xs font-semibold text-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowBulkMove(true)}
                disabled={!selectedCount}
                className="inline-flex h-10 items-center rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] px-3 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)] disabled:opacity-50"
              >
                Move {selectedCount ? `(${selectedCount})` : ""}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="inline-flex h-10 items-center rounded-2xl border border-subtle bg-[var(--surface)] px-3 text-xs font-semibold text-secondary"
              >
                Select
              </button>
              <button
                onClick={() => setShowAddFolder(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-subtle bg-[var(--surface)] text-secondary"
                aria-label="Create folder"
              >
                <FolderPlus className="size-4" />
              </button>
              <button
                onClick={() => setShowAddFeed(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)]"
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
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "All", value: healthCounts.all, tone: "text-[var(--text-primary)]" },
              { label: "Healthy", value: healthCounts.healthy, tone: "text-emerald-300" },
              { label: "Issues", value: healthCounts.issues, tone: "text-amber-300" },
              { label: "Slow", value: healthCounts.slow, tone: "text-amber-200" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3 py-2.5 text-center"
              >
                <p className={`text-sm font-semibold ${item.tone}`}>{item.value}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-secondary">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
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
                <h2 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.03em]">Select folders or loose feeds</h2>
                <p className="mt-1 text-xs text-secondary">
                  {selectedCount} selected across {visibleFolders.length} visible folders and {looseSelectableFeeds.length} loose feeds.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkMove(true)}
                  disabled={!selectedCount}
                  className="rounded-2xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)] disabled:opacity-50"
                >
                  Move
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-4">
            {visibleFolders.length > 0 ? (
              <section>
                <SectionLabel eyebrow="Library" title="Folders" meta={`${visibleFolders.length} groups`} />
                <div className="space-y-2">
                  {visibleFolders.map((folder) => {
                    const folderFeedIds = folder.matchingFeeds.map((feed) => feed.id);
                    const folderSelected =
                      folderFeedIds.length > 0 && folderFeedIds.every((id) => selectedSet.has(id));

                    return (
                      <SelectableFolderRow
                        key={folder.id}
                        folder={folder}
                        selected={folderSelected}
                        selectedCount={folderFeedIds.filter((id) => selectedSet.has(id)).length}
                        onToggle={() =>
                          setSelectedFeedIds((current) => {
                            const currentSet = new Set(current);
                            if (folderSelected) {
                              folderFeedIds.forEach((id) => currentSet.delete(id));
                            } else {
                              folderFeedIds.forEach((id) => currentSet.add(id));
                            }
                            return Array.from(currentSet);
                          })
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}

            {looseSelectableFeeds.length > 0 ? (
              <section>
                <SectionLabel
                  eyebrow={visibleFolders.length > 0 ? "Loose feeds" : "Library"}
                  title={visibleFolders.length > 0 ? "Uncategorized" : "Feeds"}
                  meta={`${looseSelectableFeeds.length} feeds`}
                />
                <div className="space-y-2">
                  {looseSelectableFeeds.map((feed) => (
                    <SelectableFeedRow
                      key={feed.id}
                      feed={feed}
                      selected={selectedSet.has(feed.id)}
                      folderTitle={null}
                      onToggle={() =>
                        setSelectedFeedIds((current) =>
                          current.includes(feed.id)
                            ? current.filter((id) => id !== feed.id)
                            : [...current, feed.id],
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {!visibleFolders.length && !looseSelectableFeeds.length && (
              <EmptyState
                title="No feeds in this view"
                body="Try another search or filter, then select folders or loose feeds."
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

        {!!feeds.length && normalizedQuery && !pinnedFeeds.length && !visibleFolders.length && !uncategorizedFeeds.length && (
          <EmptyState
            title="No feeds match this search"
            body="Try a feed title, folder name, source URL, or source type."
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pullDistance, setPullDistance] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById("saved-search-input")?.focus();
    });
  }, [searchOpen]);

  const params = new URLSearchParams({ saved: "true" });
  if (deferredQuery.trim()) {
    params.set("q", deferredQuery.trim());
  }
  const items = useQuery({
    queryKey: ["items", "saved", deferredQuery.trim()],
    queryFn: () => api<ItemRecord[]>(`/api/items?${params.toString()}`),
    staleTime: 15_000,
  });

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
      if (window.scrollY > 4) {
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
      if (dragging) {
        void items.refetch();
        void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
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
  }, [items.refetch, queryClient]);

  return (
    <MobileShell
      title="Saved"
      subtitle="Your quiet backlog"
      actions={
        <button
          type="button"
          onClick={() => {
            if (searchOpen && !query.trim()) {
              setSearchOpen(false);
              return;
            }

            setSearchOpen(true);
          }}
          className={`rounded-2xl border p-2.5 active:bg-[var(--surface-muted)] ${
            searchOpen || query.trim()
              ? "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]"
              : "border-subtle bg-[var(--surface)] text-secondary"
          }`}
          aria-label={searchOpen || query.trim() ? "Hide saved search" : "Search saved items"}
        >
          <Search className="size-4" />
        </button>
      }
    >
      {pullDistance > 0 ? (
        <div className="mb-2 flex items-center justify-center">
          <div className="rounded-full border border-subtle bg-[color-mix(in_srgb,var(--surface)_94%,black_6%)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
            Pull to refresh saved items
          </div>
        </div>
      ) : null}
      {searchOpen || query.trim() ? (
        <section className="mb-3">
          <div className="flex items-center gap-3 rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
            <Search className="size-4 shrink-0 text-secondary" />
            <Input
              id="saved-search-input"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);

                if (!nextQuery.trim()) {
                  setSearchOpen(false);
                } else {
                  setSearchOpen(true);
                }
              }}
              placeholder="Search saved articles and videos..."
              className="h-11 border-0 bg-transparent px-0"
            />
          </div>
        </section>
      ) : null}
      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div className="space-y-3">
          {items.data.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={deferredQuery.trim() ? "No saved matches" : "Nothing saved yet"}
          body={
            deferredQuery.trim()
              ? "Try a different phrase, feed name, or keyword."
              : "Bookmark articles, videos, or Reddit posts to keep them close."
          }
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const searchParams = new URLSearchParams({
    q: deferredQuery,
    sourceFilter,
  });
  const local = useQuery({
    queryKey: ["search", deferredQuery, sourceFilter],
    queryFn: () =>
      api<Array<{ id: string; title: string; label: string | null; description: string | null; sourceType: string; sourceUrl: string }>>(
        `/api/search?${searchParams.toString()}`,
      ),
    enabled: deferredQuery.trim().length > 0,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
  const discover = useQuery({
    queryKey: ["discover", deferredQuery, sourceFilter],
    queryFn: () =>
      api<Array<{ title: string; description?: string | null; siteName?: string | null; favicon?: string | null; feedUrl: string; sourceType: string }>>(
        `/api/discover?${searchParams.toString()}`,
      ),
    enabled: deferredQuery.trim().length > 1,
    staleTime: 60_000,
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
  const isSearchingLibrary = local.isPending || local.isFetching;
  const isSearchingDiscover = discover.isPending || discover.isFetching;

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
              {isSearchingLibrary && <p className="text-sm text-secondary">Searching...</p>}
              {local.data?.map((feed) => (
                <div
                  key={feed.id}
                  className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
                  style={{ contentVisibility: "auto", containIntrinsicSize: "104px" }}
                >
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
              {!isSearchingLibrary && local.data && !local.data.length && (
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
              {isSearchingDiscover && <p className="text-sm text-secondary">Searching...</p>}
              {discover.data?.map((result) => {
                const justAdded = Boolean(recentlyAdded[result.feedUrl]);
                const isSubmitting =
                  addFeed.isPending && addFeed.variables?.sourceUrl === result.feedUrl;

                return (
                <div
                  key={result.feedUrl}
                  className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
                  style={{ contentVisibility: "auto", containIntrinsicSize: "112px" }}
                >
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
              {!isSearchingDiscover && discover.data && !discover.data.length && (
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
        <div className="mt-4">
          <EmptyState
            title="Search for feeds"
            body="Type a keyword to search your library and discover new feeds."
            icon={<Search className="size-6" />}
          />
        </div>
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
  const storage = useQuery({
    queryKey: ["settings-storage"],
    queryFn: () => api<StorageStats>("/api/settings/storage"),
  });
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
          <h3 className="text-sm font-semibold">Device</h3>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Keep screen awake</p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">
                Prevent the screen from dimming while Feedy is open. iPhone may still revoke this in low power mode or the background.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                settings.mutate({
                  keepScreenAwake: !me.data?.user.settings.keepScreenAwake,
                })
              }
              className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
                me.data?.user.settings.keepScreenAwake
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : "border-subtle bg-[var(--surface-muted)]"
              }`}
              aria-pressed={Boolean(me.data?.user.settings.keepScreenAwake)}
              aria-label="Toggle keep screen awake"
            >
              <span
                className={`absolute size-6 rounded-full bg-white shadow-[0_6px_16px_rgba(0,0,0,0.22)] transition-transform ${
                  me.data?.user.settings.keepScreenAwake ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Database</h3>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Local storage usage, retention, and safe purge controls. Bookmarked items are never deleted.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-subtle bg-[var(--surface-muted)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">Database size</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {storage.data ? formatBytes(storage.data.dbSizeBytes) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-subtle bg-[var(--surface-muted)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">Feeds stored</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {storage.data ? storage.data.feedCount.toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-subtle bg-[var(--surface-muted)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">Articles stored</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {storage.data ? storage.data.articleCount.toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-subtle bg-[var(--surface-muted)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">Saved items</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {storage.data ? storage.data.bookmarkedArticleCount.toLocaleString() : "—"}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-subtle bg-[var(--surface-muted)] p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">Retention</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {me.data?.user.settings.itemRetentionDays ?? 90} days
            </p>
            <p className="mt-1 text-xs leading-relaxed text-secondary">
              Unread and read items older than this window are removed automatically unless they are bookmarked.
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
        <div
          className="flex min-w-0 items-center gap-3 rounded-[20px] px-3 py-3"
          style={{ contentVisibility: "auto", containIntrinsicSize: "92px" }}
        >
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
                {feed.performance.isSlow ? (
                  <>
                    <span>·</span>
                    <span className="font-medium text-amber-300">
                      Slow {formatDuration(feed.performance.latestDurationMs)}
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
      style={{ contentVisibility: "auto", containIntrinsicSize: "92px" }}
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
          {feed.performance.isSlow ? (
            <>
              <span>·</span>
              <span className="font-medium text-amber-300">
                Slow {formatDuration(feed.performance.latestDurationMs)}
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

function SelectableFolderRow({
  folder,
  selected,
  selectedCount,
  onToggle,
}: {
  folder: NavFolder & { matchingFeeds: NavFeed[] };
  selected: boolean;
  selectedCount: number;
  onToggle: () => void;
}) {
  const partiallySelected = selectedCount > 0 && !selected;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.16)] transition-colors ${
        selected || partiallySelected
          ? "border-[var(--accent)]/45 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface)_90%)]"
          : "border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)]"
      }`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "92px" }}
    >
      <div
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
            : partiallySelected
              ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
              : "border-subtle bg-[var(--surface-muted)] text-transparent"
        }`}
      >
        <Check className="size-3.5" />
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]">
        <FolderOpen className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{folder.title}</h3>
          <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.22)]">
            {folder.matchingFeeds.length}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
          <span>{folder.counts.unreadCount} unread</span>
          <span>·</span>
          <span>{folder.counts.feedCount} feeds</span>
          {folder.counts.issueCount > 0 ? (
            <>
              <span>·</span>
              <span className="font-medium text-amber-300">{folder.counts.issueCount} issues</span>
            </>
          ) : null}
          {folder.counts.slowFeedCount > 0 ? (
            <>
              <span>·</span>
              <span className="font-medium text-amber-300">{folder.counts.slowFeedCount} slow</span>
            </>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-secondary">
          {selected
            ? `All ${folder.matchingFeeds.length} visible feeds selected`
            : partiallySelected
              ? `${selectedCount} of ${folder.matchingFeeds.length} visible feeds selected`
              : `${folder.matchingFeeds.length} visible feeds`}
        </p>
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

function BulkCadenceSheet({
  selectedCount,
  onClose,
  onApply,
  isPending,
}: {
  selectedCount: number;
  onClose: () => void;
  onApply: (refreshIntervalMinutes: number) => void;
  isPending: boolean;
}) {
  const options = [30, 60, 180, 360];

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
            <h3 className="truncate text-[15px] font-semibold">Adjust refresh cadence</h3>
            <p className="mt-1 text-xs text-secondary">
              Set a calmer refresh interval for {selectedCount} selected {selectedCount === 1 ? "feed" : "feeds"}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-1.5 text-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {options.map((minutes) => (
            <button
              key={minutes}
              onClick={() => onApply(minutes)}
              disabled={isPending}
              className="rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] px-4 py-4 text-left disabled:opacity-50"
            >
              <p className="text-sm font-semibold">{minutes} minutes</p>
              <p className="mt-1 text-xs text-secondary">
                {minutes >= 180 ? "Best for consistently slow feeds." : "Reduce refresh pressure."}
              </p>
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
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<MeResponse>(["me"]);
  const effectiveRefreshMinutes = feed.refreshIntervalMinutes ?? me?.user.settings.refreshIntervalMinutes ?? 60;
  const suggestedRefreshMinutes = getSuggestedRefreshInterval(effectiveRefreshMinutes, feed.performance);
  const updateCadence = useMutation({
    mutationFn: (refreshIntervalMinutes: number) =>
      api(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        body: JSON.stringify({ refreshIntervalMinutes }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

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
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Refresh cadence</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              Every {effectiveRefreshMinutes} minutes
            </p>
            <p className="mt-1 text-xs text-secondary">
              {feed.refreshIntervalMinutes
                ? "This feed has its own refresh cadence."
                : "This feed is using your default refresh cadence."}
            </p>
          </div>

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

          <div className="rounded-[18px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-secondary">Recent refresh speed</p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              Latest {formatDuration(feed.performance.latestDurationMs)} · Avg {formatDuration(feed.performance.averageDurationMs)}
            </p>
            <p className="mt-1 text-xs text-secondary">
              {feed.performance.slowCount24h > 0
                ? `${feed.performance.slowCount24h} slow refreshes in the last 24 hours`
                : "No slow refreshes in the last 24 hours"}
            </p>
          </div>

          {suggestedRefreshMinutes ? (
            <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">Suggested adjustment</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-50">
                This feed has been consistently slow. Try refreshing it every {suggestedRefreshMinutes} minutes instead of every {effectiveRefreshMinutes} minutes.
              </p>
              <button
                onClick={() => updateCadence.mutate(suggestedRefreshMinutes)}
                disabled={updateCadence.isPending}
                className="mt-3 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)] disabled:opacity-60"
              >
                {updateCadence.isPending ? "Applying..." : `Use ${suggestedRefreshMinutes}m cadence`}
              </button>
            </div>
          ) : null}

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
        <Link
          href={`/app/folders/${folder.id}`}
          className="group flex items-center justify-between gap-3 rounded-[24px] px-3.5 py-3.5"
          style={{ contentVisibility: "auto", containIntrinsicSize: "86px" }}
        >
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
                {folder.counts.slowFeedCount > 0 ? (
                  <>
                    <span>·</span>
                    <span className="font-medium text-amber-300">
                      {folder.counts.slowFeedCount} slow
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
  onStart,
}: {
  controller?: RefreshController;
  endpoint?: string;
  invalidate?: string[];
  onStart?: () => void;
}) {
  const fallbackController = useRefreshController(endpoint ?? "/api/refresh/all", invalidate ?? ["items"]);
  const refresh = controller || fallbackController;

  return (
    <>
      <button
        onClick={() => {
          onStart?.();
          refresh.start();
        }}
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
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-50 px-5">
          <div className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--accent)]/18 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_92%,white_8%)_0%,color-mix(in_srgb,var(--surface)_86%,black_14%)_100%)] px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.52)] ring-1 ring-white/5 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--accent)]">
                  {!refresh.status ? "Queueing refresh" : "Refreshing feeds"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-primary)]/72">
                  {refresh.status ? (
                    refresh.summary ? (
                      <>
                        {`${refresh.status.completed} of ${refresh.status.total} newly queued feeds finished`}
                        {refresh.summary.totalFeeds !== refresh.summary.queued
                          ? ` · ${refresh.summary.totalFeeds} total feeds`
                          : null}
                        {refresh.summary.skipped > 0 ? ` · ${refresh.summary.skipped} already refreshing` : null}
                        {refresh.status.failed ? ` · ${refresh.status.failed} failed` : ""}
                      </>
                    ) : (
                      `${refresh.status.completed} of ${refresh.status.total} feeds finished${refresh.status.failed ? ` · ${refresh.status.failed} failed` : ""}`
                    )
                  ) : refresh.summary ? (
                    `${refresh.summary.queued} feeds queued from ${refresh.summary.totalFeeds} total`
                  ) : (
                    "Pulling in the latest items from your subscriptions."
                  )}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--accent)]">
                {refresh.progress}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_100%,white_28%)_100%)] transition-[width] duration-500 ease-out"
                style={{ width: `${refresh.progress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

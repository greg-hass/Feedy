"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type InfiniteData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Loader2, Search, SlidersHorizontal } from "lucide-react";

import { MobileShell, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { ItemCard } from "@/components/item-card";
import { RefreshButton, useRefreshController } from "@/components/refresh-button";
import { TimelineRefreshToast } from "@/components/timeline-refresh-toast";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { computeTimelineRefreshDelta } from "@/lib/timeline-refresh";
import { flattenTimelinePages, shouldLoadNextTimelinePage } from "@/lib/timeline-infinite-scroll";
import type { MeResponse, TimelineItemsPageResponse } from "@/types/app";

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
    refetchOnWindowFocus: "always",
    refetchOnReconnect: true,
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

  const items = useInfiniteQuery({
    queryKey: ["items", "timeline", stateFilter, sourceFilter, deferredQuery.trim()],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("pageSize", "100");

      if (stateFilter !== "UNREAD") {
        params.set("stateFilter", stateFilter);
      }
      if (sourceFilter !== "ALL") {
        params.set("sourceFilter", sourceFilter);
      }
      if (deferredQuery.trim()) {
        params.set("q", deferredQuery.trim());
      }
      if (pageParam) {
        params.set("cursor", pageParam);
      }

      return api<TimelineItemsPageResponse>(`/api/items?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    staleTime: 15_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: true,
  });
  const timelineItems = useMemo(() => flattenTimelinePages(items.data?.pages), [items.data?.pages]);
  const refetchItems = items.refetch;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
  const refresh = useRefreshController("/api/refresh/all", ["items"]);
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [isBottomVisible, setIsBottomVisible] = useState(false);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
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
    pendingRefreshIdsRef.current = timelineItems.map((item) => item.id);
    pendingScrollAnchorRef.current = captureTimelineScrollAnchor(timelineFixedTop);
  }, [timelineFixedTop, timelineItems]);

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

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setIsBottomVisible(false));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsBottomVisible(entry.isIntersecting),
      { rootMargin: "300px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, timelineItems.length]);

  useEffect(() => {
    if (
      shouldLoadNextTimelinePage({
        hasMore: Boolean(hasNextPage),
        isBottomVisible,
        isFetchingNextPage,
      })
    ) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isBottomVisible, isFetchingNextPage]);

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
    if (!timelineItems.length) {
      return;
    }

    const pendingReadItemId = window.sessionStorage.getItem(timelinePendingReadStorageKey);
    if (!pendingReadItemId) {
      return;
    }

    queryClient.setQueriesData<InfiniteData<TimelineItemsPageResponse>>(
      { queryKey: ["items", "timeline"] },
      (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.map((entry) =>
                  entry.id === pendingReadItemId ? { ...entry, read: true } : entry,
                ),
              })),
            }
          : current,
    );
    window.sessionStorage.removeItem(timelinePendingReadStorageKey);
  }, [queryClient, timelineItems]);

  useLayoutEffect(() => {
    const previousIds = pendingRefreshIdsRef.current;
    if (!previousIds || !timelineItems.length || refresh.active || items.isFetching || items.isFetchingNextPage) {
      return;
    }

    const nextIds = timelineItems.map((item) => item.id);
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
  }, [items.isFetching, items.isFetchingNextPage, refresh.active, timelineItems]);

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

    // Prefer the saved pixel offset when available; element positioning remains
    // as a fallback for older anchors that only recorded an item id.
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
  }, [items.isLoading, scrollStorageKey, timelineAnchorStorageKey, timelineFixedTop, timelineItems]);

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
          <IconButton
            variant={searchOpen || query.trim() ? "active" : "default"}
            onClick={() => {
              if (searchOpen && !query.trim()) {
                setSearchOpen(false);
                return;
              }
              setSearchOpen(true);
            }}
            aria-label={searchOpen || query.trim() ? "Hide article search" : "Search articles"}
          >
            <Search className="size-4" />
          </IconButton>
          <IconButton
            variant={filtersOpen || filtersActive ? "active" : "default"}
            onClick={() => setFiltersOpen((current) => !current)}
            aria-label={filtersOpen ? "Hide timeline filters" : "Show timeline filters"}
          >
            <SlidersHorizontal className="size-4" />
          </IconButton>
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
          <div className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.03)]">
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
                    className="h-12 w-full rounded-[20px] bg-[var(--surface-strong)] px-4 text-sm font-medium text-[var(--text-primary)]"
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
                    className="h-12 w-full rounded-[20px] bg-[var(--surface-strong)] px-4 text-sm font-medium text-[var(--text-primary)]"
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
                <div className="flex items-center gap-3 rounded-[20px] bg-[var(--surface-strong)] px-3.5">
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
      ) : timelineItems.length ? (
        <div
          className="space-y-3"
          style={
            timelineContentPullUp
              ? { marginTop: `-${timelineContentPullUp}px`, paddingTop: "1px" }
              : undefined
          }
        >
          {timelineItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              searchQuery={deferredQuery}
            />
          ))}
          <div ref={bottomSentinelRef} aria-hidden className="h-px w-full" />
          {items.isFetchingNextPage ? (
            <div className="flex items-center justify-center pb-2 pt-1 text-[11px] text-secondary">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading more items
            </div>
          ) : null}
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
            action={
              !deferredQuery.trim() && stateFilter === "UNREAD" ? (
                <Link
                  href="/app/discover"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-contrast)] shadow-[0_12px_28px_rgba(var(--accent-rgb),0.22)]"
                >
                  Discover feeds
                </Link>
              ) : null
            }
          />
        </div>
      )}
    </MobileShell>
  );
}

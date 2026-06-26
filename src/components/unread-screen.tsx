"use client";

import Link from "next/link";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type InfiniteData,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Bookmark, Loader2, Search, SlidersHorizontal } from "lucide-react";

import {
	MobileShell,
	LoadingSkeleton,
	ErrorState,
	EmptyState,
} from "@/components/app-shell";
import { ItemCard } from "@/components/item-card";
import { usePullToRefresh } from "@/components/use-pull-to-refresh";
import { useScrollRestoration } from "@/components/use-scroll-restoration";
import { useTimelineFilters } from "@/components/use-timeline-filters";
import { useRefreshController } from "@/components/refresh-button";
import { TimelineRefreshToast } from "@/components/timeline-refresh-toast";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { computeTimelineRefreshDelta } from "@/lib/timeline-refresh";
import {
	flattenTimelinePages,
	shouldLoadNextTimelinePage,
} from "@/lib/timeline-infinite-scroll";
import type { MeResponse, TimelineItemsPageResponse } from "@/types/app";

function captureTimelineScrollAnchor(timelineFixedTop: number) {
	const elements = Array.from(
		document.querySelectorAll<HTMLElement>("[data-timeline-item-id]"),
	);
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

function getTimelineRefreshFingerprint(
	feeds: MeResponse["navigation"]["feeds"],
) {
	return feeds
		.map(
			(feed) =>
				`${feed.id}:${feed.lastSuccessfulRefreshAt ?? ""}:${feed.lastRefreshedAt ?? ""}:${feed.lastFailureAt ?? ""}`,
		)
		.join("|");
}

export function UnreadScreen() {
	const timelineAnchorStorageKey = "feedy-timeline-anchor-item";
	const timelinePendingReadStorageKey = "feedy-timeline-pending-read";
	const [timelineFixedTop, setTimelineFixedTop] = useState(95);
	const [timelinePanelHeight, setTimelinePanelHeight] = useState(0);
	const [refreshToast, setRefreshToast] = useState<{
		count: number;
		jumpTargetId: string;
	} | null>(null);
	const timelinePanelRef = useRef<HTMLElement | null>(null);
	const pendingRefreshIdsRef = useRef<string[] | null>(null);
	const pendingScrollAnchorRef = useRef<{ itemId: string; top: number } | null>(
		null,
	);
	const lastRefreshFingerprintRef = useRef<string | null>(null);
	const refreshStartRef = useRef<(() => void) | null>(null);

	// Extracted hooks
	const {
		stateFilter,
		setStateFilter,
		sourceFilter,
		setSourceFilter,
		filtersOpen,
		setFiltersOpen,
		searchOpen,
		setSearchOpen,
		query,
		setQuery,
		filtersActive,
		timelinePanelOpen,
	} = useTimelineFilters();

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

	const items = useInfiniteQuery({
		queryKey: [
			"items",
			"timeline",
			stateFilter,
			sourceFilter,
			deferredQuery.trim(),
		],
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
		getNextPageParam: (lastPage) =>
			lastPage.hasMore ? lastPage.nextCursor : undefined,
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});

	const timelineItems = useMemo(
		() => flattenTimelinePages(items.data?.pages),
		[items.data?.pages],
	);
	const refetchItems = items.refetch;
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
	const refresh = useRefreshController("/api/refresh/all", ["items"]);
	const queryClient = useQueryClient();

	const scrollStorageKey = `feedy-timeline-scroll:${stateFilter}:${sourceFilter}`;
	const timelineSectionGap = 12;
	const timelineControlsTopGap = timelineSectionGap;
	const timelineControlsBottomGap = timelineSectionGap;
	const timelineContentPullUp =
		filtersOpen && !searchOpen && !query.trim() ? 9 : 0;
	const timelineControlsPanelHeight = timelinePanelOpen
		? timelinePanelHeight
		: 0;
	const refreshFingerprint = me.data?.navigation.feeds
		? getTimelineRefreshFingerprint(me.data.navigation.feeds)
		: null;

	const captureRefreshSnapshot = useCallback(() => {
		pendingRefreshIdsRef.current = timelineItems.map((item) => item.id);
		pendingScrollAnchorRef.current =
			captureTimelineScrollAnchor(timelineFixedTop);
	}, [timelineFixedTop, timelineItems]);

	const startRefresh = useCallback(() => {
		captureRefreshSnapshot();
		refreshStartRef.current?.();
	}, [captureRefreshSnapshot]);

	// Scroll restoration (extracted hook)
	useScrollRestoration({
		scrollStorageKey,
		anchorStorageKey: timelineAnchorStorageKey,
		timelineFixedTop,
		isItemsLoading: items.isLoading,
		timelineItems,
	});

	// Pull-to-refresh (extracted hook)
	const { pullDistance } = usePullToRefresh({
		isRefreshActive: refresh.active,
		onRefresh: startRefresh,
		onPullCancel: () => {
			void refetchItems();
			void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
		},
	});

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
	}, [
		captureRefreshSnapshot,
		refresh.active,
		refreshFingerprint,
		refetchItems,
	]);

	useEffect(() => {
		const updateHeaderOffset = () => {
			const header = document.querySelector<HTMLElement>(
				"[data-mobile-shell-header='true']",
			);
			const nextTop = header?.offsetHeight ?? 95;
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

	// Infinite scroll sentinel
	const [isBottomVisible, setIsBottomVisible] = useState(false);
	const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

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

	// Pending read state from reader page
	useEffect(() => {
		if (!timelineItems.length) {
			return;
		}

		const pendingReadItemId = window.sessionStorage.getItem(
			timelinePendingReadStorageKey,
		);
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
									entry.id === pendingReadItemId
										? { ...entry, read: true }
										: entry,
								),
							})),
						}
					: current,
		);
		window.sessionStorage.removeItem(timelinePendingReadStorageKey);
	}, [queryClient, timelineItems]);

	// Refresh delta toast
	useLayoutEffect(() => {
		const previousIds = pendingRefreshIdsRef.current;
		if (
			!previousIds ||
			!timelineItems.length ||
			refresh.active ||
			items.isFetching ||
			items.isFetchingNextPage
		) {
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
			const element = document.querySelector<HTMLElement>(
				`[data-timeline-item-id="${anchor.itemId}"]`,
			);
			if (element) {
				const nextTop = element.getBoundingClientRect().top;
				window.scrollBy({ top: nextTop - anchor.top, behavior: "auto" });
			}
		}

		setRefreshToast({
			count: delta.newCount,
			jumpTargetId: delta.jumpTargetId ?? nextIds[0],
		});
	}, [
		items.isFetching,
		items.isFetchingNextPage,
		refresh.active,
		timelineItems,
	]);

	return (
		<MobileShell
			title="Timeline"
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
						aria-label={
							searchOpen || query.trim()
								? "Hide article search"
								: "Search articles"
						}
					>
						<Search className="size-4" />
					</IconButton>
					<IconButton
						variant={filtersOpen || filtersActive ? "active" : "default"}
						onClick={() => setFiltersOpen((current) => !current)}
						aria-label={
							filtersOpen ? "Hide timeline filters" : "Show timeline filters"
						}
					>
						<SlidersHorizontal className="size-4" />
					</IconButton>
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

					const element = document.querySelector<HTMLElement>(
						`[data-timeline-item-id="${targetId}"]`,
					);
					element?.scrollIntoView({ block: "start", behavior: "smooth" });
					setRefreshToast(null);
				}}
				onDismiss={() => setRefreshToast(null)}
			/>

			<div
				className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
				style={{
					height:
						pullDistance > 0 && !refresh.active
							? `${Math.max(0, pullDistance - 8)}px`
							: "0px",
					marginBottom: pullDistance > 0 && !refresh.active ? "8px" : "0px",
					opacity: pullDistance > 0 && !refresh.active ? 1 : 0,
				}}
			>
				<div className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.03)]">
					{pullDistance >= 56 ? "Release to refresh feeds" : "Pull to refresh"}
				</div>
			</div>

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
						style={{
							paddingTop: `${timelineControlsTopGap}px`,
							paddingBottom: `${timelineControlsBottomGap}px`,
						}}
					>
						{filtersOpen ? (
							<div className="grid w-full grid-cols-2 gap-3">
								<label className="block">
									<span className="sr-only">Timeline state</span>
									<select
										value={stateFilter}
										onChange={(event) =>
											setStateFilter(
												event.target.value as "UNREAD" | "ALL" | "READ",
											)
										}
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
										onChange={(event) =>
											setSourceFilter(
												event.target.value as
													| "ALL"
													| "RSS"
													| "REDDIT"
													| "YOUTUBE",
											)
										}
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
				<ErrorState
					message={items.error.message}
					onRetry={() => items.refetch()}
				/>
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
						<ItemCard key={item.id} item={item} searchQuery={deferredQuery} />
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

"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Search } from "lucide-react";

import {
	EmptyState,
	ErrorState,
	LoadingSkeleton,
	MobileShell,
} from "@/components/app-shell";
import { ItemCard } from "@/components/item-card";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import type { ItemRecord } from "@/types/app";

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
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});
	const { refetch: refetchSavedItems } = items;

	useEffect(() => {
		const isStandalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			Boolean(
				(window.navigator as Navigator & { standalone?: boolean }).standalone,
			);

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
				void refetchSavedItems();
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
	}, [refetchSavedItems, queryClient]);

	return (
		<MobileShell
			title="Saved"
			actions={
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
							? "Hide saved search"
							: "Search saved items"
					}
				>
					<Search className="size-4" />
				</IconButton>
			}
		>
			{pullDistance > 0 ? (
				<div className="mb-2 flex items-center justify-center">
					<div className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[11px] font-medium text-secondary shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.03)]">
						Pull to refresh saved items
					</div>
				</div>
			) : null}
			{searchOpen || query.trim() ? (
				<section className="mb-3">
					<div data-flat-control="true" className="flex items-center gap-3 rounded-[22px] border border-[var(--accent)]/20 bg-[var(--surface-strong)] px-3.5">
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
				<ErrorState
					message={items.error.message}
					onRetry={() => items.refetch()}
				/>
			) : items.data?.length ? (
				<div className="space-y-3">
					{items.data.map((item) => (
						<ItemCard key={item.id} item={item} searchQuery={deferredQuery} />
					))}
				</div>
			) : (
				<EmptyState
					title={
						deferredQuery.trim() ? "No saved matches" : "Nothing saved yet"
					}
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

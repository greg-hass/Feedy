"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FeedAvatar } from "@/components/feed-avatar";
import { api } from "@/lib/client";
import {
	updateItemStateCaches,
	updateReaderStateCache,
} from "@/lib/item-state-cache";
import {
	selectReaderHtml,
	shouldRenderReaderLeadMedia,
} from "@/lib/reader-content";
import { vibrateIfSupported } from "@/lib/tab-interactions";
import type { ItemRecord } from "@/types/app";

export default function ReaderPage() {
	const params = useParams<{ itemId: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
	const [optimisticBookmarked, setOptimisticBookmarked] = useState<
		boolean | null
	>(null);
	const [scheduledReaderRefreshFor, setScheduledReaderRefreshFor] = useState<
		string | null
	>(null);
	const timelinePendingReadStorageKey = "feedy-timeline-pending-read";
	const readerTopInset = "calc(max(12px, env(safe-area-inset-top)) + 12px)";

	const goBack = () => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			router.back();
			return;
		}

		router.replace("/app/unread");
	};

	const forceScrollTop = () => {
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
	};

	const shareArticle = async (title: string, canonicalUrl: string) => {
		if (typeof navigator.share === "function") {
			try {
				await navigator.share({ title, url: canonicalUrl });
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
			}
		}

		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(canonicalUrl);
				return;
			} catch {
				// Fall through to the manual prompt fallback below.
			}
		}

		window.prompt("Copy link", canonicalUrl);
	};

	const item = useQuery({
		queryKey: ["reader", params.itemId],
		queryFn: () => api<ItemRecord>(`/api/items/${params.itemId}/reader`),
	});

	const isBookmarked = optimisticBookmarked ?? item.data?.bookmarked ?? false;

	const state = useMutation({
		mutationFn: (body: { read?: boolean; bookmarked?: boolean }) =>
			api(`/api/items/${params.itemId}/state`, {
				method: "POST",
				body: JSON.stringify(body),
			}),
		onMutate: async (variables) => {
			if (typeof variables.bookmarked === "boolean") {
				setOptimisticBookmarked(variables.bookmarked);
				setBookmarkAnimating(true);
			}
		},
		onSuccess: async (_result, variables) => {
			if (variables.read === true && typeof window !== "undefined") {
				window.sessionStorage.setItem(
					timelinePendingReadStorageKey,
					params.itemId,
				);
			}
			updateItemStateCaches(queryClient, params.itemId, variables, {
				skipTimelineReadPatch: true,
			});
			updateReaderStateCache(queryClient, params.itemId, variables);
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["items"] });
		},
		onError: () => {
			setOptimisticBookmarked(null);
		},
		onSettled: () => {
			setOptimisticBookmarked(null);
		},
	});

	useLayoutEffect(() => {
		// Reset scroll on item navigation. One synchronous + one rAF is enough
		// to win against Next.js + the browser's own scroll-restoration logic.
		// Previously this fired 5 resets AND re-fired when `item.data?.id`
		// arrived, which meant up to 10 synchronous scroll writes per reader
		// open — visible jank on tap on mid-tier mobile.
		forceScrollTop();
		const frame = window.requestAnimationFrame(forceScrollTop);
		return () => window.cancelAnimationFrame(frame);
	}, [params.itemId]);

	useEffect(() => {
		if (item.data && !item.data.read && !state.isPending) {
			state.mutate({ read: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item.data?.id]);

	useEffect(() => {
		if (!bookmarkAnimating) {
			return;
		}

		const timeout = window.setTimeout(() => setBookmarkAnimating(false), 320);
		return () => window.clearTimeout(timeout);
	}, [bookmarkAnimating]);

	useEffect(() => {
		const data = item.data;
		if (
			!data ||
			scheduledReaderRefreshFor === data.id ||
			selectReaderHtml(data) ||
			!data.canonicalUrl
		) {
			return;
		}

		setScheduledReaderRefreshFor(data.id);
		const timeout = window.setTimeout(() => {
			void queryClient.invalidateQueries({ queryKey: ["reader", data.id] });
		}, 2500);

		return () => window.clearTimeout(timeout);
	}, [item.data, queryClient, scheduledReaderRefreshFor]);

	if (item.isLoading) {
		return (
			<div
				className="min-h-screen w-full pb-10"
				style={{ paddingTop: readerTopInset }}
			>
				<div className="animate-pulse px-5">
					<div className="flex items-center gap-2">
						<div className="size-7 rounded-full bg-[var(--surface-muted)]" />
						<div className="h-3 w-24 rounded-full bg-[var(--surface-muted)]" />
					</div>
					<div className="mt-4 h-7 w-3/4 rounded-full bg-[var(--surface-muted)]" />
					<div className="mt-3 h-4 w-1/2 rounded-full bg-[var(--surface-muted)]" />
					<div className="mt-8 space-y-2">
						{[60, 80, 95, 70, 85, 50, 90, 75].map((width, i) => (
							<div
								key={i}
								className="h-4 rounded-full bg-[var(--surface-muted)]"
								style={{ width: `${width}%` }}
							/>
						))}
					</div>
				</div>
			</div>
		);
	}

	if (!item.data) {
		return (
			<div
				className="min-h-screen w-full px-5 pb-10"
				style={{ paddingTop: readerTopInset }}
			>
				<div className="py-12 text-center">
					<p className="text-sm text-secondary">Failed to load article.</p>
					<Button onClick={goBack} className="mt-4">
						Go back
					</Button>
				</div>
			</div>
		);
	}

	const data = item.data;
	const readerHtml = selectReaderHtml(data);
	const showLeadMedia = shouldRenderReaderLeadMedia(data);

	return (
		<div
			className="min-h-screen w-full pb-10"
			style={{ overflowAnchor: "none" }}
		>
			{/* Sticky reader toolbar — stays pinned to the top while scrolling */}
			<div
				className="sticky top-0 z-30"
				style={{
					backgroundColor: "var(--app-bg)",
					paddingTop: readerTopInset,
					paddingBottom: "12px",
				}}
			>
				<div className="flex items-center justify-between px-4">
					<IconButton
						variant="default"
						onClick={goBack}
						aria-label="Go back"
						className="text-[var(--accent)]"
					>
						<ArrowLeft className="size-4" />
					</IconButton>
					<div className="flex items-center gap-2">
						<IconButton
							variant="default"
							className={isBookmarked ? "text-[var(--accent)]" : ""}
							onClick={() => {
								vibrateIfSupported(window.navigator, 10);
								state.mutate({ bookmarked: !isBookmarked });
							}}
							aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
						>
							<Bookmark
								className={`size-4 ${bookmarkAnimating ? "bookmark-flip" : ""}`}
								fill={isBookmarked ? "currentColor" : "none"}
							/>
						</IconButton>
						{data.canonicalUrl && (
							<>
								<IconButton
									onClick={() => {
										if (!data.canonicalUrl) {
											return;
										}
										void shareArticle(data.title, data.canonicalUrl);
									}}
									aria-label="Share article"
								>
									<Share2 className="size-4" />
								</IconButton>
								<a
									href={data.canonicalUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)]"
									aria-label="Open original article"
								>
									<ExternalLink className="size-4" />
								</a>
							</>
						)}
					</div>
				</div>
			</div>

			<div className="px-5">
				<div className="flex items-center gap-2.5">
					<FeedAvatar
						feedId={data.feed.id}
						title={data.feed.label || data.feed.title}
						size={32}
					/>
					<p className="text-xs uppercase tracking-[0.18em] text-secondary">
						{data.feed.label || data.feed.title}
					</p>
				</div>

				<h1 className="mt-2 text-[1.4rem] font-semibold leading-[1.2] tracking-[-0.02em]">
					{data.title}
				</h1>

				<div className="mt-3 flex items-center justify-between text-xs text-secondary">
					<span>
						{new Date(data.publishedAt || 0).toLocaleDateString("en-GB", {
							day: "numeric",
							month: "short",
							year: "numeric",
						})}
					</span>
					<span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
						{data.feed.sourceType.replaceAll("_", " ")}
					</span>
				</div>

				{data.youtubeVideoId && (
					<div className="mt-5 overflow-hidden rounded-[20px] border border-subtle">
						<iframe
							src={`https://www.youtube.com/embed/${data.youtubeVideoId}?playsinline=1&rel=0`}
							title={data.title}
							className="aspect-video w-full"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							allowFullScreen
						/>
					</div>
				)}

				{showLeadMedia && (
					<div className="mt-5 overflow-hidden rounded-[20px] border border-subtle">
						<Image
							src={data.mediaUrl || ""}
							alt=""
							width={1200}
							height={675}
							unoptimized
							className="h-auto w-full"
							loading="lazy"
						/>
					</div>
				)}

				{readerHtml ? (
					<article
						className="reader-content mt-6"
						dangerouslySetInnerHTML={{
							__html: readerHtml,
						}}
					/>
				) : data.summary ? (
					<p className="mt-6 text-[15px] leading-relaxed text-secondary">
						{data.summary}
					</p>
				) : null}
			</div>
		</div>
	);
}

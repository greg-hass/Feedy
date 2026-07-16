"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bookmark, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { SearchHighlight } from "@/components/search-highlight";
import { api } from "@/lib/client";
import {
	getYouTubeThumbnailUrls,
	isLikelyLowResolutionYouTubePlaceholder,
} from "@/lib/feed/youtube-thumbnail";
import {
	updateItemStateCaches,
	updateReaderStateCache,
} from "@/lib/item-state-cache";
import { vibrateIfSupported } from "@/lib/tab-interactions";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord } from "@/types/app";
import {
	getSavedYouTubeProgressSeconds,
	YouTubeInlinePlayer,
} from "@/components/youtube-inline-player";

function formatResumeTime(seconds: number) {
	const totalSeconds = Math.max(0, Math.floor(seconds));
	const mins = Math.floor(totalSeconds / 60);
	const secs = totalSeconds % 60;
	return `${mins}:${String(secs).padStart(2, "0")}`;
}

export const ItemCard = memo(function ItemCard({
	item,
	searchQuery = "",
}: {
	item: ItemRecord;
	searchQuery?: string;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [imageLoaded, setImageLoaded] = useState(false);
	const [thumbnailIndex, setThumbnailIndex] = useState(0);
	const [internalPlayInline, setInternalPlayInline] = useState(false);
	const [inlinePlayerLoading, setInlinePlayerLoading] = useState(false);
	const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
	const [optimisticBookmarked, setOptimisticBookmarked] = useState<
		boolean | null
	>(null);
	const [resumeSeconds, setResumeSeconds] = useState(() =>
		item.youtubeVideoId
			? getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId)
			: 0,
	);
	const isYouTube = item.feed.sourceType.includes("YOUTUBE");
	const youtubeThumbnailUrls = item.youtubeVideoId
		? getYouTubeThumbnailUrls(item.youtubeVideoId, {
				existingUrl: item.mediaUrl,
				isShort: item.youtubeIsShort,
			})
		: null;
	const youtubeThumbnailAspectClass = item.youtubeIsShort
		? "aspect-[9/16]"
		: "aspect-video";
	const playInline = internalPlayInline;
	const hoverCardClass =
		"[@media(hover:hover)]:hover:border-[var(--accent)]/30 [@media(hover:hover)]:hover:shadow-[0_12px_32px_rgba(0,0,0,0.5)]";
	const hoverScaleClass = "[@media(hover:hover)]:group-hover:scale-105";
	const hoverTextClass =
		"[@media(hover:hover)]:group-hover:text-[var(--accent)]";
	const hoverOpacityClass = "[@media(hover:hover)]:group-hover:opacity-100";
	const hoverButtonScaleClass = "[@media(hover:hover)]:group-hover:scale-110";

	const rememberTimelineAnchor = () => {
		window.sessionStorage.setItem(
			"feedy-timeline-anchor-item",
			JSON.stringify({
				itemId: item.id,
				scrollY: Math.max(0, Math.round(window.scrollY)),
			}),
		);
	};

	const resetScrollBeforeNavigate = () => {
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
	};

	const prefetchReader = () => {
		if (isYouTube) {
			return;
		}

		void queryClient.prefetchQuery({
			queryKey: ["reader", item.id],
			queryFn: () => api<ItemRecord>(`/api/items/${item.id}/reader`),
			staleTime: 30_000,
		});
	};

	const openReader = () => {
		rememberTimelineAnchor();
		resetScrollBeforeNavigate();
		router.push(`/reader/${item.id}`);
	};

	const navigateToReader = (event: React.MouseEvent<HTMLElement>) => {
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.button !== 0
		) {
			return;
		}

		event.preventDefault();
		openReader();
	};

	const navigateFromCard = (event: React.MouseEvent<HTMLElement>) => {
		if (isYouTube || event.defaultPrevented) {
			return;
		}

		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}

		if (target.closest("a, button, [data-card-action]")) {
			return;
		}

		navigateToReader(event);
	};

	useEffect(() => {
		if (!bookmarkAnimating) {
			return;
		}

		const timeout = window.setTimeout(() => setBookmarkAnimating(false), 320);
		return () => window.clearTimeout(timeout);
	}, [bookmarkAnimating]);

	const isBookmarked = optimisticBookmarked ?? item.bookmarked;

	const updateState = useMutation({
		mutationFn: (body: { read?: boolean; bookmarked?: boolean }) =>
			api(`/api/items/${item.id}/state`, {
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
			updateItemStateCaches(queryClient, item.id, variables);
			updateReaderStateCache(queryClient, item.id, variables);
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

	const thumbnailUrl =
		isYouTube && item.youtubeVideoId
			? (youtubeThumbnailUrls?.[thumbnailIndex] ?? null)
			: item.mediaUrl;
	const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
	const itemTitle = decodeHtmlEntities(item.title);
	const applyNextYouTubeThumbnailFallback = () => {
		if (
			youtubeThumbnailUrls &&
			thumbnailIndex < youtubeThumbnailUrls.length - 1
		) {
			setImageLoaded(false);
			setThumbnailIndex((current) =>
				Math.min(current + 1, youtubeThumbnailUrls.length - 1),
			);
			return true;
		}

		return false;
	};

	return (
		<article
			data-timeline-item-id={item.id}
			onClick={navigateFromCard}
			onPointerEnter={prefetchReader}
			onFocus={prefetchReader}
			className={`group feed-item-card overflow-hidden transition-all duration-300 ${!isYouTube ? "cursor-pointer" : ""} ${hoverCardClass}`}
		>
			{thumbnailUrl &&
				(isYouTube && item.youtubeVideoId ? (
					<div className="relative overflow-hidden">
						{playInline ? (
							<>
								<YouTubeInlinePlayer
									itemId={item.id}
									videoId={item.youtubeVideoId}
									title={itemTitle}
									startSeconds={resumeSeconds}
									onReady={() => setInlinePlayerLoading(false)}
									onProgressChange={(seconds) => {
										setResumeSeconds(seconds);
									}}
									onMeaningfulPlayback={() => {
										if (!item.read) {
											updateState.mutate({ read: true });
										}
									}}
								/>
								{inlinePlayerLoading ? (
									<div className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--surface)_10%,var(--app-bg)_90%)]">
										<div className="flex flex-col items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)]/90 px-4 py-3 text-center text-[var(--text-primary)] backdrop-blur-sm">
											<div className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface-muted)]" />
											<p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">
												Loading player...
											</p>
										</div>
									</div>
								) : null}
							</>
						) : (
							<button
								type="button"
								onClick={() => {
									setInlinePlayerLoading(true);
									setInternalPlayInline(true);
								}}
								className="relative block w-full overflow-hidden text-left"
								aria-label={`Play ${itemTitle} inline`}
							>
								<div
									className={`relative w-full bg-surface-muted ${youtubeThumbnailAspectClass}`}
								>
									<Image
										src={thumbnailUrl}
										alt={itemTitle}
										fill
										sizes="(max-width: 448px) 100vw, 448px"
										unoptimized
										className={`h-full w-full object-cover transition-all duration-500 ${hoverScaleClass} ${
											imageLoaded ? "opacity-100" : "opacity-0"
										}`}
										loading="lazy"
										onLoad={(event) => {
											if (
												isLikelyLowResolutionYouTubePlaceholder(
													thumbnailUrl,
													event.currentTarget,
												)
											) {
												applyNextYouTubeThumbnailFallback();
												return;
											}
											setImageLoaded(true);
										}}
										onError={() => {
											if (applyNextYouTubeThumbnailFallback()) {
												return;
											}
											setImageLoaded(true);
										}}
									/>
									{!imageLoaded && <div className="absolute inset-0 shimmer" />}
								</div>
								<div
									className={`absolute inset-0 flex items-center justify-center opacity-90 transition-opacity duration-300 ${hoverOpacityClass}`}
								>
									<div
										className={`flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface)]/95 shadow-2xl transition-transform duration-300 ${hoverButtonScaleClass}`}
									>
										<Play
											className="ml-1 h-6 w-6 text-[var(--text-primary)]"
											fill="currentColor"
										/>
									</div>
								</div>
								{resumeSeconds > 1 ? (
									<div className="absolute left-3 top-3 rounded-full bg-[var(--accent)]/92 px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-contrast)] shadow-[0_12px_28px_rgba(var(--accent-rgb),0.24)]">
										Resume {formatResumeTime(resumeSeconds)}
									</div>
								) : null}
							</button>
						)}
					</div>
				) : (
					<Link
						href={`/reader/${item.id}`}
						onPointerDown={rememberTimelineAnchor}
						onClick={navigateToReader}
						className="relative block overflow-hidden"
					>
						<div className="relative aspect-video w-full bg-surface-muted">
							<Image
								src={thumbnailUrl}
								alt={itemTitle}
								fill
								sizes="(max-width: 448px) 100vw, 448px"
								unoptimized
								className={`h-full w-full object-cover transition-all duration-500 ${hoverScaleClass} ${
									imageLoaded ? "opacity-100" : "opacity-0"
								}`}
								loading="lazy"
								onLoad={(event) => {
									if (
										isLikelyLowResolutionYouTubePlaceholder(
											thumbnailUrl,
											event.currentTarget,
										)
									) {
										applyNextYouTubeThumbnailFallback();
										return;
									}
									setImageLoaded(true);
								}}
								onError={() => {
									if (applyNextYouTubeThumbnailFallback()) {
										return;
									}
									setImageLoaded(true);
								}}
							/>
							{!imageLoaded && <div className="absolute inset-0 shimmer" />}
						</div>
					</Link>
				))}

			<div className="p-4">
				<div className="flex items-center gap-2.5">
					<Image
						src={`/api/icons/${item.feed.id}?v=3`}
						alt=""
						width={20}
						height={20}
						className="size-5 shrink-0 rounded-[6px] object-cover"
						unoptimized
						onError={(e) => {
							(e.target as HTMLImageElement).style.display = "none";
						}}
					/>
					<p className="truncate text-[12px] font-medium text-secondary">
						{feedTitle}
					</p>
				</div>

				<Link
					href={`/reader/${item.id}`}
					onPointerDown={rememberTimelineAnchor}
					onClick={navigateToReader}
				>
					<h3
						className={`mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 transition-colors duration-200 ${hoverTextClass} ${item.read ? "opacity-50" : ""}`}
					>
						<SearchHighlight text={itemTitle} query={searchQuery} />
					</h3>
				</Link>

				{item.summary && !thumbnailUrl && (
					<p
						className={`mt-1.5 text-[13px] leading-relaxed text-secondary line-clamp-2 ${item.read ? "opacity-50" : ""}`}
					>
						<SearchHighlight
							text={decodeHtmlEntities(item.summary)}
							query={searchQuery}
						/>
					</p>
				)}

				<div className="mt-3 flex items-center justify-between">
					<div className="flex items-center gap-1.5 text-[11px]">
						<span className="font-medium text-[var(--text-secondary)]">
							{relativeTime(item.publishedAt)}
						</span>
						{!isYouTube && (
							<>
								<span className="text-[var(--border)]">·</span>
								<span className="text-[var(--text-secondary)]">
									{item.feed.sourceType.replace("_RSS", "").replace("_", " ")}
								</span>
							</>
						)}
					</div>

					<div className="flex items-center gap-1.5">
						<IconButton
							variant="default"
							size="md"
							className={isBookmarked ? "text-[var(--accent)]" : ""}
							onClick={() => {
								vibrateIfSupported(window.navigator, 10);
								updateState.mutate({ bookmarked: !isBookmarked });
							}}
							aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
							data-card-action
						>
							<Bookmark
								className={`size-[18px] ${bookmarkAnimating ? "bookmark-flip" : ""}`}
								fill={isBookmarked ? "currentColor" : "none"}
							/>
						</IconButton>

						{item.canonicalUrl && (
							<a
								href={item.canonicalUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)]"
								data-card-action
							>
								<ExternalLink className="size-[18px]" />
							</a>
						)}
					</div>
				</div>
			</div>
		</article>
	);
});

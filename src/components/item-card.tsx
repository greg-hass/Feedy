"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bookmark, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { useMe } from "@/components/app-shell";
import { SearchHighlight } from "@/components/search-highlight";
import { FeedAvatar } from "@/components/feed-avatar";
import { api } from "@/lib/client";
import { getFeedFolderColorMap } from "@/lib/folder-color";
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

/** Feed-row dot colouring per folder, shared by cards and the reader. */
export function useFolderColorMap() {
	const me = useMe();
	const navigation = me.data?.navigation;
	return useMemo(() => getFeedFolderColorMap(navigation), [navigation]);
}

function FolderDot({ color }: { color: string }) {
	return (
		<span
			aria-hidden="true"
			className="size-1 shrink-0 rounded-full"
			style={{ backgroundColor: color }}
		/>
	);
}

/**
 * Navigation, prefetching, and read/bookmark state shared by every card
 * presentation (media card and compact row).
 */
function useItemCardController(item: ItemRecord) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const me = useMe();
	const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
	const [optimisticBookmarked, setOptimisticBookmarked] = useState<
		boolean | null
	>(null);

	const isYouTube = item.feed.sourceType.includes("YOUTUBE");

	const rememberTimelineAnchor = () => {
		window.sessionStorage.setItem(
			"feedy-timeline-anchor-item",
			JSON.stringify({
				itemId: item.id,
				scrollY: Math.max(0, Math.round(window.scrollY)),
				viewportTop: document
					.querySelector<HTMLElement>(`[data-timeline-item-id="${item.id}"]`)
					?.getBoundingClientRect().top,
			}),
		);
	};

	const prefetchReader = () => {
		if (isYouTube || me.data?.user.settings.readerOpenOriginalByDefault) {
			return;
		}

		void queryClient.prefetchQuery({
			queryKey: ["reader", item.id],
			queryFn: () => api<ItemRecord>(`/api/items/${item.id}/reader`),
			staleTime: 30_000,
		});
	};

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

	const openReader = () => {
		rememberTimelineAnchor();

		// "Safari" article view: mark read immediately and hand off to the
		// original site. Same-window navigation lets iOS open Safari or the
		// native app without leaving a blank in-app browser window behind.
		if (me.data?.user.settings.readerOpenOriginalByDefault && item.canonicalUrl) {
			if (!item.read) {
				updateState.mutate({ read: true });
			}
			window.location.assign(item.canonicalUrl);
			return;
		}

		router.push(`/reader/${item.id}`, { scroll: false });
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

	const navigateFromCard = (
		event: React.MouseEvent<HTMLElement>,
		{ allowYouTube = false }: { allowYouTube?: boolean } = {},
	) => {
		if ((!allowYouTube && isYouTube) || event.defaultPrevented) {
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

	const toggleBookmarked = () => {
		vibrateIfSupported(window.navigator, 10);
		updateState.mutate({ bookmarked: !isBookmarked });
	};

	return {
		rememberTimelineAnchor,
		prefetchReader,
		openReader,
		navigateToReader,
		navigateFromCard,
		isBookmarked,
		bookmarkAnimating,
		toggleBookmarked,
		updateState,
	};
}

export const ItemCard = memo(function ItemCard({
	item,
	searchQuery = "",
}: {
	item: ItemRecord;
	searchQuery?: string;
}) {
	const {
		rememberTimelineAnchor,
		prefetchReader,
		navigateToReader,
		navigateFromCard,
		isBookmarked,
		bookmarkAnimating,
		toggleBookmarked,
		updateState,
	} = useItemCardController(item);
	const folderColorMap = useFolderColorMap();
	const [imageLoaded, setImageLoaded] = useState(false);
	const [thumbnailIndex, setThumbnailIndex] = useState(0);
	const [internalPlayInline, setInternalPlayInline] = useState(false);
	const [inlinePlayerLoading, setInlinePlayerLoading] = useState(false);
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

	const thumbnailUrl =
		isYouTube && item.youtubeVideoId
			? (youtubeThumbnailUrls?.[thumbnailIndex] ?? null)
			: item.mediaUrl;
	const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
	const itemTitle = decodeHtmlEntities(item.title);
	const folderColor = folderColorMap.get(item.feed.id) ?? null;
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
							<div
								className={`relative w-full bg-surface-muted ${youtubeThumbnailAspectClass}`}
							>
								{/* The thumbnail stays visible until the player is ready, so
								 * the click never reveals a loading placeholder. */}
								<Image
									src={thumbnailUrl}
									alt={itemTitle}
									fill
									sizes="(max-width: 448px) 100vw, 448px"
									unoptimized
									className={`h-full w-full object-cover ${
										imageLoaded ? "opacity-100" : "opacity-0"
									}`}
									loading="lazy"
								/>
								{!imageLoaded && <div className="absolute inset-0 shimmer" />}
								<div
									className={`absolute inset-0 z-10 ${
										inlinePlayerLoading ? "invisible" : ""
									}`}
								>
									<YouTubeInlinePlayer
										itemId={item.id}
										videoId={item.youtubeVideoId}
										title={itemTitle}
										variant="mount"
										className="h-full w-full"
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
								</div>
							</div>
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
					<FeedAvatar
						feedId={item.feed.id}
						title={item.feed.label || item.feed.title}
						iconHintUrl={item.feed.iconHintUrl}
						size={20}
					/>
					{folderColor ? <FolderDot color={folderColor} /> : null}
					<p className="truncate text-[12px] font-medium text-secondary">
						{feedTitle}
					</p>
					{!item.read ? (
						<span
							aria-hidden="true"
							className="ml-auto inline-block size-[7px] shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-dim)]"
						/>
					) : null}
				</div>

				<Link
					href={`/reader/${item.id}`}
					onPointerDown={rememberTimelineAnchor}
					onClick={navigateToReader}
				>
					<h3
						className={`mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] line-clamp-2 transition-colors duration-200 ${hoverTextClass} ${item.read ? "text-secondary" : ""}`}
					>
						<SearchHighlight text={itemTitle} query={searchQuery} />
					</h3>
				</Link>

				{item.summary && !thumbnailUrl && (
					<p
						className={`mt-1.5 text-[13px] leading-relaxed line-clamp-2 ${item.read ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"}`}
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
								<span className="text-[var(--text-tertiary)]">·</span>
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
							onClick={toggleBookmarked}
							aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
							data-card-action
						>
							<Bookmark
								className={`size-[18px] ${bookmarkFlipClass(bookmarkAnimating)}`}
								fill={isBookmarked ? "currentColor" : "none"}
							/>
						</IconButton>

						{item.canonicalUrl && (
							<a
								href={item.canonicalUrl}
								rel="noreferrer"
								className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)] after:absolute after:-inset-1 after:content-['']"
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

function bookmarkFlipClass(bookmarkAnimating: boolean) {
	return bookmarkAnimating ? "bookmark-flip" : "";
}

/** Dense row presentation: small thumb, two-line title, ~64-76px tall. */
export const CompactItemCard = memo(function CompactItemCard({
	item,
	searchQuery = "",
}: {
	item: ItemRecord;
	searchQuery?: string;
}) {
	const {
		rememberTimelineAnchor,
		prefetchReader,
		navigateToReader,
		navigateFromCard,
		isBookmarked,
		bookmarkAnimating,
		toggleBookmarked,
	} = useItemCardController(item);
	const folderColorMap = useFolderColorMap();

	const isYouTube = item.feed.sourceType.includes("YOUTUBE");
	const youtubeThumbnailUrls = item.youtubeVideoId
		? getYouTubeThumbnailUrls(item.youtubeVideoId, {
				existingUrl: item.mediaUrl,
				isShort: item.youtubeIsShort,
			})
		: null;
	const thumbnailUrl = isYouTube
		? (youtubeThumbnailUrls?.[0] ?? item.mediaUrl ?? null)
		: item.mediaUrl;
	const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
	const itemTitle = decodeHtmlEntities(item.title);
	const folderColor = folderColorMap.get(item.feed.id) ?? null;
	const hoverTextClass =
		"[@media(hover:hover)]:group-hover:text-[var(--accent)]";

	return (
		<article
			data-timeline-item-id={item.id}
			onClick={(event) => navigateFromCard(event, { allowYouTube: true })}
			onPointerEnter={prefetchReader}
			onFocus={prefetchReader}
			className="group feed-item-card compact-item-card cursor-pointer overflow-hidden transition-all duration-300 [@media(hover:hover)]:hover:border-[var(--accent)]/30"
		>
			<div className="flex items-start gap-3 p-3">
				<Link
					href={`/reader/${item.id}`}
					onPointerDown={rememberTimelineAnchor}
					onClick={navigateToReader}
					className="relative flex h-14 w-[5.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted"
					aria-label={itemTitle}
				>
					{thumbnailUrl ? (
						<Image
							src={thumbnailUrl}
							alt=""
							fill
							sizes="84px"
							unoptimized
							loading="lazy"
							className="h-full w-full object-cover"
						/>
					) : (
						<FeedAvatar
							feedId={item.feed.id}
							title={item.feed.label || item.feed.title}
							iconHintUrl={item.feed.iconHintUrl}
							size={28}
						/>
					)}
				</Link>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
						{folderColor ? <FolderDot color={folderColor} /> : null}
						<span className="truncate font-medium">{feedTitle}</span>
						<span className="text-[var(--text-tertiary)]">·</span>
						<span className="shrink-0">{relativeTime(item.publishedAt)}</span>
						{!item.read ? (
							<span
								aria-hidden="true"
								className="ml-auto inline-block size-[7px] shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-dim)]"
							/>
						) : null}
					</div>
					<Link
						href={`/reader/${item.id}`}
						onPointerDown={rememberTimelineAnchor}
						onClick={navigateToReader}
						className="block"
					>
						<h3
							className={`mt-1 line-clamp-2 text-[14px] font-semibold leading-snug tracking-[-0.005em] transition-colors duration-200 ${hoverTextClass} ${item.read ? "text-secondary" : ""}`}
						>
							<SearchHighlight text={itemTitle} query={searchQuery} />
						</h3>
					</Link>
				</div>

				<IconButton
					variant="ghost"
					size="sm"
					className={`${isBookmarked ? "text-[var(--accent)]" : ""} mt-0.5`}
					onClick={toggleBookmarked}
					aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
					data-card-action
				>
					<Bookmark
						className={`size-4 ${bookmarkFlipClass(bookmarkAnimating)}`}
						fill={isBookmarked ? "currentColor" : "none"}
					/>
				</IconButton>
			</div>
		</article>
	);
});

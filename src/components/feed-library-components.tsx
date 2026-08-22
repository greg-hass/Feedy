"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	ChevronRight,
	FolderInput,
	FolderOpen,
	MoreHorizontal,
	Pause,
	Play,
	Trash2,
} from "lucide-react";

import { FeedAvatar } from "@/components/feed-avatar";
import { Sheet } from "@/components/ui/sheet";
import { freezeListScrollPosition } from "@/components/use-list-scroll-restoration";
import { api } from "@/lib/client";
import { getFeedPauseActionLabel, getFeedPausePatch } from "@/lib/feed-pause";
import { formatSourceType } from "@/lib/feed-source";
import { relativeTime } from "@/lib/utils";
import type { MeResponse, NavFeed, NavFolder } from "@/types/app";

const EditFeedSheet = dynamic(
	() => import("@/components/forms").then((module) => module.EditFeedSheet),
	{
		ssr: false,
	},
);
const EditFolderSheet = dynamic(
	() => import("@/components/forms").then((module) => module.EditFolderSheet),
	{
		ssr: false,
	},
);

function formatDuration(ms: number | null | undefined) {
	if (!ms || ms <= 0) {
		return "n/a";
	}

	if (ms < 1000) {
		return `${ms}ms`;
	}

	return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

function getHealthPresentation(status: string) {
	switch (status) {
		case "HEALTHY":
			return {
				label: "Healthy",
				className: "text-[var(--status-healthy)]",
				dotClassName: "bg-[var(--status-healthy-dot)]",
				compact: true,
			};
		case "DEGRADED":
			return {
				label: "Issue",
				className: "text-[var(--status-warning)]",
				dotClassName: "bg-[var(--status-warning-dot)]",
				compact: false,
			};
		case "ERROR":
			return {
				label: "Error",
				className: "text-[var(--status-error)]",
				dotClassName: "bg-[var(--status-error-dot)]",
				compact: false,
			};
		default:
			return {
				label: "Pending",
				className: "text-[var(--status-pending)]",
				dotClassName: "bg-[var(--status-pending-dot)]",
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

export function FeedRow({
	feed,
	feeds,
	index,
}: {
	feed: NavFeed;
	feeds: NavFeed[];
	index: number;
}) {
	const [showEdit, setShowEdit] = useState(false);
	const [showHealth, setShowHealth] = useState(false);
	const [showMove, setShowMove] = useState(false);
	const queryClient = useQueryClient();
	const health = getHealthPresentation(feed.healthStatus);
	const pauseLabel = getFeedPauseActionLabel(feed.excludeFromTimeline);

	const moveFeed = useMutation({
		mutationFn: (folderId: string | null) =>
			api(`/api/feeds/${feed.id}`, {
				method: "PATCH",
				body: JSON.stringify({ folderId }),
			}),
		onSuccess: async () => {
			setShowMove(false);
			await queryClient.invalidateQueries({ queryKey: ["me"] });
		},
	});
	const me = queryClient.getQueryData<MeResponse>(["me"]);
	const moveFolders = me?.navigation.folders ?? [];

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

	const pauseFeed = useMutation({
		mutationFn: () =>
			api(`/api/feeds/${feed.id}`, {
				method: "PATCH",
				body: JSON.stringify(getFeedPausePatch(feed.excludeFromTimeline)),
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["items"] });
		},
	});

	return (
		<>
			<SwipeRow
				revealWidth={260}
				actions={
					<>
						<button
							type="button"
							onClick={() => pauseFeed.mutate()}
							disabled={pauseFeed.isPending}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--accent-dim)] text-[var(--accent)] disabled:opacity-60"
							aria-label={`${pauseLabel} ${feed.label || feed.title}`}
							title={pauseLabel}
						>
							{feed.excludeFromTimeline ? (
								<Play className="size-4" />
							) : (
								<Pause className="size-4" />
							)}
						</button>
						<button
							type="button"
							onClick={() => setShowMove(true)}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--accent)]/12 text-[var(--accent)]"
							aria-label={`Move ${feed.label || feed.title} to a folder`}
							title="Move to folder"
						>
							<FolderInput className="size-4" />
						</button>
						<button
							onClick={() => {
								if (confirm(`Delete ${feed.label || feed.title}?`)) {
									deleteFeed.mutate();
								}
							}}
							disabled={deleteFeed.isPending}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
							aria-label={`Delete ${feed.label || feed.title}`}
						>
							<Trash2 className="size-4" />
						</button>
						<button
							onClick={() => setShowEdit(true)}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--surface-muted)] text-secondary"
							aria-label={`Edit ${feed.label || feed.title}`}
						>
							<MoreHorizontal className="size-4" />
						</button>
					</>
				}
			>
				<div
					data-flat-library-row="true"
					className="flex min-w-0 items-center gap-3 rounded-[20px] px-3 py-3"
					style={{ contentVisibility: "auto", containIntrinsicSize: "92px" }}
				>
					<Link
						href={`/app/feeds/${feed.id}`}
						onClick={() => freezeListScrollPosition("feedy-feeds-scroll")}
						className="flex min-w-0 flex-1 items-center gap-3"
					>
						<FeedAvatar
							feedId={feed.id}
							title={feed.label || feed.title}
							iconHintUrl={feed.iconHintUrl}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center justify-between gap-2">
								<h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
									{feed.label || feed.title}
								</h3>
								{feed.counts.unreadCount > 0 && (
									<span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.22)]">
										{feed.counts.unreadCount}
									</span>
								)}
							</div>
							<p className="mt-1 truncate text-xs text-secondary">
								{feed.description || feed.sourceUrl}
							</p>
							<FeedMetadataRow
								feed={feed}
								onShowHealth={() => setShowHealth(true)}
								health={health}
							/>
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
			{showMove && (
				<BulkMoveSheet
					folders={moveFolders}
					selectedCount={1}
					title="Move feed"
					subtitle={feed.label || feed.title}
					onClose={() => setShowMove(false)}
					onMove={(folderId) => moveFeed.mutate(folderId)}
					isPending={moveFeed.isPending}
				/>
			)}
			{showHealth && (
				<FeedHealthSheet feed={feed} onClose={() => setShowHealth(false)} />
			)}
		</>
	);
}

function FeedMetadataRow({
	feed,
	health,
	onShowHealth,
}: {
	feed: NavFeed;
	health: ReturnType<typeof getHealthPresentation>;
	onShowHealth?: () => void;
}) {
	const status = (
		<>
			<span className={`size-1.5 rounded-full ${health.dotClassName}`} />
			{!health.compact ? <span>{health.label}</span> : null}
		</>
	);

	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-secondary">
			<span>{formatSourceType(feed.sourceType)}</span>
			<span>·</span>
			<span>{relativeTime(feed.lastRefreshedAt)}</span>
			{feed.excludeFromTimeline ? (
				<>
					<span>·</span>
					<span
						className="inline-flex items-center gap-1 text-[var(--accent)]"
						aria-label="Paused"
						title="Paused"
					>
						<Pause className="size-3.5" />
						<span>Paused</span>
					</span>
				</>
			) : null}
			{feed.performance.isSlow ? (
				<>
					<span>·</span>
					<span className="font-medium text-[var(--status-warning)]">
						Slow {formatDuration(feed.performance.latestDurationMs)}
					</span>
				</>
			) : null}
			<span>·</span>
			{onShowHealth ? (
				<button
					type="button"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onShowHealth();
					}}
					className={`inline-flex items-center ${health.compact ? "" : "gap-1.5"} text-[9px] font-semibold tracking-[0.12em] ${health.className}`}
					aria-label={`View ${feed.label || feed.title} health`}
					title={health.label}
				>
					{status}
				</button>
			) : (
				<span
					className={`inline-flex items-center ${health.compact ? "" : "gap-1.5"} text-[9px] font-semibold tracking-[0.12em] ${health.className}`}
				>
					{status}
				</span>
			)}
		</div>
	);
}

export function SelectableFeedRow({
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
			data-flat-selectable="true"
			data-flat-library-row="true"
			aria-pressed={selected}
			data-flat-surface="true"
			className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] transition-colors ${
				selected
					? "border-[var(--accent)]/45 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface)_90%)]"
					: "border-subtle bg-[var(--surface)]"
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
			<FeedAvatar
				feedId={feed.id}
				title={feed.label || feed.title}
				iconHintUrl={feed.iconHintUrl}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
						{feed.label || feed.title}
					</h3>
					{feed.counts.unreadCount > 0 ? (
						<span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.22)]">
							{feed.counts.unreadCount}
						</span>
					) : null}
				</div>
				<p className="mt-1 truncate text-xs text-secondary">
					{folderTitle || "No folder"} · {feed.description || feed.sourceUrl}
				</p>
				<FeedMetadataRow feed={feed} health={health} />
			</div>
		</button>
	);
}

export function SelectableFolderRow({
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
			data-flat-selectable="true"
			data-flat-library-row="true"
			aria-pressed={selected}
			data-flat-surface="true"
			className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] transition-colors ${
				selected || partiallySelected
					? "border-[var(--accent)]/45 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface)_90%)]"
					: "border-subtle bg-[var(--surface)]"
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
			<div
				data-flat-icon="true"
				className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
			>
				<FolderOpen className="size-5" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
						{folder.title}
					</h3>
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
							<span className="font-medium text-[var(--status-warning)]">
								{folder.counts.issueCount} issues
							</span>
						</>
					) : null}
					{folder.counts.slowFeedCount > 0 ? (
						<>
							<span>·</span>
							<span className="font-medium text-[var(--status-warning)]">
								{folder.counts.slowFeedCount} slow
							</span>
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

export function BulkMoveSheet({
	folders,
	selectedCount,
	onClose,
	onMove,
	isPending,
	title,
	subtitle,
}: {
	folders: NavFolder[];
	selectedCount: number;
	onClose: () => void;
	onMove: (folderId: string | null) => void;
	isPending: boolean;
	title?: string;
	subtitle?: string;
}) {
	return (
		<Sheet
			title={title ?? "Move selected feeds"}
			subtitle={
				subtitle ??
				`Choose where to place ${selectedCount} selected ${selectedCount === 1 ? "feed" : "feeds"}.`
			}
			onClose={onClose}
			panelClassName="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
		>
			<div className="mt-4 space-y-2">
				<button
					type="button"
					onClick={() => onMove(null)}
					disabled={isPending}
					data-flat-surface="true"
					className="flex w-full items-center justify-between rounded-[20px] bg-[var(--surface-strong)] px-4 py-3 text-left disabled:opacity-50"
				>
					<div>
						<p className="text-sm font-semibold">No folder</p>
						<p className="mt-1 text-xs text-secondary">
							Keep these feeds loose in the main library.
						</p>
					</div>
					<span className="text-[10px] uppercase tracking-[0.16em] text-secondary">
						Move
					</span>
				</button>
				{folders.map((folder) => (
					<button
						key={folder.id}
						type="button"
						onClick={() => onMove(folder.id)}
						disabled={isPending}
						data-flat-surface="true"
						className="flex w-full items-center justify-between rounded-[20px] bg-[var(--surface-strong)] px-4 py-3 text-left disabled:opacity-50"
					>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold">{folder.title}</p>
							<p className="mt-1 text-xs text-secondary">
								{folder.counts.feedCount} feeds · {folder.counts.unreadCount} unread
							</p>
						</div>
						<span className="text-[10px] uppercase tracking-[0.16em] text-secondary">
							Move
						</span>
					</button>
				))}
			</div>
		</Sheet>
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
	const effectiveRefreshMinutes = me?.user.settings.refreshIntervalMinutes ?? 15;

	return (
		<Sheet
			title="Feed health"
			subtitle={feed.label || feed.title}
			onClose={onClose}
			panelClassName="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
		>
			<div
				data-flat-surface="true"
				className="mt-4 rounded-[22px] bg-[var(--surface-strong)] p-4"
			>
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
							Status
						</p>
						<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
							{getHealthSummary(feed)}
						</p>
					</div>
					<span
						className={`inline-flex items-center gap-2 rounded-full bg-[var(--surface-strong)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${health.className}`}
					>
						<span className={`size-2 rounded-full ${health.dotClassName}`} />
						{health.label}
					</span>
				</div>
			</div>

			<div className="mt-3 space-y-2">
				<div
					data-flat-surface="true"
					className="rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3.5 py-3"
				>
					<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
						Refresh cadence
					</p>
					<p className="mt-1 text-sm text-[var(--text-primary)]">
						Every {effectiveRefreshMinutes} minutes
					</p>
					<p className="mt-1 text-xs text-secondary">
						All feeds use the cadence configured in Settings.
					</p>
				</div>

				<div
					data-flat-surface="true"
					className="rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3.5 py-3"
				>
					<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
						Last refresh
					</p>
					<p className="mt-1 text-sm text-[var(--text-primary)]">
						{feed.lastRefreshedAt ? relativeTime(feed.lastRefreshedAt) : "Never"}
					</p>
				</div>

				<div
					data-flat-surface="true"
					className="rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3.5 py-3"
				>
					<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
						Last successful refresh
					</p>
					<p className="mt-1 text-sm text-[var(--text-primary)]">
						{feed.lastSuccessfulRefreshAt
							? relativeTime(feed.lastSuccessfulRefreshAt)
							: "No successful refresh yet"}
					</p>
				</div>

				<div
					data-flat-surface="true"
					className="rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3.5 py-3"
				>
					<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
						Last failure
					</p>
					<p className="mt-1 text-sm text-[var(--text-primary)]">
						{feed.lastFailureAt
							? relativeTime(feed.lastFailureAt)
							: "No recent failures"}
					</p>
				</div>

				<div
					data-flat-surface="true"
					className="rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3.5 py-3"
				>
					<p className="text-[11px] uppercase tracking-[0.18em] text-secondary">
						Recent refresh speed
					</p>
					<p className="mt-1 text-sm text-[var(--text-primary)]">
						Latest {formatDuration(feed.performance.latestDurationMs)} · Avg{" "}
						{formatDuration(feed.performance.averageDurationMs)}
					</p>
					<p className="mt-1 text-xs text-secondary">
						{feed.performance.slowCount24h > 0
							? `${feed.performance.slowCount24h} slow refreshes in the last 24 hours`
							: "No slow refreshes in the last 24 hours"}
					</p>
				</div>

				{feed.lastError ? (
					<div className="rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-3.5 py-3">
						<p className="text-[11px] uppercase tracking-[0.18em] text-[var(--status-error)]">
							Latest error
						</p>
						<p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
							{feed.lastError}
						</p>
					</div>
				) : null}
			</div>
		</Sheet>
	);
}

export function FolderRow({
	folder,
	folders,
	index,
}: {
	folder: NavFolder;
	folders: NavFolder[];
	index: number;
}) {
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
			if (targetIndex < 0 || targetIndex >= folders.length)
				return Promise.resolve();
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
								if (
									confirm(
										`Delete folder ${folder.title}? Feeds will become uncategorized.`,
									)
								) {
									deleteFolder.mutate();
								}
							}}
							disabled={deleteFolder.isPending}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
							aria-label={`Delete folder ${folder.title}`}
						>
							<Trash2 className="size-4" />
						</button>
						<button
							onClick={() => setShowEdit(true)}
							data-flat-control="true"
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
					onClick={() => freezeListScrollPosition("feedy-feeds-scroll")}
					data-flat-library-row="true"
					className="group flex items-center justify-between gap-3 rounded-[24px] px-3.5 py-3.5"
					style={{ contentVisibility: "auto", containIntrinsicSize: "86px" }}
				>
					<div className="flex min-w-0 items-center gap-3">
						<div
							data-flat-icon="true"
							className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
						>
							<FolderOpen className="size-5" />
						</div>
						<div className="min-w-0">
							<h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">
								{folder.title}
							</h3>
							<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
								<span>{folder.counts.unreadCount} unread</span>
								<span>·</span>
								<span>{folder.counts.feedCount} feeds</span>
								{folder.counts.issueCount > 0 ? (
									<>
										<span>·</span>
										<span className="font-medium text-[var(--status-warning)]">
											{folder.counts.issueCount} issues
										</span>
									</>
								) : null}
								{folder.counts.slowFeedCount > 0 ? (
									<>
										<span>·</span>
										<span className="font-medium text-[var(--status-warning)]">
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
	revealWidth = 132,
}: {
	children: React.ReactNode;
	actions: React.ReactNode;
	revealWidth?: number;
}) {
	const [open, setOpen] = useState(false);
	const touchStartX = useRef<number | null>(null);
	const touchDeltaX = useRef(0);

	return (
		<div className="panel relative overflow-hidden">
			<div
				data-swipe-actions="true"
				data-swipe-actions-open={open ? "true" : "false"}
				aria-hidden={!open}
				className="absolute inset-y-[5px] right-[5px] flex items-center gap-2"
			>
				{actions}
			</div>
			<div
				data-flat-surface="true"
				className="relative z-10 bg-[var(--surface)] transition-transform duration-200 ease-out"
				style={{
					transform: open ? `translateX(-${revealWidth}px)` : undefined,
				}}
				onTouchStart={(event) => {
					touchStartX.current = event.touches[0]?.clientX ?? null;
					touchDeltaX.current = 0;
				}}
				onTouchMove={(event) => {
					if (touchStartX.current === null) return;
					touchDeltaX.current =
						(event.touches[0]?.clientX ?? 0) - touchStartX.current;
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

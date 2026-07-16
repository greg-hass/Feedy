"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
	ArrowLeft,
	Check,
	CheckSquare,
	EyeOff,
	FolderInput,
	MoreHorizontal,
	Trash2,
	X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { FeedAvatar } from "@/components/feed-avatar";
import { EditFeedSheet } from "@/components/forms";
import { ItemCard } from "@/components/item-card";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import {
	MobileShell,
	LoadingSkeleton,
	ErrorState,
	EmptyState,
} from "@/components/app-shell";
import { api } from "@/lib/client";
import { decodeHtmlEntities } from "@/lib/utils";
import type { ItemRecord, NavFeed, NavFolder } from "@/types/app";

function compareFeedLabels(a: NavFeed, b: NavFeed) {
	const aLabel = decodeHtmlEntities(a.label || a.title).toLocaleLowerCase();
	const bLabel = decodeHtmlEntities(b.label || b.title).toLocaleLowerCase();
	return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
}

export default function FolderDetailPage() {
	const params = useParams<{ folderId: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
	const [showBulkMove, setShowBulkMove] = useState(false);

	const me = useQuery({
		queryKey: ["me"],
		queryFn: () =>
			api<{ navigation: { folders: NavFolder[]; feeds: NavFeed[] } }>(
				"/api/me",
			),
		staleTime: 30_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});

	const folder = me.data?.navigation.folders.find(
		(f) => f.id === params.folderId,
	);
	const folderFeeds =
		me.data?.navigation.feeds
			.filter((f) => f.folderId === params.folderId)
			.sort(compareFeedLabels) ?? [];
	const folders = me.data?.navigation.folders ?? [];
	const folderTitle = decodeHtmlEntities(folder?.title || "");
	const selectedSet = new Set(selectedFeedIds);
	const selectedCount = selectedFeedIds.length;
	const goBack = () => {
		if (typeof document !== "undefined") {
			try {
				const referrerUrl = document.referrer
					? new URL(document.referrer)
					: null;
				if (!referrerUrl || referrerUrl.host !== window.location.host) {
					router.replace("/app/folders");
					return;
				}
			} catch {
				router.replace("/app/folders");
				return;
			}
		}

		router.back();
	};

	const items = useQuery({
		queryKey: ["items", "folder", params.folderId],
		queryFn: () =>
			api<ItemRecord[]>(
				`/api/items?folderId=${params.folderId}&stateFilter=ALL`,
			),
		enabled: !!folderFeeds.length,
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});

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
			await queryClient.invalidateQueries({
				queryKey: ["items", "folder", params.folderId],
			});
		},
	});

	if (!folder) {
		return (
			<MobileShell title="Folder">
				{me.isLoading ? (
					<LoadingSkeleton />
				) : (
					<ErrorState message="Folder not found" onRetry={() => me.refetch()} />
				)}
			</MobileShell>
		);
	}

	return (
		<MobileShell
			title={folderTitle}
			backButton={<HighlightBackButton onClick={goBack} />}
		>
			<div className="space-y-3">
				{folderFeeds.length > 0 && (
					<section
						data-flat-library-section="true"
						data-flat-surface="true"
						className="panel p-3"
					>
						<div
							data-flat-library-header="true"
							className="mb-2 flex items-center justify-between gap-3 px-1"
						>
							<div>
								<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
									Feeds in folder
								</p>
								{selectionMode ? (
									<p className="mt-1 text-[11px] text-secondary">
										{selectedCount} selected
									</p>
								) : null}
							</div>
							<div className="flex items-center gap-2">
								{selectionMode ? (
									<>
										<button
											onClick={() => setShowBulkMove(true)}
											disabled={!selectedCount}
											className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-[11px] font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)] transition duration-200 disabled:opacity-50 disabled:pointer-events-none"
										>
											<FolderInput className="size-3.5" />
											Move
										</button>
										<button
											onClick={() => {
												setSelectionMode(false);
												setSelectedFeedIds([]);
											}}
											className="inline-flex items-center gap-1.5 rounded-xl border border-subtle bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-secondary transition duration-200 hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]"
										>
											<X className="size-3.5" />
											Cancel
										</button>
									</>
								) : (
									<>
										<p className="text-[11px] text-secondary">
											{folderFeeds.length} sources
										</p>
										<button
											onClick={() => setSelectionMode(true)}
											className="inline-flex items-center gap-1.5 rounded-xl border border-subtle bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-secondary transition duration-200 hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]"
										>
											<CheckSquare className="size-3.5" />
											Select
										</button>
									</>
								)}
							</div>
						</div>
						<div data-flat-library-list="true" className="space-y-2">
							{selectionMode
								? folderFeeds.map((feed) => (
										<SelectableFolderFeedRow
											key={feed.id}
											feed={feed}
											selected={selectedSet.has(feed.id)}
											onToggle={() =>
												setSelectedFeedIds((current) =>
													current.includes(feed.id)
														? current.filter((id) => id !== feed.id)
														: [...current, feed.id],
												)
											}
										/>
									))
								: folderFeeds.map((feed) => (
										<FolderFeedRow key={feed.id} feed={feed} />
									))}
						</div>
					</section>
				)}
				{folderFeeds.length > 0 ? (
					<div data-flat-section-divider="true" aria-hidden="true" />
				) : null}

				<main className="flex-1">
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
								<ItemCard key={item.id} item={item} />
							))}
						</div>
					) : (
						<EmptyState
							title="No items"
							body="Pull down to refresh or wait for the next automatic refresh."
						/>
					)}
				</main>

				{showBulkMove ? (
					<FolderBulkMoveSheet
						folders={folders}
						currentFolderId={params.folderId}
						selectedCount={selectedCount}
						onClose={() => setShowBulkMove(false)}
						onMove={(folderId) => moveFeeds.mutate(folderId)}
						isPending={moveFeeds.isPending}
					/>
				) : null}
			</div>
		</MobileShell>
	);
}

function FolderFeedRow({ feed }: { feed: NavFeed }) {
	const queryClient = useQueryClient();
	const [showEdit, setShowEdit] = useState(false);

	const deleteFeed = useMutation({
		mutationFn: () => api(`/api/feeds/${feed.id}`, { method: "DELETE" }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["items"] });
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
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[16px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
							aria-label={`Delete ${feed.label || feed.title}`}
						>
							<Trash2 className="size-4" />
						</button>
						<button
							onClick={() => setShowEdit(true)}
							data-flat-control="true"
							className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[16px] bg-[var(--surface-muted)] text-secondary"
							aria-label={`Edit ${feed.label || feed.title}`}
						>
							<MoreHorizontal className="size-4" />
						</button>
					</>
				}
			>
				<Link
					href={`/app/feeds/${feed.id}`}
					data-flat-library-row="true"
					data-flat-surface="true"
					className="flex items-center gap-3 rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3 py-2.5 transition-colors hover:border-[var(--accent)]/20"
				>
					<FeedAvatar
						feedId={feed.id}
						title={decodeHtmlEntities(feed.label || feed.title)}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<p className="truncate text-sm font-medium text-[var(--text-primary)]">
								{decodeHtmlEntities(feed.label || feed.title)}
							</p>
							{feed.counts.unreadCount > 0 ? (
								<span className="shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
									{feed.counts.unreadCount}
								</span>
							) : null}
						</div>
						<div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-secondary">
							<span>
								{feed.sourceType.replaceAll("_RSS", "").replaceAll("_", " ")}
							</span>
							{feed.performance.isSlow ? (
								<>
									<span>·</span>
									<span className="font-medium text-[var(--status-warning)]">
										Slow{" "}
										{feed.performance.latestDurationMs
											? `${Math.max(feed.performance.latestDurationMs / 1000, 0.1).toFixed(feed.performance.latestDurationMs >= 10_000 ? 0 : 1)}s`
											: ""}
									</span>
								</>
							) : null}
							{feed.excludeFromTimeline ? (
								<>
									<span>·</span>
									<span
										className="inline-flex items-center text-[var(--status-error)]"
										aria-label="Hidden from Timeline"
										title="Hidden from Timeline"
									>
										<EyeOff className="size-3.5" />
									</span>
								</>
							) : null}
						</div>
					</div>
				</Link>
			</SwipeRow>

			{showEdit ? (
				<EditFeedSheet
					feed={feed}
					onClose={() => setShowEdit(false)}
					onDelete={() => deleteFeed.mutate()}
				/>
			) : null}
		</>
	);
}

function SelectableFolderFeedRow({
	feed,
	selected,
	onToggle,
}: {
	feed: NavFeed;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			data-flat-selectable="true"
			data-flat-library-row="true"
			data-flat-surface="true"
			aria-pressed={selected}
			className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-colors ${
				selected
					? "border-[var(--accent)]/45 bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-muted)_90%)]"
					: "border-subtle bg-[var(--surface-muted)]"
			}`}
		>
			<div
				className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
					selected
						? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
						: "border-subtle bg-[var(--surface)] text-transparent"
				}`}
			>
				<Check className="size-3.5" />
			</div>
			<FeedAvatar
				feedId={feed.id}
				title={decodeHtmlEntities(feed.label || feed.title)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<p className="truncate text-sm font-medium text-[var(--text-primary)]">
						{decodeHtmlEntities(feed.label || feed.title)}
					</p>
					{feed.counts.unreadCount > 0 ? (
						<span className="shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
							{feed.counts.unreadCount}
						</span>
					) : null}
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-secondary">
					<span>
						{feed.sourceType.replaceAll("_RSS", "").replaceAll("_", " ")}
					</span>
					{feed.performance.isSlow ? (
						<>
							<span>·</span>
							<span className="font-medium text-[var(--status-warning)]">
								Slow{" "}
								{feed.performance.latestDurationMs
									? `${Math.max(feed.performance.latestDurationMs / 1000, 0.1).toFixed(feed.performance.latestDurationMs >= 10_000 ? 0 : 1)}s`
									: ""}
							</span>
						</>
					) : null}
					{feed.excludeFromTimeline ? (
						<>
							<span>·</span>
							<span
								className="inline-flex items-center text-[var(--status-error)]"
								aria-label="Hidden from Timeline"
								title="Hidden from Timeline"
							>
								<EyeOff className="size-3.5" />
							</span>
						</>
					) : null}
				</div>
			</div>
		</button>
	);
}

function FolderBulkMoveSheet({
	folders,
	currentFolderId,
	selectedCount,
	onClose,
	onMove,
	isPending,
}: {
	folders: NavFolder[];
	currentFolderId: string;
	selectedCount: number;
	onClose: () => void;
	onMove: (folderId: string | null) => void;
	isPending: boolean;
}) {
	return (
		<Sheet
			title="Move selected feeds"
			subtitle={`Choose where to place ${selectedCount} selected ${selectedCount === 1 ? "feed" : "feeds"}.`}
			onClose={onClose}
			panelClassName="max-h-[min(72vh,640px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]"
		>
			<div className="mt-4 space-y-2">
				<button
					type="button"
					onClick={() => onMove(null)}
					disabled={isPending}
					className="flex w-full items-center justify-between rounded-[20px] bg-[var(--surface)] px-4 py-3 text-left disabled:opacity-50"
				>
					<div>
						<p className="text-sm font-semibold">Remove from folder</p>
						<p className="mt-1 text-xs text-secondary">
							Keep these feeds loose in the main library.
						</p>
					</div>
					<span className="text-[10px] uppercase tracking-[0.16em] text-secondary">
						Move
					</span>
				</button>
				{folders
					.filter((folder) => folder.id !== currentFolderId)
					.map((folder) => (
						<button
							key={folder.id}
							type="button"
							onClick={() => onMove(folder.id)}
							disabled={isPending}
							className="flex w-full items-center justify-between rounded-[20px] bg-[var(--surface)] px-4 py-3 text-left disabled:opacity-50"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{folder.title}</p>
								<p className="mt-1 text-xs text-secondary">
									{folder.counts.feedCount} feeds · {folder.counts.unreadCount}{" "}
									unread
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

function HighlightBackButton({ onClick }: { onClick: () => void }) {
	return (
		<IconButton
			variant="default"
			onClick={onClick}
			aria-label="Go back"
			className="text-[var(--accent)]"
		>
			<ArrowLeft className="size-4" />
		</IconButton>
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
		<div className="relative overflow-hidden rounded-[18px]">
			<div
				data-swipe-actions="true"
				data-swipe-actions-open={open ? "true" : "false"}
				aria-hidden={!open}
				className="absolute inset-y-[5px] right-[5px] flex items-center gap-2"
			>
				{actions}
			</div>
			<div
				className={`relative z-10 transition-transform duration-200 ease-out ${open ? "-translate-x-[132px]" : "translate-x-0"}`}
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

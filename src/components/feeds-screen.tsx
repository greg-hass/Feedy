"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	CheckSquare,
	FolderInput,
	FolderPlus,
	Plus,
	Rss,
	Search,
	X,
} from "lucide-react";

import {
	EmptyState,
	ErrorState,
	LoadingSkeleton,
	MobileShell,
	useMe,
} from "@/components/app-shell";
import {
	BulkMoveSheet,
	FeedRow,
	FolderRow,
	SelectableFeedRow,
	SelectableFolderRow,
} from "@/components/feed-library-components";
import { SectionLabel } from "@/components/screen-primitives";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { useListScrollRestoration } from "@/components/use-list-scroll-restoration";
import { api } from "@/lib/client";
import { formatSourceType } from "@/lib/feed-source";
import { decodeHtmlEntities } from "@/lib/utils";
import type { NavFeed } from "@/types/app";

const AddFeedForm = dynamic(
	() => import("@/components/forms").then((module) => module.AddFeedForm),
	{
		ssr: false,
	},
);
const AddFolderSheet = dynamic(
	() => import("@/components/forms").then((module) => module.AddFolderSheet),
	{
		ssr: false,
	},
);

function compareFeedLabels(a: NavFeed, b: NavFeed) {
	const aLabel = decodeHtmlEntities(a.label || a.title).toLocaleLowerCase();
	const bLabel = decodeHtmlEntities(b.label || b.title).toLocaleLowerCase();
	return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
}

export function FeedsScreen() {
	const me = useMe();
	useListScrollRestoration({
		storageKey: "feedy-feeds-scroll",
		enabled: Boolean(me.data),
	});
	const [showAddFeed, setShowAddFeed] = useState(false);
	const [showAddFolder, setShowAddFolder] = useState(false);
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
	const [showBulkMove, setShowBulkMove] = useState(false);
	const [query, setQuery] = useState("");
	const queryClient = useQueryClient();
	const deferredQuery = useDeferredValue(query);

	const feeds = useMemo(
		() => me.data?.navigation.feeds ?? [],
		[me.data?.navigation.feeds],
	);
	const folders = useMemo(
		() => me.data?.navigation.folders ?? [],
		[me.data?.navigation.folders],
	);
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
				[
					feed.label,
					feed.title,
					feed.description,
					feed.sourceUrl,
					feed.siteUrl,
					formatSourceType(feed.sourceType),
				]
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
		() =>
			selectedFeedIds.filter((id) => matchingFeeds.some((feed) => feed.id === id)),
		[matchingFeeds, selectedFeedIds],
	);
	const selectedSet = useMemo(
		() => new Set(effectiveSelectedFeedIds),
		[effectiveSelectedFeedIds],
	);
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
						.filter(
							(feed) =>
								!normalizedQuery ||
								[
									feed.label,
									feed.title,
									feed.description,
									feed.sourceUrl,
									feed.siteUrl,
									formatSourceType(feed.sourceType),
								]
									.filter(Boolean)
									.some((value) => value!.toLowerCase().includes(normalizedQuery)),
						)
						.sort(compareFeedLabels);
					const folderMatches = folder.title.toLowerCase().includes(normalizedQuery);

					return {
						...folder,
						matchingFeeds: matchingFolderFeeds,
						visible:
							!normalizedQuery || folderMatches || matchingFolderFeeds.length > 0,
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

	if (me.isLoading)
		return (
			<MobileShell title="Feeds">
				<LoadingSkeleton />
			</MobileShell>
		);
	if (me.error)
		return (
			<MobileShell title="Feeds">
				<ErrorState message={me.error.message} onRetry={() => me.refetch()} />
			</MobileShell>
		);

	return (
		<MobileShell
			title="Feeds"
			actions={
				<div className="flex h-10 items-center gap-2">
					{!selectionMode && (
						<button
							onClick={() => setSelectionMode(true)}
							className="inline-flex h-10 items-center gap-2 rounded-xl border border-subtle bg-[var(--surface)] px-3 text-xs font-semibold text-secondary transition duration-200 hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]"
						>
							<CheckSquare className="size-4" />
							Select
						</button>
					)}
					<IconButton
						variant={showAddFolder ? "active" : "default"}
						onClick={() => setShowAddFolder((current) => !current)}
						aria-label="Create folder"
						aria-pressed={showAddFolder}
					>
						<FolderPlus className="size-4" />
					</IconButton>
					<IconButton
						variant={showAddFeed ? "active" : "default"}
						onClick={() => setShowAddFeed((current) => !current)}
						aria-label="Add feed"
						aria-pressed={showAddFeed}
					>
						<Plus className="size-4" />
					</IconButton>
				</div>
			}
		>
			{showAddFolder && <AddFolderSheet onClose={() => setShowAddFolder(false)} />}

			{showAddFeed && (
				<div className="mb-3">
					<AddFeedForm folders={folders} onClose={() => setShowAddFeed(false)} />
				</div>
			)}

			<section className="panel mb-4 p-3">
				<div
					data-flat-control="true"
					className="flex items-center gap-3 rounded-[20px] border border-[var(--accent)]/20 bg-[var(--surface-strong)] px-3.5"
				>
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
							{
								label: "All",
								value: healthCounts.all,
								tone: "text-[var(--text-primary)]",
							},
							{
								label: "Healthy",
								value: healthCounts.healthy,
								tone: "text-[var(--status-healthy)]",
							},
							{
								label: "Issues",
								value: healthCounts.issues,
								tone: "text-[var(--status-warning)]",
							},
							{
								label: "Slow",
								value: healthCounts.slow,
								tone: "text-[var(--status-warning)]",
							},
						].map((item) => (
							<div
								key={item.label}
								data-flat-surface="true"
								className="rounded-2xl bg-[var(--surface-strong)] px-3 py-2.5 text-center"
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

			<>
				<div
					className="space-y-4"
					hidden={!selectionMode}
					inert={!selectionMode ? true : undefined}
				>
					{visibleFolders.length > 0 ? (
						<section>
							<SectionLabel
								eyebrow="Library"
								title="Folders"
								meta={`${visibleFolders.length} groups`}
							/>
							<div className="space-y-2">
								{visibleFolders.map((folder) => {
									const folderFeedIds = folder.matchingFeeds.map((feed) => feed.id);
									const folderSelected =
										folderFeedIds.length > 0 &&
										folderFeedIds.every((id) => selectedSet.has(id));

									return (
										<SelectableFolderRow
											key={folder.id}
											folder={folder}
											selected={folderSelected}
											selectedCount={
												folderFeedIds.filter((id) => selectedSet.has(id)).length
											}
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
				<div
					className="space-y-4"
					hidden={selectionMode}
					inert={selectionMode ? true : undefined}
				>
					{pinnedFeeds.length > 0 && (
						<section>
							<SectionLabel
								eyebrow="Quick access"
								title="Pinned"
								meta={`${pinnedFeeds.length} feeds`}
							/>
							<div className="space-y-2">
								{pinnedFeeds.map((feed, index) => (
									<FeedRow key={feed.id} feed={feed} feeds={pinnedFeeds} index={index} />
								))}
							</div>
						</section>
					)}

					{visibleFolders.length > 0 && (
						<section>
							<SectionLabel
								eyebrow="Library"
								title="Folders"
								meta={`${visibleFolders.length} groups`}
							/>
							<div className="space-y-2">
								{visibleFolders.map((folder, index) => (
									<FolderRow
										key={folder.id}
										folder={folder}
										folders={visibleFolders}
										index={index}
									/>
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
									<FeedRow
										key={feed.id}
										feed={feed}
										feeds={uncategorizedFeeds}
										index={index}
									/>
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

					{!!feeds.length &&
						normalizedQuery &&
						!pinnedFeeds.length &&
						!visibleFolders.length &&
						!uncategorizedFeeds.length && (
							<EmptyState
								title="No feeds match this search"
								body="Try a feed title, folder name, source URL, or source type."
								icon={<Search className="size-6" />}
							/>
						)}
				</div>
			</>

			{selectionMode ? <div aria-hidden className="h-44" /> : null}

			{selectionMode ? (
				<div
					data-flat-selection-bar="true"
					className="fixed inset-x-0 z-40"
					style={{ bottom: "calc(env(safe-area-inset-bottom) + 78px)" }}
				>
					<div className="mx-auto w-full max-w-md px-5">
						<div
							className="flex w-full items-center justify-between gap-3 rounded-[34px] border px-3 py-2 backdrop-blur-2xl"
							style={{
								background: "var(--glass-bg)",
								borderColor: "var(--glass-border)",
								boxShadow: "var(--glass-shadow)",
								WebkitBackdropFilter: "blur(20px) saturate(180%)",
							}}
						>
							<button
								onClick={() => {
									setSelectionMode(false);
									setSelectedFeedIds([]);
									setShowBulkMove(false);
								}}
								className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-semibold text-secondary transition duration-200 active:bg-[var(--surface-muted)]"
							>
								<X className="size-4" />
								Cancel
							</button>
							<p className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-secondary">
								{selectedCount} selected
							</p>
							<button
								onClick={() => setShowBulkMove(true)}
								disabled={!selectedCount}
								className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_24px_rgba(var(--accent-rgb),0.28)] transition duration-200 disabled:pointer-events-none disabled:opacity-50"
							>
								<FolderInput className="size-4" />
								Move
							</button>
						</div>
					</div>
				</div>
			) : null}

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

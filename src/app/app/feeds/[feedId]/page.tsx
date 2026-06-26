"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FeedAvatar } from "@/components/feed-avatar";
import { ItemCard } from "@/components/item-card";
import { IconButton } from "@/components/ui/icon-button";
import {
	MobileShell,
	LoadingSkeleton,
	ErrorState,
	EmptyState,
} from "@/components/app-shell";
import { api } from "@/lib/client";
import { splitMutePatterns } from "@/lib/feed/mute-rules";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord, NavFeed } from "@/types/app";

export default function FeedDetailPage() {
	const params = useParams<{ feedId: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [showEdit, setShowEdit] = useState(false);

	const items = useQuery({
		queryKey: ["items", "feed", params.feedId],
		queryFn: () => api<ItemRecord[]>(`/api/items?feedId=${params.feedId}`),
		staleTime: 15_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});

	const me = useQuery({
		queryKey: ["me"],
		queryFn: () => api<{ navigation: { feeds: NavFeed[] } }>("/api/me"),
		staleTime: 30_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});

	const feed = me.data?.navigation.feeds.find((f) => f.id === params.feedId);
	const feedTitle = decodeHtmlEntities(feed?.label || feed?.title || "");
	const goBack = () => {
		if (typeof document !== "undefined") {
			try {
				const referrerUrl = document.referrer
					? new URL(document.referrer)
					: null;
				if (!referrerUrl || referrerUrl.host !== window.location.host) {
					router.replace("/app/feeds");
					return;
				}
			} catch {
				router.replace("/app/feeds");
				return;
			}
		}

		router.back();
	};

	const deleteFeed = useMutation({
		mutationFn: () => api(`/api/feeds/${params.feedId}`, { method: "DELETE" }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["items"] });
			router.replace("/app/feeds");
		},
	});

	if (!feed) {
		return (
			<MobileShell title="Feed">
				{me.isLoading ? (
					<LoadingSkeleton />
				) : (
					<ErrorState message="Feed not found" onRetry={() => me.refetch()} />
				)}
			</MobileShell>
		);
	}

	return (
		<MobileShell
			title={feedTitle}
			backButton={
				<IconButton onClick={goBack} aria-label="Go back">
					<ArrowLeft className="size-4" />
				</IconButton>
			}
			actions={
				<IconButton onClick={() => setShowEdit(true)} aria-label="Edit feed">
					<MoreHorizontal className="size-4" />
				</IconButton>
			}
		>
			<div className="space-y-3">
				<div className="rounded-[24px] border border-subtle bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
					<div className="flex items-center gap-3">
						<FeedAvatar feedId={feed.id} title={feedTitle} />
						<div className="min-w-0 flex-1">
							<h1 className="truncate text-base font-semibold">{feedTitle}</h1>
							<p className="text-xs text-secondary">
								{feed.counts.unreadCount} unread ·{" "}
								{relativeTime(feed.lastRefreshedAt)}
							</p>
						</div>
					</div>
				</div>

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
			</div>

			{showEdit && (
				<EditFeedModal
					feed={feed}
					onClose={() => setShowEdit(false)}
					onDelete={() => deleteFeed.mutate()}
				/>
			)}
		</MobileShell>
	);
}

function EditFeedModal({
	feed,
	onClose,
	onDelete,
}: {
	feed: NavFeed;
	onClose: () => void;
	onDelete: () => void;
}) {
	const [label, setLabel] = useState(feed.label || "");
	const queryClient = useQueryClient();
	const me = queryClient.getQueryData<{
		navigation: { folders: Array<{ id: string; title: string }> };
	}>(["me"]);
	const folders = me?.navigation.folders ?? [];
	const [folderId, setFolderId] = useState(feed.folderId || "");
	const [excludeFromTimeline, setExcludeFromTimeline] = useState(
		feed.excludeFromTimeline,
	);
	const [muteTitlePatterns, setMuteTitlePatterns] = useState(
		feed.muteRules?.titlePatterns.join("\n") || "",
	);
	const [muteAuthorPatterns, setMuteAuthorPatterns] = useState(
		feed.muteRules?.authorPatterns.join("\n") || "",
	);
	const [muteHideFromTimeline, setMuteHideFromTimeline] = useState(
		feed.muteRules?.hideFromTimeline ?? true,
	);
	const [muteAutoMarkRead, setMuteAutoMarkRead] = useState(
		feed.muteRules?.autoMarkRead ?? false,
	);

	const mutation = useMutation({
		mutationFn: () =>
			import("@/lib/client").then(({ api }) =>
				api(`/api/feeds/${feed.id}`, {
					method: "PATCH",
					body: JSON.stringify({
						label: label || null,
						folderId: folderId || null,
						excludeFromTimeline,
						muteRules: {
							titlePatterns: splitMutePatterns(muteTitlePatterns),
							authorPatterns: splitMutePatterns(muteAuthorPatterns),
							hideFromTimeline: muteHideFromTimeline,
							autoMarkRead: muteAutoMarkRead,
						},
					}),
				}),
			),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["items"] });
			onClose();
		},
	});

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--text-primary)]/40"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-t-[24px] bg-[var(--surface)] p-5 pb-8"
				onClick={(e) => e.stopPropagation()}
			>
				<h3 className="text-base font-semibold">Edit feed</h3>
				<p className="mt-1 truncate text-xs text-secondary">{feed.sourceUrl}</p>
				<label className="mt-4 block">
					<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
						Label
					</span>
					<input
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder={feed.title}
						className="h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
					/>
				</label>
				{folders.length > 0 && (
					<label className="mt-3 block">
						<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
							Folder
						</span>
						<select
							value={folderId}
							onChange={(e) => setFolderId(e.target.value)}
							className="h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
						>
							<option value="">No folder</option>
							{folders.map((f) => (
								<option key={f.id} value={f.id}>
									{f.title}
								</option>
							))}
						</select>
					</label>
				)}
				<button
					onClick={() => setExcludeFromTimeline(!excludeFromTimeline)}
					className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
						excludeFromTimeline
							? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
							: "border-subtle text-secondary"
					}`}
				>
					<span
						className={`inline-flex size-4 items-center justify-center rounded border ${excludeFromTimeline ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-subtle"}`}
					>
						{excludeFromTimeline ? "✓" : ""}
					</span>
					Hide from Timeline
				</button>
				<div className="mt-3 rounded-[18px] border border-subtle bg-[var(--surface-muted)] p-3.5">
					<p className="text-sm font-semibold">Mute rules</p>
					<p className="mt-1 text-xs text-secondary">
						Match titles or authors for this feed only.
					</p>
					<textarea
						value={muteTitlePatterns}
						onChange={(e) => setMuteTitlePatterns(e.target.value)}
						placeholder={"Giveaway\nRoundup\nDeals"}
						rows={3}
						className="mt-3 min-h-[84px] w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
					/>
					<textarea
						value={muteAuthorPatterns}
						onChange={(e) => setMuteAuthorPatterns(e.target.value)}
						placeholder={"Newswire Bot\nSponsored"}
						rows={3}
						className="mt-3 min-h-[84px] w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
					/>
					<button
						onClick={() => setMuteHideFromTimeline(!muteHideFromTimeline)}
						className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
							muteHideFromTimeline
								? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
								: "border-subtle text-secondary"
						}`}
					>
						<span
							className={`inline-flex size-4 items-center justify-center rounded border ${muteHideFromTimeline ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-subtle"}`}
						>
							{muteHideFromTimeline ? "✓" : ""}
						</span>
						Hide matching items from Timeline
					</button>
					<button
						onClick={() => setMuteAutoMarkRead(!muteAutoMarkRead)}
						className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
							muteAutoMarkRead
								? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
								: "border-subtle text-secondary"
						}`}
					>
						<span
							className={`inline-flex size-4 items-center justify-center rounded border ${muteAutoMarkRead ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-subtle"}`}
						>
							{muteAutoMarkRead ? "✓" : ""}
						</span>
						Auto-mark matching items as read
					</button>
				</div>
				<button
					onClick={() => mutation.mutate()}
					className="mt-4 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-contrast)]"
				>
					Save
				</button>
				<button
					onClick={() => {
						if (confirm("Delete this feed?")) {
							onDelete();
							onClose();
						}
					}}
					className="mt-3 w-full rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 py-2.5 text-sm font-medium text-[var(--danger)]"
				>
					Delete feed
				</button>
			</div>
		</div>
	);
}

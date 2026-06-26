"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";

import { EmptyState, MobileShell } from "@/components/app-shell";
import { FeedAvatar } from "@/components/feed-avatar";
import { SectionLabel, SegmentedControl } from "@/components/screen-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { formatSourceType } from "@/lib/feed-source";

type SourceFilter = "ALL" | "RSS" | "REDDIT" | "YOUTUBE";

type LocalSearchResult = {
	id: string;
	title: string;
	label: string | null;
	description: string | null;
	sourceType: string;
	sourceUrl: string;
};

type DiscoverResult = {
	title: string;
	description?: string | null;
	siteName?: string | null;
	favicon?: string | null;
	feedUrl: string;
	sourceType: string;
};

export function DiscoverScreen() {
	const [query, setQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
	const [recentlyAdded, setRecentlyAdded] = useState<Record<string, true>>({});
	const [debouncedQuery, setDebouncedQuery] = useState("");
	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedQuery(query);
		}, 350);

		return () => window.clearTimeout(timer);
	}, [query]);
	const deferredQuery = useDeferredValue(debouncedQuery);
	const searchParams = new URLSearchParams({
		q: deferredQuery,
		sourceFilter,
	});
	const local = useQuery({
		queryKey: ["search", deferredQuery, sourceFilter],
		queryFn: () =>
			api<LocalSearchResult[]>(`/api/search?${searchParams.toString()}`),
		enabled: deferredQuery.trim().length > 0,
		placeholderData: (previous) => previous,
		staleTime: 60_000,
	});
	const discover = useQuery({
		queryKey: ["discover", deferredQuery, sourceFilter],
		queryFn: () =>
			api<DiscoverResult[]>(`/api/discover?${searchParams.toString()}`),
		enabled: deferredQuery.trim().length > 1,
		staleTime: 60_000,
	});
	const queryClient = useQueryClient();
	const addFeed = useMutation({
		mutationFn: (body: { sourceUrl: string; label?: string | null }) =>
			api("/api/feeds", {
				method: "POST",
				body: JSON.stringify(body),
			}),
		onSuccess: async (_result, variables) => {
			setRecentlyAdded((current) => ({
				...current,
				[variables.sourceUrl]: true,
			}));
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await queryClient.invalidateQueries({ queryKey: ["search"] });
			await queryClient.invalidateQueries({ queryKey: ["discover"] });
		},
	});
	const isSearchingLibrary = local.isPending || local.isFetching;
	const isSearchingDiscover = discover.isPending || discover.isFetching;

	return (
		<MobileShell title="Discover">
			<section className="rounded-[26px] border border-subtle bg-[var(--surface)] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
						Source scope
					</p>
					<p className="mt-1 text-xs text-secondary">
						Search everything or focus on one feed type.
					</p>
				</div>
				<div className="mt-3">
					<SegmentedControl
						value={sourceFilter}
						onChange={setSourceFilter}
						options={[
							{ key: "ALL", label: "All" },
							{ key: "RSS", label: "RSS" },
							{ key: "REDDIT", label: "Reddit" },
							{ key: "YOUTUBE", label: "YouTube" },
						]}
						columns="grid-cols-4"
					/>
				</div>
				<div className="mt-3 flex items-center gap-3 rounded-[22px] bg-[var(--surface-strong)] px-3.5">
					<Search className="size-4 shrink-0 text-secondary" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={
							sourceFilter === "YOUTUBE"
								? "creator, channel, presenter..."
								: sourceFilter === "REDDIT"
									? "topic, subreddit, community..."
									: sourceFilter === "RSS"
										? "website, publication, topic..."
										: "topic, creator, website, subreddit..."
						}
						className="h-11 border-0 bg-transparent px-0"
					/>
				</div>
			</section>

			{query.trim().length > 0 && (
				<>
					<section className="mt-4">
						<SectionLabel
							eyebrow="Library search"
							title="My feeds"
							meta={
								sourceFilter === "ALL"
									? undefined
									: formatSourceType(sourceFilter)
							}
						/>
						<div className="space-y-2">
							{isSearchingLibrary && (
								<p className="text-sm text-secondary">Searching...</p>
							)}
							{local.data?.map((feed) => (
								<div
									key={feed.id}
									className="rounded-[24px] border border-subtle bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]"
									style={{
										contentVisibility: "auto",
										containIntrinsicSize: "104px",
									}}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex min-w-0 flex-1 items-start gap-3">
											<FeedAvatar
												feedId={feed.id}
												title={feed.label || feed.title}
											/>
											<div className="min-w-0 flex-1">
												<p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
													{formatSourceType(feed.sourceType)}
												</p>
												<h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">
													{feed.label || feed.title}
												</h3>
												<p className="mt-1.5 text-xs leading-relaxed text-secondary">
													{feed.description || feed.sourceUrl}
												</p>
											</div>
										</div>
										<span className="inline-flex shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
											Added
										</span>
									</div>
								</div>
							))}
							{!isSearchingLibrary && local.data && !local.data.length && (
								<p className="text-sm text-secondary">
									No matching feeds in your library.
								</p>
							)}
						</div>
					</section>

					<section className="mt-6">
						<SectionLabel
							eyebrow="New results"
							title="Discover feeds"
							meta={
								discover.data?.length
									? `${discover.data.length} matches`
									: sourceFilter === "YOUTUBE"
										? "Channel-first results"
										: undefined
							}
						/>
						<div className="space-y-2">
							{isSearchingDiscover && (
								<p className="text-sm text-secondary">Searching...</p>
							)}
							{discover.data?.map((result) => {
								const justAdded = Boolean(recentlyAdded[result.feedUrl]);
								const isSubmitting =
									addFeed.isPending &&
									addFeed.variables?.sourceUrl === result.feedUrl;

								return (
									<div
										key={result.feedUrl}
										className="rounded-[24px] border border-subtle bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]"
										style={{
											contentVisibility: "auto",
											containIntrinsicSize: "112px",
										}}
									>
										<div className="flex items-start justify-between gap-4">
											<div className="flex min-w-0 flex-1 items-start gap-3">
												<DiscoveryAvatar
													title={result.title}
													sourceType={result.sourceType}
													favicon={result.favicon || null}
												/>
												<div className="min-w-0 flex-1">
													<p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
														{result.siteName ||
															formatSourceType(result.sourceType)}
													</p>
													<h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">
														{result.title}
													</h3>
													{result.description ? (
														<p className="mt-1.5 text-xs leading-relaxed text-secondary line-clamp-2">
															{result.description}
														</p>
													) : null}
												</div>
											</div>
											{justAdded ? (
												<span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)]">
													<Check className="size-3.5" />
													Added
												</span>
											) : (
												<Button
													size="sm"
													onClick={() =>
														addFeed.mutate({
															sourceUrl: result.feedUrl,
															label: result.title,
														})
													}
													disabled={addFeed.isPending}
												>
													{isSubmitting ? "Adding..." : "Add"}
												</Button>
											)}
										</div>
									</div>
								);
							})}
							{!isSearchingDiscover &&
								discover.data &&
								!discover.data.length && (
									<EmptyState
										title="No feed matches yet"
										body="Try a creator name, topic, website, subreddit, or channel keyword."
									/>
								)}
						</div>
					</section>
				</>
			)}

			{!query.trim() && (
				<div className="mt-4">
					<EmptyState
						title="Search for feeds"
						body="Type a keyword to search your library and discover new feeds."
						icon={<Search className="size-6" />}
					/>
				</div>
			)}
		</MobileShell>
	);
}

function DiscoveryAvatar({
	title,
	sourceType,
	favicon,
}: {
	title: string;
	sourceType: string;
	favicon: string | null;
}) {
	const [failed, setFailed] = useState(false);
	const fallbackLabel = title.trim().charAt(0).toUpperCase() || "F";
	const isYouTube = sourceType === "YOUTUBE_RSS";
	const isReddit = sourceType === "REDDIT_RSS";

	if (favicon && !failed) {
		return (
			<div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-strong)] p-1.5">
				<Image
					src={favicon}
					alt=""
					width={48}
					height={48}
					unoptimized
					className="size-full rounded-[12px] object-contain"
					loading="lazy"
					onError={() => setFailed(true)}
				/>
			</div>
		);
	}

	return (
		<div
			className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border border-subtle text-sm font-semibold ${
				isYouTube
					? "bg-[var(--status-error-bg)] text-[var(--status-error)]"
					: isReddit
						? "bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
						: "bg-[var(--surface-muted)] text-secondary"
			}`}
		>
			{fallbackLabel}
		</div>
	);
}

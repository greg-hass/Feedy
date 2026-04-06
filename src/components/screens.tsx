"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronRight, FolderOpen, FolderPlus, MoreHorizontal, Plus, Rss, RefreshCcw, Search, Trash2, Upload } from "lucide-react";
import { useTheme } from "next-themes";

import { MobileShell, useMe, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { FeedAvatar } from "@/components/feed-avatar";
import { AddFeedForm, AddFolderForm, EditFeedSheet, EditFolderSheet } from "@/components/forms";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { accentOptions } from "@/lib/theme";
import { relativeTime } from "@/lib/utils";
import type { ItemRecord, NavFeed, NavFolder } from "@/types/app";

function formatSourceType(value: string) {
  return value.replaceAll("_RSS", "").replaceAll("_", " ");
}

function SectionLabel({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
        {eyebrow}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em]">{title}</h2>
        {meta ? <p className="text-[11px] text-secondary">{meta}</p> : null}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  columns,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ key: T; label: string }>;
  columns?: string;
}) {
  return (
    <div className={`grid gap-1 rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_78%,black_22%)] p-1 ${columns ?? `grid-cols-${options.length}`}`}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)]"
                : "text-secondary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function UnreadScreen() {
  const [stateFilter, setStateFilter] = useState<"UNREAD" | "ALL" | "READ">(() => {
    if (typeof window === "undefined") return "UNREAD";
    const saved = window.sessionStorage.getItem("feedy-timeline-state");
    return saved === "UNREAD" || saved === "ALL" || saved === "READ" ? saved : "UNREAD";
  });
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "RSS" | "REDDIT" | "YOUTUBE">(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.sessionStorage.getItem("feedy-timeline-source");
    return saved === "ALL" || saved === "RSS" || saved === "REDDIT" || saved === "YOUTUBE" ? saved : "ALL";
  });
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    window.sessionStorage.setItem("feedy-timeline-state", stateFilter);
    window.sessionStorage.setItem("feedy-timeline-source", sourceFilter);
  }, [stateFilter, sourceFilter]);

  const params = new URLSearchParams();
  if (stateFilter !== "UNREAD") {
    params.set("stateFilter", stateFilter);
  }
  if (sourceFilter !== "ALL") {
    params.set("sourceFilter", sourceFilter);
  }
  const itemsUrl = `/api/items${params.toString() ? `?${params.toString()}` : ""}`;

  const items = useQuery({
    queryKey: ["items", "timeline", stateFilter, sourceFilter],
    queryFn: () => api<ItemRecord[]>(itemsUrl),
  });

  const scrollStorageKey = `feedy-timeline-scroll:${stateFilter}:${sourceFilter}`;

  useEffect(() => {
    restoredScrollRef.current = false;
  }, [stateFilter, sourceFilter]);

  useEffect(() => {
    const saveScroll = () => {
      window.sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      saveScroll();
      window.removeEventListener("scroll", saveScroll);
    };
  }, [scrollStorageKey]);

  useEffect(() => {
    if (items.isLoading || restoredScrollRef.current) {
      return;
    }

    const savedScroll = Number(window.sessionStorage.getItem(scrollStorageKey) || "0");
    restoredScrollRef.current = true;

    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScroll, behavior: "auto" });
    });
  }, [items.isLoading, items.data, scrollStorageKey]);

  return (
    <MobileShell
      title="Timeline"
      actions={
        <RefreshButton endpoint="/api/refresh/all" invalidate={["items"]} />
      }
    >
      <section
        className="fixed inset-x-0 z-30 px-5 pb-3 pt-1"
        style={{ top: "calc(env(safe-area-inset-top) + 92px)", backgroundColor: "var(--app-bg)" }}
      >
        <div className="mx-auto max-w-md grid grid-cols-2 gap-3">
          <label className="block">
            <span className="sr-only">Timeline state</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as "UNREAD" | "ALL" | "READ")}
              className="h-12 w-full rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
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
              onChange={(event) => setSourceFilter(event.target.value as "ALL" | "RSS" | "REDDIT" | "YOUTUBE")}
              className="h-12 w-full rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              <option value="ALL">All feeds</option>
              <option value="RSS">RSS</option>
              <option value="REDDIT">Reddit</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
          </label>
        </div>
      </section>

      <div className="h-[68px]" />

      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div className="space-y-3">
          {items.data.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            stateFilter === "READ"
              ? "No read items here"
              : stateFilter === "ALL"
                ? "Nothing in this view"
              : "Inbox clear"
          }
          body={
            stateFilter === "READ"
              ? "Items you open will appear here so you can revisit them."
              : stateFilter === "ALL"
                ? "Try another feed type or refresh to pull in more items."
              : "New items will land here as feeds refresh."
          }
          icon={<Bookmark className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function FeedsScreen() {
  const me = useMe();
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [query, setQuery] = useState("");
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem("feedy-swipe-hint-dismissed");
    if (!dismissed) {
      setShowSwipeHint(true);
    }
  }, []);

  if (me.isLoading) return <MobileShell title="Feeds"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Feeds"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  const feeds = me.data?.navigation.feeds ?? [];
  const folders = me.data?.navigation.folders ?? [];

  const normalizedQuery = query.trim().toLowerCase();
  const matchesFeed = (feed: NavFeed) =>
    !normalizedQuery ||
    [feed.label, feed.title, feed.description, feed.sourceUrl, feed.siteUrl, formatSourceType(feed.sourceType)]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));

  const pinnedFeeds = feeds.filter((f) => f.isPinned && matchesFeed(f));
  const uncategorizedFeeds = feeds.filter((f) => !f.folderId && !f.isPinned && matchesFeed(f));
  const visibleFolders = folders
    .map((folder) => {
      const folderFeeds = feeds.filter((feed) => feed.folderId === folder.id);
      const matchingFeeds = folderFeeds.filter(matchesFeed);
      const folderMatches = folder.title.toLowerCase().includes(normalizedQuery);

      return {
        ...folder,
        matchingFeeds,
        visible:
          !normalizedQuery ||
          folderMatches ||
          matchingFeeds.length > 0,
      };
    })
    .filter((folder) => folder.visible);

  return (
    <MobileShell
      title="Feeds"
      subtitle="Manage subscriptions and folders"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddFolder(true)}
            className="rounded-2xl border border-subtle bg-[var(--surface)] p-2.5 text-secondary"
            aria-label="Create folder"
          >
            <FolderPlus className="size-4" />
          </button>
          <button
            onClick={() => setShowAddFeed(true)}
            className="rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] p-2.5 text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)]"
            aria-label="Add feed"
          >
            <Plus className="size-4" />
          </button>
        </div>
      }
    >
      {showAddFolder && (
        <div className="mb-3">
          <AddFolderForm onClose={() => setShowAddFolder(false)} />
        </div>
      )}

      {showAddFeed && (
        <div className="mb-3">
          <AddFeedForm
            folders={folders}
            onClose={() => setShowAddFeed(false)}
          />
        </div>
      )}

      <section className="mb-4 rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_90%,black_10%)] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 rounded-[20px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
          <Search className="size-4 shrink-0 text-secondary" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search feeds, folders, or source names"
            className="h-11 border-0 bg-transparent px-0"
          />
        </div>
      </section>

      {showSwipeHint ? (
        <section className="mb-4 flex items-center justify-between gap-3 rounded-[20px] border border-subtle bg-[var(--accent-soft)]/35 px-3.5 py-3 text-sm">
          <p className="text-[13px] text-secondary">
            Swipe a row left for edit and delete actions.
          </p>
          <button
            onClick={() => {
              setShowSwipeHint(false);
              window.localStorage.setItem("feedy-swipe-hint-dismissed", "1");
            }}
            className="rounded-full border border-subtle bg-[var(--surface)] px-3 py-1 text-[11px] font-medium text-secondary"
          >
            Got it
          </button>
        </section>
      ) : null}

      <div className="space-y-4">
        {pinnedFeeds.length > 0 && (
          <section>
            <SectionLabel eyebrow="Quick access" title="Pinned" meta={`${pinnedFeeds.length} feeds`} />
            <div className="space-y-2">
              {pinnedFeeds.map((feed, index) => (
                <FeedRow key={feed.id} feed={feed} feeds={pinnedFeeds} index={index} />
              ))}
            </div>
          </section>
        )}

        {visibleFolders.length > 0 && (
          <section>
            <SectionLabel eyebrow="Library" title="Folders" meta={`${visibleFolders.length} groups`} />
            <div className="space-y-2">
              {visibleFolders.map((folder, index) => (
                <FolderRow key={folder.id} folder={folder} folders={visibleFolders} index={index} />
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
                <FeedRow key={feed.id} feed={feed} feeds={uncategorizedFeeds} index={index} />
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

        {!!feeds.length && normalizedQuery && !pinnedFeeds.length && !visibleFolders.length && !uncategorizedFeeds.length && (
          <EmptyState
            title="No feeds match this search"
            body="Try a feed title, folder name, source URL, or source type."
            icon={<Search className="size-6" />}
          />
        )}
      </div>
    </MobileShell>
  );
}

export function FoldersScreen() {
  const me = useMe();
  const [showAddFolder, setShowAddFolder] = useState(false);

  if (me.isLoading) return <MobileShell title="Folders"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Folders"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  const folders = me.data?.navigation.folders ?? [];

  return (
    <MobileShell
      title="Folders"
      subtitle="Keep feeds organized"
      actions={
        <button
          onClick={() => setShowAddFolder(true)}
          className="rounded-2xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_100%,white_8%)_0%,var(--accent)_100%)] p-2.5 text-[var(--accent-contrast)] shadow-[0_14px_34px_rgba(var(--accent-rgb),0.24)]"
        >
          <FolderPlus className="size-4" />
        </button>
      }
    >
      {showAddFolder && (
        <div className="mb-3">
          <AddFolderForm onClose={() => setShowAddFolder(false)} />
        </div>
      )}

      <div className="space-y-2">
        {folders.map((folder, index) => (
          <FolderRow key={folder.id} folder={folder} folders={folders} index={index} />
        ))}
        {!folders.length && (
          <EmptyState
            title="No folders yet"
            body="Create folders to organize your feeds."
            icon={<FolderOpen className="size-6" />}
          />
        )}
      </div>
    </MobileShell>
  );
}

export function SavedScreen() {
  const items = useQuery({
    queryKey: ["items", "saved"],
    queryFn: () => api<ItemRecord[]>("/api/items?saved=true"),
  });

  return (
    <MobileShell title="Saved" subtitle="Your quiet backlog">
      {items.isLoading ? (
        <LoadingSkeleton />
      ) : items.error ? (
        <ErrorState message={items.error.message} onRetry={() => items.refetch()} />
      ) : items.data?.length ? (
        <div className="space-y-3">
          {items.data.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing saved yet"
          body="Bookmark articles, videos, or Reddit posts to keep them close."
          icon={<Bookmark className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "RSS" | "REDDIT" | "YOUTUBE">("ALL");
  const searchParams = new URLSearchParams({
    q: query,
    sourceFilter,
  });
  const local = useQuery({
    queryKey: ["search", query, sourceFilter],
    queryFn: () =>
      api<Array<{ id: string; title: string; label: string | null; description: string | null; sourceType: string; sourceUrl: string }>>(
        `/api/search?${searchParams.toString()}`,
      ),
    enabled: query.trim().length > 0,
  });
  const discover = useQuery({
    queryKey: ["discover", query, sourceFilter],
    queryFn: () =>
      api<Array<{ title: string; description?: string | null; siteName?: string | null; feedUrl: string; sourceType: string }>>(
        `/api/discover?${searchParams.toString()}`,
      ),
    enabled: query.trim().length > 1,
  });
  const queryClient = useQueryClient();
  const addFeed = useMutation({
    mutationFn: (body: { sourceUrl: string; label?: string | null }) =>
      api("/api/feeds", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <MobileShell title="Discover" subtitle="Find new feeds by keyword">
      <section className="rounded-[26px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.22)]">
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
        <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_80%,black_20%)] px-3.5">
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
              meta={sourceFilter === "ALL" ? undefined : formatSourceType(sourceFilter)}
            />
            <div className="space-y-2">
              {local.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {local.data?.map((feed) => (
                <div key={feed.id} className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">{formatSourceType(feed.sourceType)}</p>
                      <h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">{feed.label || feed.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-secondary">{feed.description || feed.sourceUrl}</p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-subtle bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent)]">
                      Added
                    </span>
                  </div>
                </div>
              ))}
              {local.data && !local.data.length && (
                <p className="text-sm text-secondary">No matching feeds in your library.</p>
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
              {discover.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {discover.data?.map((result) => (
                <div key={result.feedUrl} className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-secondary">
                        {result.siteName || formatSourceType(result.sourceType)}
                      </p>
                      <h3 className="mt-1 text-[15px] font-semibold leading-[1.25]">{result.title}</h3>
                      {result.description ? (
                        <p className="mt-1.5 text-xs leading-relaxed text-secondary line-clamp-2">
                          {result.description}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addFeed.mutate({ sourceUrl: result.feedUrl, label: result.title })}
                      disabled={addFeed.isPending}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
              {discover.data && !discover.data.length && (
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
        <EmptyState
          title="Search for feeds"
          body="Type a keyword to search your library and discover new feeds."
          icon={<Search className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function SettingsScreen() {
  const { setTheme, theme } = useTheme();
  const me = useMe();
  const queryClient = useQueryClient();
  const settings = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <MobileShell title="Settings" subtitle="Theme, refresh, and data">
      <div className="space-y-3">
        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Account</h3>
          <p className="mt-2 text-sm text-secondary">
            Signed in as <span className="font-medium text-[var(--text-primary)]">{me.data?.user.username}</span>
          </p>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["system", "light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTheme(t);
                  settings.mutate({ theme: t.toUpperCase() });
                }}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  theme === t
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--text-primary)]">Accent colour</p>
            <p className="mt-1 text-xs text-secondary">Used for active states and highlights.</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {accentOptions.map((option) => {
                const active = me.data?.user.settings.accentColor === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => settings.mutate({ accentColor: option.key })}
                    className={`flex size-11 items-center justify-center rounded-full border-2 transition-transform ${
                      active ? "scale-105 border-white" : "border-transparent"
                    }`}
                    style={{
                      backgroundColor: option.hex,
                      boxShadow: active ? "0 0 0 3px rgba(255,255,255,0.82)" : "none",
                    }}
                    aria-label={`Use ${option.label} accent`}
                    title={option.label}
                  >
                    {active ? <span className="text-lg font-semibold text-white">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Refresh cadence</h3>
          <p className="mt-2 text-xs text-secondary">
            Current: {me.data?.user.settings.refreshIntervalMinutes ?? 60} minutes
          </p>
          <div className="mt-3 flex gap-2">
            {[15, 30, 60, 180].map((minutes) => (
              <button
                key={minutes}
                onClick={() => settings.mutate({ refreshIntervalMinutes: minutes })}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  me.data?.user.settings.refreshIntervalMinutes === minutes
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Storage retention</h3>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            The timeline shows up to 100 items at once. Old read items that are not bookmarked are cleaned up automatically.
            Unread items and saved items are preserved.
          </p>
          <div className="mt-3 flex gap-2">
            {[30, 90, 180, 365].map((days) => (
              <button
                key={days}
                onClick={() => settings.mutate({ itemRetentionDays: days })}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  me.data?.user.settings.itemRetentionDays === days
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Import & export</h3>
          <p className="mt-2 text-xs text-secondary">
            Move subscriptions with OPML or keep a full JSON backup.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/app/import-export">
              <Button variant="secondary" className="w-full text-xs">
                <Upload className="size-3.5 mr-1.5" />
                Import / Export
              </Button>
            </Link>
            <a href="/api/export/json">
              <Button className="w-full text-xs">Download JSON</Button>
            </a>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

export function ImportExportScreen() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an OPML file");
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/import/opml", { method: "POST", body: form });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Import failed");
      }
      return response.json();
    },
    onMutate: () => {
      setStatus("uploading");
      setStatusMessage("Importing subscriptions and preserving folder structure...");
    },
    onSuccess: (result: {
      imported?: number;
      duplicates?: number;
      failed?: number;
      foldersCreated?: number;
    }) => {
      setFile(null);
      setStatus("success");
      const parts = [
        `${result.imported ?? 0} imported`,
        `${result.duplicates ?? 0} duplicates skipped`,
      ];
      if (typeof result.foldersCreated === "number") {
        parts.push(`${result.foldersCreated} folders created`);
      }
      if ((result.failed ?? 0) > 0) {
        parts.push(`${result.failed} failed`);
      }
      setStatusMessage(parts.join(" · "));
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Import failed");
    },
  });

  return (
    <MobileShell title="Import / Export" subtitle="Portable subscriptions and backups">
      <div className="space-y-3">
        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Import OPML</h3>
          <p className="mt-1 text-xs text-secondary">Upload an OPML file from another feed reader.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setStatus("idle");
              setStatusMessage("");
            }}
          />
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 items-center rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-secondary"
            >
              <span className="truncate">{file ? file.name : "Choose OPML file"}</span>
            </button>
            {file ? (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setStatus("idle");
                  setStatusMessage("");
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="h-12 rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-secondary"
              >
                Clear
              </button>
            ) : null}
          </div>
          <Button
            onClick={() => {
              if (!file) {
                setStatus("error");
                setStatusMessage("Choose an OPML file first.");
                return;
              }
              upload.mutate();
            }}
            className="mt-3 w-full"
            disabled={status === "uploading"}
          >
            {status === "uploading" ? "Importing..." : "Import subscriptions"}
          </Button>
          {status !== "idle" && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                status === "success"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : status === "error"
                  ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "bg-[var(--surface-muted)] text-secondary"
              }`}
            >
              {statusMessage}
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.18)]">
          <h3 className="text-sm font-semibold">Export</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/api/export/opml">
              <Button variant="secondary" className="w-full text-xs">
                Export OPML
              </Button>
            </a>
            <a href="/api/export/json">
              <Button className="w-full text-xs">Export JSON</Button>
            </a>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

function FeedRow({ feed, feeds, index }: { feed: NavFeed; feeds: NavFeed[]; index: number }) {
  const [showEdit, setShowEdit] = useState(false);
  const queryClient = useQueryClient();

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
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
              aria-label={`Delete ${feed.label || feed.title}`}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--surface-muted)] text-secondary"
              aria-label={`Edit ${feed.label || feed.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </>
        }
      >
        <Link href={`/app/feeds/${feed.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] px-3 py-3">
          <FeedAvatar feedId={feed.id} title={feed.label || feed.title} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{feed.label || feed.title}</h3>
              {feed.counts.unreadCount > 0 && (
                <span className="rounded-full border border-subtle bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
                  {feed.counts.unreadCount}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-secondary">
              {feed.description || feed.sourceUrl}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-secondary">
              <span>{formatSourceType(feed.sourceType)}</span>
              <span>·</span>
              <span>{relativeTime(feed.lastRefreshedAt)}</span>
            </div>
          </div>
        </Link>
      </SwipeRow>

      {showEdit && (
        <EditFeedSheet
          feed={feed}
          onClose={() => setShowEdit(false)}
          onDelete={() => deleteFeed.mutate()}
          onReorder={(direction) => reorder.mutate(direction)}
        />
      )}
    </>
  );
}

function FolderRow({ folder, folders, index }: { folder: NavFolder; folders: NavFolder[]; index: number }) {
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
      if (targetIndex < 0 || targetIndex >= folders.length) return Promise.resolve();
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
                if (confirm(`Delete folder ${folder.title}? Feeds will become uncategorized.`)) {
                  deleteFolder.mutate();
                }
              }}
              disabled={deleteFolder.isPending}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
              aria-label={`Delete folder ${folder.title}`}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[18px] bg-[var(--surface-muted)] text-secondary"
              aria-label={`Edit folder ${folder.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </>
        }
      >
        <Link href={`/app/folders/${folder.id}`} className="group flex items-center justify-between gap-3 rounded-[24px] px-3.5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]">
              <FolderOpen className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{folder.title}</h3>
              <p className="mt-1 text-xs text-secondary">
                {folder.counts.unreadCount} unread · {folder.counts.totalCount} feeds
              </p>
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
}: {
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
      <div className="absolute inset-y-[5px] right-[5px] flex items-center gap-2">
        {actions}
      </div>
      <div
        className={`relative z-10 bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] transition-transform duration-200 ease-out ${
          open ? "-translate-x-[122px]" : "translate-x-0"
        }`}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
          touchDeltaX.current = 0;
        }}
        onTouchMove={(event) => {
          if (touchStartX.current === null) return;
          touchDeltaX.current = (event.touches[0]?.clientX ?? 0) - touchStartX.current;
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

function RefreshButton({
  endpoint,
  invalidate,
}: {
  endpoint: string;
  invalidate: string[];
}) {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState(false);
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: () => api(endpoint, { method: "POST" }),
    onSuccess: async () => {
      setQueued(true);
      setProgress(18);
      await queryClient.invalidateQueries({ queryKey: invalidate });
      await queryClient.invalidateQueries({ queryKey: ["me"] });

      const steps = [
        { delay: 1200, progress: 42 },
        { delay: 3200, progress: 68 },
        { delay: 6200, progress: 88 },
        { delay: 8400, progress: 100 },
      ];
      steps.forEach(({ delay, progress: nextProgress }, index) => {
        setTimeout(() => {
          setProgress(nextProgress);
          void queryClient.invalidateQueries({ queryKey: invalidate });
          void queryClient.invalidateQueries({ queryKey: ["me"] });
          if (index === steps.length - 1) {
            setTimeout(() => {
              setQueued(false);
              setProgress(0);
            }, 300);
          }
        }, delay);
      });
    },
    onError: () => {
      setQueued(false);
      setProgress(0);
    },
  });

  const active = mutation.isPending || queued;

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: invalidate });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [active, invalidate, queryClient]);

  return (
    <>
      <button
        onClick={() => mutation.mutate()}
        disabled={active}
        className={`rounded-2xl border p-2.5 active:bg-[var(--surface-muted)] disabled:opacity-70 ${
          active
            ? "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]"
            : "border-subtle bg-[var(--surface)] text-secondary"
        }`}
        aria-label={active ? "Refreshing feeds" : "Refresh feeds"}
      >
        <RefreshCcw className={`size-4 ${active ? "animate-spin" : ""}`} />
      </button>
      {active ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+70px)] z-50 px-5">
          <div className="mx-auto w-full max-w-md rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_94%,black_6%)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  {mutation.isPending ? "Queueing refresh" : "Refreshing feeds"}
                </p>
                <p className="mt-0.5 text-[11px] text-secondary">
                  Pulling in the latest items from your subscriptions.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--accent)]">
                {progress}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_100%,white_20%)_100%)] transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

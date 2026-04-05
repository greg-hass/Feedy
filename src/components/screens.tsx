"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronRight, FolderOpen, FolderPlus, MoreHorizontal, Plus, Rss, RefreshCcw, Search, Upload } from "lucide-react";
import { useTheme } from "next-themes";

import { MobileShell, useMe, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { FeedAvatar } from "@/components/feed-avatar";
import { AddFeedForm, AddFolderForm, EditFeedSheet, EditFolderSheet } from "@/components/forms";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/utils";
import type { ItemRecord, NavFeed, NavFolder } from "@/types/app";

export function UnreadScreen() {
  const [feedFilter, setFeedFilter] = useState<string | null>(null);

  const items = useQuery({
    queryKey: ["items", "unread", feedFilter],
    queryFn: () => api<ItemRecord[]>(`/api/items${feedFilter ? `?feedId=${feedFilter}` : ""}`),
  });

  const me = useMe();

  return (
    <MobileShell
      title="Unread"
      actions={
        <RefreshButton endpoint="/api/refresh/all" invalidate={["items", "unread"]} />
      }
    >
      {me.data && me.data.navigation.feeds.length > 3 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setFeedFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              !feedFilter
                ? "bg-[var(--accent)] text-white"
                : "border border-subtle bg-[var(--surface-muted)] text-secondary"
            }`}
          >
            All
          </button>
          {me.data.navigation.feeds.map((feed) => (
            <button
              key={feed.id}
              onClick={() => setFeedFilter(feed.id === feedFilter ? null : feed.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                feedFilter === feed.id
                  ? "bg-[var(--accent)] text-white"
                  : "border border-subtle bg-[var(--surface-muted)] text-secondary"
              }`}
            >
              {feed.label || feed.title}
            </button>
          ))}
        </div>
      )}

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
          title="Inbox clear"
          body="New items will land here as feeds refresh."
          icon={<Bookmark className="size-6" />}
        />
      )}
    </MobileShell>
  );
}

export function FeedsScreen() {
  const me = useMe();
  const [showAddFeed, setShowAddFeed] = useState(false);

  if (me.isLoading) return <MobileShell title="Feeds"><LoadingSkeleton /></MobileShell>;
  if (me.error) return <MobileShell title="Feeds"><ErrorState message={me.error.message} onRetry={() => me.refetch()} /></MobileShell>;

  const feeds = me.data?.navigation.feeds ?? [];
  const folders = me.data?.navigation.folders ?? [];

  const pinnedFeeds = feeds.filter((f) => f.isPinned);
  const uncategorizedFeeds = feeds.filter((f) => !f.folderId && !f.isPinned);

  return (
    <MobileShell
      title="Feeds"
      subtitle="Manage subscriptions and folders"
      actions={
        <button
          onClick={() => setShowAddFeed(true)}
          className="rounded-xl bg-[var(--accent)] p-2 text-white"
        >
          <Plus className="size-4" />
        </button>
      }
    >
      {showAddFeed && (
        <div className="mb-3">
          <AddFeedForm
            folders={folders}
            onClose={() => setShowAddFeed(false)}
          />
        </div>
      )}

      <div className="space-y-4">
        {pinnedFeeds.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-[0.18em] text-secondary">Pinned</h2>
            <div className="space-y-2">
              {pinnedFeeds.map((feed, index) => (
                <FeedRow key={feed.id} feed={feed} feeds={pinnedFeeds} index={index} />
              ))}
            </div>
          </section>
        )}

        {folders.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-[0.18em] text-secondary">Folders</h2>
            <div className="space-y-2">
              {folders.map((folder, index) => (
                <FolderRow key={folder.id} folder={folder} folders={folders} index={index} />
              ))}
            </div>
          </section>
        )}

        {uncategorizedFeeds.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-[0.18em] text-secondary">
              {folders.length > 0 ? "Uncategorized" : "All feeds"}
            </h2>
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
          className="rounded-xl bg-[var(--accent)] p-2 text-white"
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
  const local = useQuery({
    queryKey: ["search", query],
    queryFn: () => api<Array<{ id: string; title: string; label: string | null; description: string | null; sourceType: string; sourceUrl: string }>>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
  const discover = useQuery({
    queryKey: ["discover", query],
    queryFn: () =>
      api<Array<{ title: string; description?: string | null; siteName?: string | null; feedUrl: string; sourceType: string }>>(`/api/discover?q=${encodeURIComponent(query)}`),
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
      <div className="surface rounded-[24px] border border-subtle p-3">
        <div className="flex items-center gap-3">
          <Search className="size-4 text-secondary shrink-0" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ai research, design, blender..."
            className="border-0 bg-transparent px-0 h-10"
          />
        </div>
      </div>

      {query.trim().length > 0 && (
        <>
          <section className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-secondary">My feeds</p>
            <div className="space-y-2">
              {local.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {local.data?.map((feed) => (
                <div key={feed.id} className="surface rounded-[24px] border border-subtle p-4">
                  <h3 className="text-sm font-semibold">{feed.label || feed.title}</h3>
                  <p className="mt-1 text-xs text-secondary">{feed.description || feed.sourceUrl}</p>
                  <span className="mt-2 inline-block rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    Subscribed
                  </span>
                </div>
              ))}
              {local.data && !local.data.length && (
                <p className="text-sm text-secondary">No matching feeds in your library.</p>
              )}
            </div>
          </section>

          <section className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-secondary">Discover feeds</p>
            <div className="space-y-2">
              {discover.isLoading && <p className="text-sm text-secondary">Searching...</p>}
              {discover.data?.map((result) => (
                <div key={result.feedUrl} className="surface rounded-[24px] border border-subtle p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate">{result.title}</h3>
                      <p className="mt-1 text-xs text-secondary">
                        {result.siteName || result.sourceType}{result.description ? ` · ${result.description}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
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
        <div className="surface rounded-[24px] border border-subtle p-4">
          <h3 className="text-sm font-semibold">Account</h3>
          <p className="mt-2 text-sm text-secondary">
            Signed in as <span className="font-medium text-[var(--text-primary)]">{me.data?.user.username}</span>
          </p>
        </div>

        <div className="surface rounded-[24px] border border-subtle p-4">
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
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-subtle text-secondary"
                }`}
              >
                {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>

        <div className="surface rounded-[24px] border border-subtle p-4">
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
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-subtle text-secondary"
                }`}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        <div className="surface rounded-[24px] border border-subtle p-4">
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
      setStatusMessage("");
    },
    onSuccess: () => {
      setFile(null);
      setStatus("success");
      setStatusMessage("Import successful!");
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
        <div className="surface rounded-[24px] border border-subtle p-4">
          <h3 className="text-sm font-semibold">Import OPML</h3>
          <p className="mt-1 text-xs text-secondary">Upload an OPML file from another feed reader.</p>
          <input
            type="file"
            accept=".opml,.xml,text/xml"
            className="mt-3 block w-full text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setStatus("idle");
            }}
          />
          <Button
            onClick={() => upload.mutate()}
            className="mt-3 w-full"
            disabled={!file || status === "uploading"}
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

        <div className="surface rounded-[24px] border border-subtle p-4">
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
      <div className="surface rounded-[20px] border border-subtle p-3">
        <div className="flex items-center gap-3">
          <FeedAvatar feedId={feed.id} title={feed.label || feed.title} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold">{feed.label || feed.title}</h3>
              <div className="flex items-center gap-1 shrink-0">
                {feed.counts.unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    {feed.counts.unreadCount}
                  </span>
                )}
                <button
                  onClick={() => setShowEdit(true)}
                  className="rounded-lg p-1.5 text-secondary"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-0.5 truncate text-xs text-secondary">
              {feed.description || feed.sourceUrl}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-secondary">
              <span>{relativeTime(feed.lastRefreshedAt)}</span>
              <span>·</span>
              <span>{feed.sourceType.replaceAll("_", " ")}</span>
            </div>
          </div>
        </div>
      </div>

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
      <Link href={`/app/folders/${folder.id}`}>
        <div className="surface rounded-[20px] border border-subtle p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FolderOpen className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{folder.title}</h3>
                <p className="text-xs text-secondary">
                  {folder.counts.unreadCount} unread · {folder.counts.totalCount} total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowEdit(true);
                }}
                className="rounded-lg p-1.5 text-secondary"
              >
                <MoreHorizontal className="size-4" />
              </button>
              <ChevronRight className="size-4 text-secondary" />
            </div>
          </div>
        </div>
      </Link>

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

function RefreshButton({
  endpoint,
  invalidate,
}: {
  endpoint: string;
  invalidate: string[];
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api(endpoint, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invalidate });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      className="rounded-xl border border-subtle p-2 text-secondary active:bg-[var(--surface-muted)]"
    >
      <RefreshCcw className={`size-4 ${mutation.isPending ? "animate-spin" : ""}`} />
    </button>
  );
}

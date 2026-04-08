"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, MoreHorizontal, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FeedAvatar } from "@/components/feed-avatar";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { MobileShell, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { api } from "@/lib/client";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord, NavFeed } from "@/types/app";

export default function FeedDetailPage() {
  const params = useParams<{ feedId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [refreshQueued, setRefreshQueued] = useState(false);

  const items = useQuery({
    queryKey: ["items", "feed", params.feedId],
    queryFn: () => api<ItemRecord[]>(`/api/items?feedId=${params.feedId}`),
    staleTime: 15_000,
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      import("@/lib/client").then(({ api }) =>
        api<{ navigation: { feeds: NavFeed[] } }>("/api/me"),
      ),
    staleTime: 30_000,
  });

  const feed = me.data?.navigation.feeds.find((f) => f.id === params.feedId);
  const feedTitle = decodeHtmlEntities(feed?.label || feed?.title || "");

  const refresh = useMutation({
    mutationFn: () => api(`/api/feeds/${params.feedId}/refresh`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items", "feed", params.feedId] });
      setRefreshQueued(true);
      const delays = [1500, 4000, 8000];
      delays.forEach((delay, index) => {
        setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["me"] });
          void queryClient.invalidateQueries({ queryKey: ["items", "feed", params.feedId] });
          if (index === delays.length - 1) {
            setRefreshQueued(false);
          }
        }, delay);
      });
    },
    onError: () => setRefreshQueued(false),
  });

  const markRead = useMutation({
    mutationFn: () => api(`/api/feeds/${params.feedId}/mark-read`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["items", "feed", params.feedId] });
    },
  });

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
        {me.isLoading ? <LoadingSkeleton /> : <ErrorState message="Feed not found" onRetry={() => me.refetch()} />}
      </MobileShell>
    );
  }

  return (
    <div className="screen-fade">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-4">
        <header className="sticky top-3 z-20">
          <div className="surface rounded-[24px] border border-subtle px-4 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="rounded-lg p-1 text-secondary">
                <ArrowLeft className="size-5" />
              </button>
              <FeedAvatar feedId={feed.id} title={feedTitle} />
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold truncate">{feedTitle}</h1>
                <p className="text-xs text-secondary">
                  {feed.counts.unreadCount} unread · {relativeTime(feed.lastRefreshedAt)}
                </p>
                {refreshQueued ? (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Refreshing
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending || refreshQueued}
                  className="rounded-lg p-2 text-secondary disabled:opacity-70"
                >
                  <RefreshCcw className={`size-4 ${(refresh.isPending || refreshQueued) ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setShowEdit(true)}
                  className="rounded-lg p-2 text-secondary"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending || feed.counts.unreadCount === 0}
          >
            Mark all read
          </Button>
          {feed.siteUrl && (
            <a href={feed.siteUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" className="gap-1.5">
                Website
                <ExternalLink className="size-3.5" />
              </Button>
            </a>
          )}
        </div>

        <main className="mt-4 flex-1">
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
    </div>
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
  const me = queryClient.getQueryData<{ navigation: { folders: Array<{ id: string; title: string }> } }>(["me"]);
  const folders = me?.navigation.folders ?? [];
  const [folderId, setFolderId] = useState(feed.folderId || "");
  const [excludeFromTimeline, setExcludeFromTimeline] = useState(feed.excludeFromTimeline);

  const mutation = useMutation({
    mutationFn: () =>
      import("@/lib/client").then(({ api }) =>
        api(`/api/feeds/${feed.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: label || null,
            folderId: folderId || null,
            excludeFromTimeline,
          }),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[24px] bg-[var(--surface-strong)] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">Edit feed</h3>
        <p className="mt-1 truncate text-xs text-secondary">{feed.sourceUrl}</p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={feed.title}
            className="h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
          />
        </label>
        {folders.length > 0 && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">Folder</span>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
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
          <span className={`inline-flex size-4 items-center justify-center rounded border ${excludeFromTimeline ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-subtle"}`}>
            {excludeFromTimeline ? "✓" : ""}
          </span>
          Hide from Timeline
        </button>
        <button onClick={() => mutation.mutate()} className="mt-4 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white">
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

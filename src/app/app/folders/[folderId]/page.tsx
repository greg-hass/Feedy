"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FolderOpen, RefreshCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FeedAvatar } from "@/components/feed-avatar";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { MobileShell, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
import { api } from "@/lib/client";
import { decodeHtmlEntities } from "@/lib/utils";
import type { ItemRecord, NavFeed, NavFolder } from "@/types/app";

export default function FolderDetailPage() {
  const params = useParams<{ folderId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshQueued, setRefreshQueued] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ navigation: { folders: NavFolder[]; feeds: NavFeed[] } }>("/api/me"),
  });

  const folder = me.data?.navigation.folders.find((f) => f.id === params.folderId);
  const folderFeeds = me.data?.navigation.feeds.filter((f) => f.folderId === params.folderId) ?? [];
  const folderTitle = decodeHtmlEntities(folder?.title || "");

  const items = useQuery({
    queryKey: ["items", "folder", params.folderId],
    queryFn: async () => {
      const allItems: ItemRecord[] = [];
      for (const feed of folderFeeds) {
        const feedItems = await api<ItemRecord[]>(`/api/items?feedId=${feed.id}`);
        allItems.push(...feedItems);
      }
      return allItems
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
        .slice(0, 100);
    },
    enabled: !!folderFeeds.length,
  });

  const refresh = useMutation({
    mutationFn: () => api(`/api/folders/${params.folderId}/refresh`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items", "folder", params.folderId] });
      setRefreshQueued(true);
      const delays = [1500, 4000, 8000];
      delays.forEach((delay, index) => {
        setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["me"] });
          void queryClient.invalidateQueries({ queryKey: ["items", "folder", params.folderId] });
          if (index === delays.length - 1) {
            setRefreshQueued(false);
          }
        }, delay);
      });
    },
    onError: () => setRefreshQueued(false),
  });

  const markRead = useMutation({
    mutationFn: () => api(`/api/folders/${params.folderId}/mark-read`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["items", "folder", params.folderId] });
    },
  });

  if (!folder) {
    return (
      <MobileShell title="Folder">
        {me.isLoading ? <LoadingSkeleton /> : <ErrorState message="Folder not found" onRetry={() => me.refetch()} />}
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
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FolderOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-semibold">{folderTitle}</h1>
                <p className="text-xs text-secondary">
                  {folder.counts.unreadCount} unread · {folderFeeds.length} feeds
                </p>
                {refreshQueued ? (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                    Refreshing
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending || refreshQueued}
                className="rounded-lg p-2 text-secondary disabled:opacity-70"
              >
                <RefreshCcw className={`size-4 ${(refresh.isPending || refreshQueued) ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        {folderFeeds.length > 0 && (
          <section className="mt-3 rounded-[22px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.16)]">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
                Feeds in folder
              </p>
              <p className="text-[11px] text-secondary">{folderFeeds.length} sources</p>
            </div>
            <div className="space-y-2">
              {folderFeeds.map((feed) => (
                <Link
                  key={feed.id}
                  href={`/app/feeds/${feed.id}`}
                  className="flex items-center gap-3 rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3 py-2.5 transition-colors hover:border-[var(--accent)]/20"
                >
                  <FeedAvatar feedId={feed.id} title={decodeHtmlEntities(feed.label || feed.title)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {decodeHtmlEntities(feed.label || feed.title)}
                      </p>
                      {feed.counts.unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full border border-subtle bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                          {feed.counts.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-secondary">
                      <span>{feed.sourceType.replaceAll("_RSS", "").replaceAll("_", " ")}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending || folder.counts.unreadCount === 0}
          >
            Mark all read
          </Button>
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
    </div>
  );
}

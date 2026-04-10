"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, EyeOff, FolderOpen, MoreHorizontal, RefreshCcw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { FeedAvatar } from "@/components/feed-avatar";
import { EditFeedSheet } from "@/components/forms";
import { ItemCard } from "@/components/item-card";
import { Button } from "@/components/ui/button";
import { MobileShell, LoadingSkeleton, ErrorState, EmptyState } from "@/components/app-shell";
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
  const [refreshQueued, setRefreshQueued] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ navigation: { folders: NavFolder[]; feeds: NavFeed[] } }>("/api/me"),
    staleTime: 30_000,
  });

  const folder = me.data?.navigation.folders.find((f) => f.id === params.folderId);
  const folderFeeds =
    me.data?.navigation.feeds
      .filter((f) => f.folderId === params.folderId)
      .sort(compareFeedLabels) ?? [];
  const folderTitle = decodeHtmlEntities(folder?.title || "");

  const items = useQuery({
    queryKey: ["items", "folder", params.folderId],
    queryFn: () => api<ItemRecord[]>(`/api/items?folderId=${params.folderId}`),
    enabled: !!folderFeeds.length,
    staleTime: 15_000,
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
              <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]">
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
                <FolderFeedRow key={feed.id} feed={feed} />
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
              className="flex h-[calc(100%-10px)] w-14 items-center justify-center rounded-[16px] bg-[var(--danger)]/12 text-[var(--danger)] disabled:opacity-60"
              aria-label={`Delete ${feed.label || feed.title}`}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
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
          className="flex items-center gap-3 rounded-[18px] border border-subtle bg-[var(--surface-muted)] px-3 py-2.5 transition-colors hover:border-[var(--accent)]/20"
        >
          <FeedAvatar feedId={feed.id} title={decodeHtmlEntities(feed.label || feed.title)} />
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
              <span>{feed.sourceType.replaceAll("_RSS", "").replaceAll("_", " ")}</span>
              {feed.performance.isSlow ? (
                <>
                  <span>·</span>
                  <span className="font-medium text-amber-300">
                    Slow {feed.performance.latestDurationMs ? `${Math.max(feed.performance.latestDurationMs / 1000, 0.1).toFixed(feed.performance.latestDurationMs >= 10_000 ? 0 : 1)}s` : ""}
                  </span>
                </>
              ) : null}
              {feed.excludeFromTimeline ? (
                <>
                  <span>·</span>
                  <span
                    className="inline-flex items-center text-rose-300"
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
      <div className="absolute inset-y-[5px] right-[5px] flex items-center gap-2">
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

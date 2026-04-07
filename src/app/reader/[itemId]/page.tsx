"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FeedAvatar } from "@/components/feed-avatar";
import { api } from "@/lib/client";
import type { ItemRecord } from "@/types/app";

export default function ReaderPage() {
  const params = useParams<{ itemId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);

  const item = useQuery({
    queryKey: ["reader", params.itemId],
    queryFn: () => api<ItemRecord>(`/api/items/${params.itemId}/reader`),
  });

  const state = useMutation({
    mutationFn: (body: { read?: boolean; bookmarked?: boolean }) =>
      api(`/api/items/${params.itemId}/state`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      queryClient.setQueriesData({ queryKey: ["items"] }, (current: ItemRecord[] | undefined) =>
        current?.map((entry) =>
          entry.id === params.itemId
            ? {
                ...entry,
                read: variables.read ?? entry.read,
                bookmarked: variables.bookmarked ?? entry.bookmarked,
              }
            : entry,
        ),
      );
      queryClient.setQueryData(["reader", params.itemId], (current: ItemRecord | undefined) =>
        current
          ? {
              ...current,
              read: variables.read ?? current.read,
              bookmarked: variables.bookmarked ?? current.bookmarked,
            }
          : current,
      );
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  useEffect(() => {
    if (item.data && !item.data.read && !state.isPending) {
      state.mutate({ read: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data?.id]);

  useEffect(() => {
    if (!bookmarkAnimating) {
      return;
    }

    const timeout = window.setTimeout(() => setBookmarkAnimating(false), 320);
    return () => window.clearTimeout(timeout);
  }, [bookmarkAnimating]);

  if (item.isLoading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="animate-pulse rounded-[28px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
          <div className="h-3 w-20 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-3 h-8 w-3/4 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-4 h-5 w-1/2 rounded-full bg-[var(--surface-muted)]" />
          <div className="mt-6 space-y-2">
            {[60, 80, 95, 70, 85, 50, 90, 75].map((width, i) => (
              <div key={i} className="h-4 rounded-full bg-[var(--surface-muted)]" style={{ width: `${width}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="rounded-[28px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] p-6 text-center shadow-[0_20px_48px_rgba(0,0,0,0.24)]">
          <p className="text-sm text-secondary">Failed to load article.</p>
          <Button onClick={() => router.back()} className="mt-4">Go back</Button>
        </div>
      </div>
    );
  }

  const data = item.data;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
      <header
        className="sticky top-0 z-40 -mx-4 px-4 pb-4 pt-1"
        style={{ backgroundColor: "var(--app-bg)" }}
      >
        <div className="rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface-strong)_92%,black_8%)] px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.24)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-2 text-secondary">
              <ArrowLeft className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!data.bookmarked) {
                    setBookmarkAnimating(true);
                  }
                  state.mutate({ bookmarked: !data.bookmarked });
                }}
                className={`rounded-xl border p-2 ${
                  data.bookmarked
                    ? `border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.22)] ${
                        bookmarkAnimating ? "bookmark-pop" : ""
                      }`
                    : "border-subtle bg-[var(--surface-muted)] text-secondary"
                }`}
              >
                <Bookmark className="size-5" fill={data.bookmarked ? "currentColor" : "none"} />
              </button>
              {data.canonicalUrl && (
                <>
                  <button
                    onClick={() => {
                      if (navigator.share && data.canonicalUrl) {
                        navigator.share({ title: data.title, url: data.canonicalUrl });
                      }
                    }}
                    className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-2 text-secondary"
                  >
                    <Share2 className="size-5" />
                  </button>
                  <a href={data.canonicalUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-subtle bg-[var(--surface-muted)] p-2 text-secondary">
                    <ExternalLink className="size-5" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="screen-enter mt-1 overflow-hidden rounded-[28px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2">
            <FeedAvatar feedId={data.feed.id} title={data.feed.label || data.feed.title} />
            <p className="text-xs uppercase tracking-[0.18em] text-secondary">
              {data.feed.label || data.feed.title}
            </p>
          </div>

          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em]">{data.title}</h1>

          <div className="mt-3 flex items-center justify-between text-xs text-secondary">
            <span>{new Date(data.publishedAt || 0).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-[var(--accent-contrast)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]">
              {data.feed.sourceType.replaceAll("_", " ")}
            </span>
          </div>

          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full px-4"
              onClick={() => state.mutate({ read: !data.read })}
              disabled={state.isPending}
            >
              {data.read ? "Mark unread" : "Mark read"}
            </Button>
          </div>

          {data.youtubeVideoId && (
            <div className="mt-4 overflow-hidden rounded-[20px] border border-subtle">
              <iframe
                src={`https://www.youtube.com/embed/${data.youtubeVideoId}`}
                title={data.title}
                className="aspect-video w-full"
                allowFullScreen
              />
            </div>
          )}

          {data.redditPermalink && (
            <a
              href={data.redditPermalink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center gap-2 rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
            >
              <span className="font-medium">View on Reddit</span>
              <ExternalLink className="size-3.5 text-secondary" />
            </a>
          )}

          {data.mediaUrl && !data.youtubeVideoId && (
            <div className="mt-4 overflow-hidden rounded-[20px] border border-subtle">
              <img src={data.mediaUrl} alt="" className="w-full" loading="lazy" />
            </div>
          )}
        </div>

        {data.readabilityHtml || data.contentHtml ? (
          <article
            className="reader-content mt-4 px-5 pb-5"
            dangerouslySetInnerHTML={{
              __html: data.readabilityHtml || data.contentHtml || `<p>${data.summary || ""}</p>`,
            }}
          />
        ) : data.summary ? (
          <div className="mt-4 px-5 pb-5">
            <p className="text-sm leading-relaxed text-secondary">{data.summary}</p>
          </div>
        ) : null}

        {data.canonicalUrl && (
          <div className="border-t border-subtle px-5 py-4">
            <a
              href={data.canonicalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
            >
              <span className="font-medium">Read original article</span>
              <ExternalLink className="size-4 text-secondary" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

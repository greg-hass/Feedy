"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, Share2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { FeedAvatar } from "@/components/feed-avatar";
import { api } from "@/lib/client";
import type { ItemRecord } from "@/types/app";

export default function ReaderPage() {
  const params = useParams<{ itemId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["reader", params.itemId] });
    },
  });

  useEffect(() => {
    state.mutate({ read: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (item.isLoading) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4">
        <div className="surface animate-pulse rounded-[24px] border border-subtle p-5">
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
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4">
        <div className="surface rounded-[24px] border border-subtle p-6 text-center">
          <p className="text-sm text-secondary">Failed to load article.</p>
          <Button onClick={() => router.back()} className="mt-4">Go back</Button>
        </div>
      </div>
    );
  }

  const data = item.data;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4">
      <div className="surface rounded-[24px] border border-subtle">
        <header className="sticky top-3 z-20 rounded-t-[24px] border-b border-subtle bg-[var(--surface-strong)] px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => router.back()} className="rounded-lg p-1 text-secondary">
              <ArrowLeft className="size-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => state.mutate({ bookmarked: !data.bookmarked })}
                className="rounded-lg p-2 text-secondary"
              >
                {data.bookmarked ? (
                  <BookmarkCheck className="size-5 text-[var(--accent)]" />
                ) : (
                  <Bookmark className="size-5" />
                )}
              </button>
              {data.canonicalUrl && (
                <>
                  <button
                    onClick={() => {
                      if (navigator.share && data.canonicalUrl) {
                        navigator.share({ title: data.title, url: data.canonicalUrl });
                      }
                    }}
                    className="rounded-lg p-2 text-secondary"
                  >
                    <Share2 className="size-5" />
                  </button>
                  <a href={data.canonicalUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-secondary">
                    <ExternalLink className="size-5" />
                  </a>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="px-5 pt-4">
          <div className="flex items-center gap-2">
            <FeedAvatar feedId={data.feed.id} title={data.feed.label || data.feed.title} />
            <p className="text-xs uppercase tracking-[0.18em] text-secondary">
              {data.feed.label || data.feed.title}
            </p>
          </div>

          <h1 className="mt-3 text-2xl font-semibold leading-tight">{data.title}</h1>

          <div className="mt-3 flex items-center justify-between text-xs text-secondary">
            <span>{new Date(data.publishedAt || 0).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              {data.feed.sourceType.replaceAll("_", " ")}
            </span>
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
              className="mt-4 flex items-center gap-2 rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
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
              className="flex items-center justify-between rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 py-3 text-sm"
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

"use client";

import Link from "next/link";
import { Bookmark, Check, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { updateItemStateCaches, updateReaderStateCache } from "@/lib/item-state-cache";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord } from "@/types/app";
import {
  getSavedYouTubeProgressSeconds,
  YouTubeInlinePlayer,
} from "@/components/youtube-inline-player";

function formatResumeTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export const ItemCard = memo(function ItemCard({ item }: { item: ItemRecord }) {
  const queryClient = useQueryClient();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [playInline, setPlayInline] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const markedReadFromPlaybackRef = useRef(false);
  const rememberTimelineAnchor = () => {
    window.sessionStorage.setItem("feedy-timeline-anchor-item", item.id);
  };

  useEffect(() => {
    if (!bookmarkAnimating) {
      return;
    }

    const timeout = window.setTimeout(() => setBookmarkAnimating(false), 320);
    return () => window.clearTimeout(timeout);
  }, [bookmarkAnimating]);

  useEffect(() => {
    if (!item.youtubeVideoId) {
      setResumeSeconds(0);
      return;
    }

    setResumeSeconds(getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId));
  }, [item.id, item.youtubeVideoId]);

  useEffect(() => {
    markedReadFromPlaybackRef.current = item.read;
  }, [item.read]);

  const updateState = useMutation({
    mutationFn: (body: { read?: boolean; bookmarked?: boolean }) =>
      api(`/api/items/${item.id}/state`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_result, variables) => {
      updateItemStateCaches(queryClient, item.id, variables);
      updateReaderStateCache(queryClient, item.id, variables);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const isYouTube = item.feed.sourceType.includes("YOUTUBE");
  const thumbnailUrl = isYouTube && item.youtubeVideoId
    ? `https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`
    : item.mediaUrl;
  const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
  const itemTitle = decodeHtmlEntities(item.title);

  return (
    <article
      data-timeline-item-id={item.id}
      className="group overflow-hidden rounded-2xl border border-subtle bg-surface transition-all duration-300 hover:border-[var(--accent)]/20 hover:shadow-lg"
      style={{ contentVisibility: "auto", containIntrinsicSize: "420px" }}
    >
      {/* Thumbnail */}
      {thumbnailUrl && (
        isYouTube && item.youtubeVideoId ? (
          <div className="relative overflow-hidden">
            {playInline ? (
              <YouTubeInlinePlayer
                itemId={item.id}
                videoId={item.youtubeVideoId}
                title={itemTitle}
                onProgressChange={setResumeSeconds}
                onMeaningfulPlayback={() => {
                  if (markedReadFromPlaybackRef.current) {
                    return;
                  }

                  markedReadFromPlaybackRef.current = true;
                  updateState.mutate({ read: true });
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlayInline(true)}
                className="relative block w-full overflow-hidden text-left"
                aria-label={`Play ${itemTitle} inline`}
              >
                <div className="aspect-video w-full bg-surface-muted">
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
                      imageLoaded ? "opacity-100" : "opacity-0"
                    }`}
                    loading="lazy"
                    onLoad={() => setImageLoaded(true)}
                  />
                  {!imageLoaded && <div className="absolute inset-0 shimmer" />}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-2xl transition-transform duration-300 group-hover:scale-110">
                    <Play className="ml-1 h-6 w-6 text-black" fill="currentColor" />
                  </div>
                </div>
                <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
                  Play inline
                </div>
                {resumeSeconds > 1 ? (
                  <div className="absolute bottom-3 left-3 rounded-full bg-[var(--accent)]/92 px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-contrast)] shadow-[0_12px_28px_rgba(var(--accent-rgb),0.24)]">
                    Resume {formatResumeTime(resumeSeconds)}
                  </div>
                ) : null}
              </button>
            )}

            {item.bookmarked && (
              <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
                <Bookmark className="h-4 w-4 text-white" fill="currentColor" />
              </div>
            )}
          </div>
        ) : (
          <Link href={`/reader/${item.id}`} onClick={rememberTimelineAnchor} className="relative block overflow-hidden">
            <div className="aspect-video w-full bg-surface-muted">
              <img
                src={thumbnailUrl}
                alt=""
                className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
              />
              {!imageLoaded && <div className="absolute inset-0 shimmer" />}
            </div>

            {item.bookmarked && (
              <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
                <Bookmark className="h-4 w-4 text-white" fill="currentColor" />
              </div>
            )}
          </Link>
        )
      )}

      {/* Content */}
      <div className="p-4">
        {/* Feed Source */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-secondary">
            {feedTitle}
          </p>
        </div>

        {/* Title */}
        <Link href={`/reader/${item.id}`} onClick={rememberTimelineAnchor}>
          <h3 className="mt-2 text-[17px] font-semibold leading-[1.35] tracking-[-0.01em] line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]">
            {itemTitle}
          </h3>
        </Link>

        {/* Summary */}
        {item.summary && !thumbnailUrl && (
          <p className="mt-2 text-[14px] leading-relaxed text-secondary line-clamp-2">
            {decodeHtmlEntities(item.summary)}
          </p>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-tertiary">
            <span>{relativeTime(item.publishedAt)}</span>
            {!isYouTube && (
              <>
                <span>·</span>
                <span>{item.feed.sourceType.replace("_RSS", "").replace("_", " ")}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!item.bookmarked) {
                  setBookmarkAnimating(true);
                }
                updateState.mutate({ bookmarked: !item.bookmarked });
              }}
              className={`interactive flex h-9 w-9 items-center justify-center rounded-full border ${
                item.bookmarked
                  ? `border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.22)] ${
                      bookmarkAnimating ? "bookmark-pop" : ""
                    }`
                  : "border-subtle bg-surface-muted text-secondary"
              }`}
              aria-label={item.bookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <Bookmark className="h-4 w-4" fill={item.bookmarked ? "currentColor" : "none"} />
            </button>

            <Link href={`/reader/${item.id}`} onClick={rememberTimelineAnchor}>
              {item.read ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-[0_8px_18px_rgba(245,158,11,0.3)]">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              ) : (
                <Button size="sm" className="h-9 rounded-full px-4">
                  Read
                </Button>
              )}
            </Link>

            {item.canonicalUrl && (
              <a
                href={item.canonicalUrl}
                target="_blank"
                rel="noreferrer"
                className="interactive flex h-9 w-9 items-center justify-center rounded-full border border-subtle bg-surface-muted text-secondary"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

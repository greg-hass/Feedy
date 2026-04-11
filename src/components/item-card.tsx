"use client";

import Link from "next/link";
import { Bookmark, Check, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useState } from "react";

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

function getInlinePlayerStorageKey(itemId: string, videoId: string) {
  return `feedy-youtube-inline-open:${itemId}:${videoId}`;
}

export const ItemCard = memo(function ItemCard({
  item,
  inlineOpen,
  onInlineOpenChange,
}: {
  item: ItemRecord;
  inlineOpen?: boolean;
  onInlineOpenChange?: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [internalPlayInline, setInternalPlayInline] = useState(false);
  const [bookmarkAnimating, setBookmarkAnimating] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [inlineStartSeconds, setInlineStartSeconds] = useState(0);
  const playInline = inlineOpen ?? internalPlayInline;
  const setPlayInline = onInlineOpenChange ?? setInternalPlayInline;
  const isYouTube = item.feed.sourceType.includes("YOUTUBE");

  const rememberTimelineAnchor = () => {
    const article = document.querySelector<HTMLElement>(`[data-timeline-item-id="${item.id}"]`);
    const viewportTop = article ? Math.max(0, Math.round(article.getBoundingClientRect().top)) : 0;
    window.sessionStorage.setItem(
      "feedy-timeline-anchor-item",
      JSON.stringify({ itemId: item.id, viewportTop, scrollY: Math.max(0, Math.round(window.scrollY)) }),
    );
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
      setInlineStartSeconds(0);
      return;
    }

    const savedSeconds = getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId);
    setResumeSeconds(savedSeconds);
    setInlineStartSeconds(savedSeconds);
  }, [item.id, item.youtubeVideoId]);

  useEffect(() => {
    if (!item.youtubeVideoId || typeof window === "undefined") {
      setPlayInline(false);
      return;
    }
  }, [item.id, item.youtubeVideoId]);

  useEffect(() => {
    if (!item.youtubeVideoId || typeof window === "undefined") {
      return;
    }

    const refreshResume = () => {
      const savedSeconds = getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId!);
      setResumeSeconds(savedSeconds);
      if (!playInline) {
        setInlineStartSeconds(savedSeconds);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshResume();
      }
    };

    window.addEventListener("focus", refreshResume);
    window.addEventListener("pageshow", refreshResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshResume);
      window.removeEventListener("pageshow", refreshResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [item.id, item.youtubeVideoId, playInline]);

  useEffect(() => {
    if (!item.youtubeVideoId || typeof window === "undefined" || playInline) {
      return;
    }

    const savedSeconds = getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId);
    setResumeSeconds(savedSeconds);
    setInlineStartSeconds(savedSeconds);
  }, [item.id, item.youtubeVideoId, playInline]);

  useEffect(() => {
    if (!item.youtubeVideoId || typeof window === "undefined" || !playInline) {
      return;
    }

    const collapseInlinePlayer = () => {
      const savedSeconds = getSavedYouTubeProgressSeconds(item.id, item.youtubeVideoId!);
      setResumeSeconds(savedSeconds);
      setInlineStartSeconds(savedSeconds);
      setPlayInline(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        collapseInlinePlayer();
      }
    };

    const handlePageHide = () => {
      collapseInlinePlayer();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [item.id, item.youtubeVideoId, playInline, setPlayInline]);

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

  const thumbnailUrl = isYouTube && item.youtubeVideoId
    ? `https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`
    : item.mediaUrl;
  const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
  const itemTitle = decodeHtmlEntities(item.title);

  return (
    <article
      data-timeline-item-id={item.id}
      className="group overflow-hidden rounded-[24px] border border-subtle bg-surface transition-all duration-300 hover:border-[var(--accent)]/20 hover:shadow-lg"
      style={
        isYouTube && playInline
          ? undefined
          : { contentVisibility: "auto", containIntrinsicSize: "420px" }
      }
    >
      {thumbnailUrl && (
        isYouTube && item.youtubeVideoId ? (
          <div className="relative overflow-hidden">
            {playInline ? (
              <YouTubeInlinePlayer
                itemId={item.id}
                videoId={item.youtubeVideoId}
                title={itemTitle}
                startSeconds={inlineStartSeconds}
                onProgressChange={(seconds) => {
                  setResumeSeconds(seconds);
                }}
                onMeaningfulPlayback={() => {
                  if (!item.read) {
                    updateState.mutate({ read: true });
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInlineStartSeconds(resumeSeconds);
                  setPlayInline(true);
                }}
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
                {resumeSeconds > 1 ? (
                  <div className="absolute left-3 top-3 rounded-full bg-[var(--accent)]/92 px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-contrast)] shadow-[0_12px_28px_rgba(var(--accent-rgb),0.24)]">
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

      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-secondary">
            {feedTitle}
          </p>
        </div>

        <Link href={`/reader/${item.id}`} onClick={rememberTimelineAnchor}>
          <h3 className="mt-2 text-[17px] font-semibold leading-[1.35] tracking-[-0.01em] line-clamp-2 transition-colors duration-200 group-hover:text-[var(--accent)]">
            {itemTitle}
          </h3>
        </Link>

        {item.summary && !thumbnailUrl && (
          <p className="mt-2 text-[14px] leading-relaxed text-secondary line-clamp-2">
            {decodeHtmlEntities(item.summary)}
          </p>
        )}

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

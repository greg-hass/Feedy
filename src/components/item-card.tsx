"use client";

import Link from "next/link";
import { Bookmark, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { decodeHtmlEntities, relativeTime } from "@/lib/utils";
import type { ItemRecord } from "@/types/app";

export function ItemCard({ item }: { item: ItemRecord }) {
  const queryClient = useQueryClient();
  const [imageLoaded, setImageLoaded] = useState(false);

  const updateState = useMutation({
    mutationFn: (body: { read?: boolean; bookmarked?: boolean }) =>
      api(`/api/items/${item.id}/state`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["reader", item.id] });
    },
  });

  const isYouTube = item.feed.sourceType.includes("YOUTUBE");
  const thumbnailUrl = isYouTube && item.youtubeVideoId
    ? `https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`
    : item.mediaUrl;
  const feedTitle = decodeHtmlEntities(item.feed.label || item.feed.title);
  const itemTitle = decodeHtmlEntities(item.title);

  return (
    <article className="group overflow-hidden rounded-2xl border border-subtle bg-surface transition-all duration-300 hover:border-[var(--accent)]/20 hover:shadow-lg">
      {/* Thumbnail */}
      {thumbnailUrl && (
        <Link href={`/reader/${item.id}`} className="relative block overflow-hidden">
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

          {/* Play Button Overlay for YouTube */}
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-2xl transition-transform duration-300 group-hover:scale-110">
                <Play className="ml-1 h-6 w-6 text-black" fill="currentColor" />
              </div>
            </div>
          )}

          {/* Bookmark Indicator */}
          {item.bookmarked && (
            <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
              <Bookmark className="h-4 w-4 text-white" fill="currentColor" />
            </div>
          )}
        </Link>
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
        <Link href={`/reader/${item.id}`}>
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
              onClick={() => updateState.mutate({ bookmarked: !item.bookmarked })}
              className={`interactive flex h-9 w-9 items-center justify-center rounded-full border ${
                item.bookmarked
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border-subtle bg-surface-muted text-secondary"
              }`}
              aria-label={item.bookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <Bookmark className="h-4 w-4" fill={item.bookmarked ? "currentColor" : "none"} />
            </button>

            <Link href={`/reader/${item.id}`}>
              <Button size="sm" className="h-9 rounded-full px-4">
                Read
              </Button>
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
}

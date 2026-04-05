"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, ExternalLink, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/utils";
import type { ItemRecord } from "@/types/app";

export function ItemCard({ item }: { item: ItemRecord }) {
  const queryClient = useQueryClient();
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
    ? `https://img.youtube.com/vi/${item.youtubeVideoId}/mqdefault.jpg`
    : item.mediaUrl;

  return (
    <article className="surface rounded-[20px] border border-subtle overflow-hidden">
      {thumbnailUrl && (
        <Link href={`/reader/${item.id}`} className="block relative">
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex size-12 items-center justify-center rounded-full bg-white/90">
                <Play className="size-5 text-[#101618] ml-0.5" fill="currentColor" />
              </div>
            </div>
          )}
        </Link>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] text-secondary truncate">
              {item.feed.label || item.feed.title}
            </p>
            <Link href={`/reader/${item.id}`}>
              <h3 className="mt-1.5 text-base font-semibold leading-snug line-clamp-2">{item.title}</h3>
            </Link>
            {item.summary && !thumbnailUrl && (
              <p className="mt-1.5 text-sm text-secondary line-clamp-2 leading-relaxed">{item.summary}</p>
            )}
          </div>
          <button
            onClick={() => updateState.mutate({ bookmarked: !item.bookmarked })}
            className="rounded-lg p-1.5 text-secondary shrink-0 mt-1"
            aria-label={item.bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            {item.bookmarked ? (
              <BookmarkCheck className="size-4 text-[var(--accent)]" />
            ) : (
              <Bookmark className="size-4" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-secondary">
            <span>{relativeTime(item.publishedAt)}</span>
            {!isYouTube && (
              <>
                <span>·</span>
                <span className="uppercase">{item.feed.sourceType.replace("_RSS", "").replace("_", " ")}</span>
              </>
            )}
          </div>

          <div className="flex gap-1.5">
            <Link href={`/reader/${item.id}`}>
              <Button size="sm">Read</Button>
            </Link>
            {item.canonicalUrl && (
              <a href={item.canonicalUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm" className="gap-1">
                  <ExternalLink className="size-3" />
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

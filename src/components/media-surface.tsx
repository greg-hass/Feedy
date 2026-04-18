"use client";

import { useEffect, useRef, useState } from "react";

import { YouTubeInlinePlayer } from "@/components/youtube-inline-player";

export type ResolvedMediaSource =
  | {
      kind: "native";
      src: string;
      type: string;
      poster?: string | null;
      youtubeVideoId?: string | null;
    }
  | {
      kind: "youtube";
      youtubeVideoId: string;
      poster?: string | null;
    }
  | {
      kind: "none";
    };

function getMediaProgressStorageKey(itemId: string) {
  return `feedy-media-progress:${itemId}`;
}

function getSavedMediaProgressSeconds(itemId: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = Number(window.localStorage.getItem(getMediaProgressStorageKey(itemId)) || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function saveMediaProgressSeconds(itemId: string, seconds: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getMediaProgressStorageKey(itemId), String(Math.max(0, Math.floor(seconds))));
}

export async function fetchMediaSource(itemId: string): Promise<ResolvedMediaSource> {
  const response = await fetch(`/api/items/${itemId}/video`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    return { kind: "none" };
  }

  return (await response.json()) as ResolvedMediaSource;
}

function NativeVideoPlayer({
  itemId,
  title,
  src,
  poster,
  startSeconds = 0,
  onMeaningfulPlayback,
  onError,
  onPlaying,
}: {
  itemId: string;
  title: string;
  src: string;
  poster?: string | null;
  startSeconds?: number;
  onMeaningfulPlayback?: () => void;
  onError?: () => void;
  onPlaying?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const meaningfulPlaybackTriggeredRef = useRef(startSeconds >= 20);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const savedSeconds = Math.max(startSeconds, getSavedMediaProgressSeconds(itemId));
    if (savedSeconds > 1) {
      const applyStart = () => {
        try {
          video.currentTime = savedSeconds;
        } catch {
          // Ignore seek failures until metadata is ready.
        }
      };

      if (video.readyState >= 1) {
        applyStart();
      } else {
        video.addEventListener("loadedmetadata", applyStart, { once: true });
      }
    }
  }, [itemId, startSeconds, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const clearTimer = () => {
      if (progressTimerRef.current != null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };

    const persistPosition = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) {
        return;
      }

      try {
        const seconds = Math.max(0, Math.floor(currentVideo.currentTime));
        saveMediaProgressSeconds(itemId, seconds);

        if (!meaningfulPlaybackTriggeredRef.current) {
          const duration = Math.max(0, currentVideo.duration || 0);
          const reachedTwentySeconds = seconds >= 20;
          const reachedTwentyPercent = duration > 0 && seconds / duration >= 0.2;

          if (reachedTwentySeconds || reachedTwentyPercent) {
            meaningfulPlaybackTriggeredRef.current = true;
            onMeaningfulPlayback?.();
          }
        }
      } catch {
        // Ignore transient video access failures.
      }
    };

    progressTimerRef.current = window.setInterval(persistPosition, 1000);

    const tryEnterPictureInPicture = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) {
        return;
      }

      const webkitVideo = currentVideo as HTMLVideoElement & {
        webkitSupportsPresentationMode?: (mode: string) => boolean;
        webkitSetPresentationMode?: (mode: string) => void;
      };

      try {
        if (typeof currentVideo.requestPictureInPicture === "function" && !document.pictureInPictureElement) {
          void currentVideo.requestPictureInPicture().catch(() => {
            // Ignore browser-specific PiP failures.
          });
          return;
        }

        if (
          typeof webkitVideo.webkitSupportsPresentationMode === "function" &&
          webkitVideo.webkitSupportsPresentationMode("picture-in-picture") &&
          typeof webkitVideo.webkitSetPresentationMode === "function"
        ) {
          webkitVideo.webkitSetPresentationMode("picture-in-picture");
        }
      } catch {
        // Ignore browser-specific PiP failures.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        tryEnterPictureInPicture();
      }
    };

    const handlePageHide = () => {
      tryEnterPictureInPicture();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      persistPosition();
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      try {
        video.pause();
      } catch {
        // Ignore shutdown failures.
      }
    };
  }, [itemId, onMeaningfulPlayback]);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      autoPlay
      playsInline
      poster={poster ?? undefined}
      preload="metadata"
      className="aspect-video w-full bg-black"
      aria-label={title}
      onError={() => {
        onError?.();
      }}
      onPlaying={() => {
        onPlaying?.();
      }}
      onLoadedMetadata={() => {
        const video = videoRef.current;
        if (!video) {
          return;
        }

        const savedSeconds = Math.max(startSeconds, getSavedMediaProgressSeconds(itemId));
        if (savedSeconds > 1) {
          try {
            video.currentTime = savedSeconds;
          } catch {
            // Ignore seek failures until the browser is ready.
          }
        }
      }}
    >
      <track kind="captions" />
    </video>
  );
}

function NativeMediaSurface({
  itemId,
  title,
  src,
  poster,
  startSeconds,
  youtubeVideoId,
  onMeaningfulPlayback,
}: {
  itemId: string;
  title: string;
  src: string;
  poster?: string | null;
  startSeconds: number;
  youtubeVideoId?: string | null;
  onMeaningfulPlayback?: () => void;
}) {
  const [nativeSourceFailed, setNativeSourceFailed] = useState(false);
  const [nativeSourcePlaying, setNativeSourcePlaying] = useState(false);

  useEffect(() => {
    if (!youtubeVideoId || nativeSourceFailed || nativeSourcePlaying) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNativeSourceFailed(true);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [nativeSourceFailed, nativeSourcePlaying, youtubeVideoId]);

  if (nativeSourceFailed && youtubeVideoId) {
    return (
      <YouTubeInlinePlayer
        itemId={itemId}
        videoId={youtubeVideoId}
        title={title}
        startSeconds={startSeconds}
        onMeaningfulPlayback={onMeaningfulPlayback}
      />
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black">
      <NativeVideoPlayer
        itemId={itemId}
        title={title}
        src={src}
        poster={poster ?? null}
        startSeconds={startSeconds}
        onMeaningfulPlayback={onMeaningfulPlayback}
        onError={() => {
          if (youtubeVideoId) {
            setNativeSourceFailed(true);
          }
        }}
        onPlaying={() => {
          setNativeSourcePlaying(true);
        }}
      />
      {!nativeSourcePlaying ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          {poster ? (
            <img
              src={poster}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-55"
              loading="eager"
            />
          ) : null}
          <div className="relative z-10 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/90" />
        </div>
      ) : null}
    </div>
  );
}

export function MediaSurface({
  source,
  itemId,
  title,
  startSeconds = 0,
  poster,
  onMeaningfulPlayback,
}: {
  source: ResolvedMediaSource;
  itemId: string;
  title: string;
  startSeconds?: number;
  poster?: string | null;
  onMeaningfulPlayback?: () => void;
}) {
  if (source.kind === "native") {
    return (
      <NativeMediaSurface
        key={`${itemId}:${source.youtubeVideoId ?? source.src}`}
        itemId={itemId}
        title={title}
        src={source.src}
        poster={source.poster ?? poster ?? null}
        startSeconds={startSeconds}
        youtubeVideoId={source.youtubeVideoId ?? null}
        onMeaningfulPlayback={onMeaningfulPlayback}
      />
    );
  }

  if (source.kind === "youtube") {
    return (
      <YouTubeInlinePlayer
        itemId={itemId}
        videoId={source.youtubeVideoId}
        title={title}
        startSeconds={startSeconds}
        onMeaningfulPlayback={onMeaningfulPlayback}
      />
    );
  }

  return null;
}

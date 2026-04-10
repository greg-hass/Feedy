"use client";

import { useEffect, useMemo, useRef } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YouTubePlayer }) => void;
            onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
          };
        },
      ) => YouTubePlayer;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
    __feedyYouTubeIframeApi?: Promise<void>;
  }
}

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
};

const PLAYER_STORAGE_PREFIX = "feedy-youtube-progress";

export function getYouTubeProgressStorageKey(itemId: string, videoId: string) {
  return `${PLAYER_STORAGE_PREFIX}:${itemId}:${videoId}`;
}

export function getSavedYouTubeProgressSeconds(itemId: string, videoId: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = Number(window.localStorage.getItem(getYouTubeProgressStorageKey(itemId, videoId)) || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (window.__feedyYouTubeIframeApi) {
    return window.__feedyYouTubeIframeApi;
  }

  window.__feedyYouTubeIframeApi = new Promise<void>((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    window.onYouTubeIframeAPIReady = () => resolve();

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return window.__feedyYouTubeIframeApi;
}

export function YouTubeInlinePlayer({
  itemId,
  videoId,
  title,
  autoplay = true,
  onProgressChange,
  onMeaningfulPlayback,
}: {
  itemId: string;
  videoId: string;
  title: string;
  autoplay?: boolean;
  onProgressChange?: (seconds: number) => void;
  onMeaningfulPlayback?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const meaningfulPlaybackTriggeredRef = useRef(false);
  const storageKey = useMemo(() => getYouTubeProgressStorageKey(itemId, videoId), [itemId, videoId]);

  useEffect(() => {
    let cancelled = false;

    const maybeTriggerMeaningfulPlayback = (seconds: number) => {
      if (meaningfulPlaybackTriggeredRef.current || !playerRef.current) {
        return;
      }

      try {
        const duration = Math.max(0, playerRef.current.getDuration());
        const reachedTwentySeconds = seconds >= 20;
        const reachedTwentyPercent = duration > 0 && seconds / duration >= 0.2;

        if (reachedTwentySeconds || reachedTwentyPercent) {
          meaningfulPlaybackTriggeredRef.current = true;
          onMeaningfulPlayback?.();
        }
      } catch {
        if (seconds >= 20) {
          meaningfulPlaybackTriggeredRef.current = true;
          onMeaningfulPlayback?.();
        }
      }
    };

    const persistPosition = () => {
      if (!playerRef.current) {
        return;
      }

      try {
        const seconds = Math.max(0, Math.floor(playerRef.current.getCurrentTime()));
        if (seconds > 0) {
          window.localStorage.setItem(storageKey, String(seconds));
        }
        onProgressChange?.(seconds);
        maybeTriggerMeaningfulPlayback(seconds);
      } catch {
        // Ignore transient player access failures.
      }
    };

    const clearTimer = () => {
      if (saveTimerRef.current != null) {
        window.clearInterval(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };

    const startTimer = () => {
      if (saveTimerRef.current != null) {
        return;
      }

      saveTimerRef.current = window.setInterval(persistPosition, 5000);
    };

    const setup = async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !mountRef.current || !window.YT?.Player) {
        return;
      }

      const resumeAt = Number(window.localStorage.getItem(storageKey) || "0");
      onProgressChange?.(resumeAt);
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: ({ target }) => {
            if (resumeAt > 1) {
              target.seekTo(resumeAt, true);
            }
            startTimer();
          },
          onStateChange: ({ data, target }) => {
            if (data === window.YT?.PlayerState?.ENDED) {
              window.localStorage.removeItem(storageKey);
              onProgressChange?.(0);
              clearTimer();
              return;
            }

            if (
              data === window.YT?.PlayerState?.PLAYING ||
              data === window.YT?.PlayerState?.PAUSED
            ) {
              try {
                const seconds = Math.max(0, Math.floor(target.getCurrentTime()));
                if (seconds > 0) {
                  window.localStorage.setItem(storageKey, String(seconds));
                }
                onProgressChange?.(seconds);
                maybeTriggerMeaningfulPlayback(seconds);
              } catch {
                // Ignore transient player access failures.
              }
            }

            startTimer();
          },
        },
      });
    };

    void setup();

    return () => {
      cancelled = true;
      persistPosition();
      clearTimer();
      try {
        playerRef.current?.pauseVideo();
      } catch {
        // Ignore shutdown failures.
      }
      try {
        playerRef.current?.destroy();
      } catch {
        // Ignore shutdown failures.
      }
      playerRef.current = null;
    };
  }, [autoplay, onMeaningfulPlayback, onProgressChange, storageKey, title, videoId]);

  return (
    <div className="aspect-video w-full bg-black">
      <div
        ref={mountRef}
        className="h-full w-full"
        aria-label={title}
      />
    </div>
  );
}

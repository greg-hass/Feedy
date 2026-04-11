"use client";

import { useEffect, useRef } from "react";

const PLAYER_STORAGE_PREFIX = "feedy-youtube-progress";

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
        BUFFERING: number;
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

export function getYouTubeProgressStorageKey(itemId: string, videoId: string) {
  return `${PLAYER_STORAGE_PREFIX}:${videoId}`;
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

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

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
  startSeconds = 0,
  onReady,
  onProgressChange,
  onMeaningfulPlayback,
}: {
  itemId: string;
  videoId: string;
  title: string;
  autoplay?: boolean;
  startSeconds?: number;
  onReady?: () => void;
  onProgressChange?: (seconds: number) => void;
  onMeaningfulPlayback?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const readyCallbackRef = useRef(onReady);
  const progressCallbackRef = useRef(onProgressChange);
  const meaningfulCallbackRef = useRef(onMeaningfulPlayback);
  const meaningfulPlaybackTriggeredRef = useRef(startSeconds >= 20);
  const lastSavedSecondsRef = useRef(Math.max(0, Math.floor(startSeconds)));

  readyCallbackRef.current = onReady;
  progressCallbackRef.current = onProgressChange;
  meaningfulCallbackRef.current = onMeaningfulPlayback;

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (saveTimerRef.current != null) {
        window.clearInterval(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };

    const persistPosition = () => {
      if (!playerRef.current) {
        return;
      }

      try {
        const seconds = Math.max(0, Math.floor(playerRef.current.getCurrentTime()));
        lastSavedSecondsRef.current = seconds;
        window.localStorage.setItem(
          getYouTubeProgressStorageKey(itemId, videoId),
          String(seconds),
        );
        progressCallbackRef.current?.(seconds);

        if (!meaningfulPlaybackTriggeredRef.current) {
          const duration = Math.max(0, playerRef.current.getDuration());
          const reachedTwentySeconds = seconds >= 20;
          const reachedTwentyPercent = duration > 0 && seconds / duration >= 0.2;

          if (reachedTwentySeconds || reachedTwentyPercent) {
            meaningfulPlaybackTriggeredRef.current = true;
            meaningfulCallbackRef.current?.();
          }
        }
      } catch {
        // Ignore transient player access failures.
      }
    };

    const startTimer = () => {
      if (saveTimerRef.current != null) {
        return;
      }

      saveTimerRef.current = window.setInterval(persistPosition, 1000);
    };

    const setup = async () => {
      await loadYouTubeIframeApi();
      if (cancelled || !mountRef.current || !window.YT?.Player) {
        return;
      }

      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: ({ target }) => {
            if (startSeconds > 1) {
              target.seekTo(startSeconds, true);
              lastSavedSecondsRef.current = Math.floor(startSeconds);
              progressCallbackRef.current?.(Math.floor(startSeconds));
            }

            readyCallbackRef.current?.();
            startTimer();
          },
          onStateChange: ({ data, target }) => {
            if (data === window.YT?.PlayerState?.ENDED) {
              clearTimer();
              lastSavedSecondsRef.current = 0;
              window.localStorage.removeItem(getYouTubeProgressStorageKey(itemId, videoId));
              progressCallbackRef.current?.(0);
              return;
            }

            if (
              data === window.YT?.PlayerState?.PLAYING ||
              data === window.YT?.PlayerState?.PAUSED ||
              data === window.YT?.PlayerState?.BUFFERING
            ) {
              try {
                const seconds = Math.max(0, Math.floor(target.getCurrentTime()));
                lastSavedSecondsRef.current = seconds;
                progressCallbackRef.current?.(seconds);
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
  }, [autoplay, itemId, startSeconds, videoId]);

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

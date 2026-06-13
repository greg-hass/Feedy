"use client";

import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";
import { createPortal } from "react-dom";

import { WakeLockManager } from "@/components/wake-lock-manager";
import { YouTubeInlinePlayer } from "@/components/youtube-inline-player";
import {
  getYouTubePlaybackHostStyle,
  getYouTubePlaybackSessionPlacement,
} from "@/lib/youtube-playback-session";

type ActiveYouTubePlayback = {
  itemId: string;
  videoId: string;
  title: string;
  startSeconds: number;
  sourcePathname: string;
  state: "playing" | "paused" | "buffering" | "ended";
};

type BackgroundPlaybackApi = {
  activeYouTubePlayback: ActiveYouTubePlayback | null;
  startYouTubePlayback: (playback: Omit<ActiveYouTubePlayback, "state">) => void;
  stopYouTubePlayback: () => void;
  setYouTubeInlineHost: (itemId: string, element: HTMLElement | null) => void;
};

const BackgroundPlaybackContext = createContext<BackgroundPlaybackApi | null>(null);

export function useBackgroundPlayback() {
  const context = useContext(BackgroundPlaybackContext);
  if (!context) {
    throw new Error("useBackgroundPlayback must be used within Providers");
  }

  return context;
}

type InlineYouTubeHost = { itemId: string; element: HTMLElement } | null;

function YouTubePlaybackSession({
  pathname,
  active,
  inlineHost,
  onPlaybackStateChange,
}: {
  pathname: string;
  active: ActiveYouTubePlayback | null;
  inlineHost: InlineYouTubeHost;
  onPlaybackStateChange: (state: ActiveYouTubePlayback["state"]) => void;
}) {
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
  const placement = active
    ? getYouTubePlaybackSessionPlacement({
        pathname,
        active: { sourcePathname: active.sourcePathname, state: active.state },
      })
    : "none";

  useLayoutEffect(() => {
    if (!active || !hostElement) {
      if (hostElement) {
        Object.assign(
          hostElement.style,
          getYouTubePlaybackHostStyle({ placement: "none", active, sourceRect: null }),
        );
      }
      return;
    }

    const inlineElement = placement === "inline" && inlineHost?.itemId === active.itemId
      ? inlineHost.element
      : null;

    const updateHostStyle = () => {
      Object.assign(
        hostElement.style,
        getYouTubePlaybackHostStyle({
          placement,
          active,
          sourceRect: inlineElement ? inlineElement.getBoundingClientRect() : null,
        }),
      );
    };

    updateHostStyle();

    if (!inlineElement) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateHostStyle);
      resizeObserver.observe(inlineElement);
    }

    window.addEventListener("scroll", updateHostStyle, true);
    window.addEventListener("resize", updateHostStyle);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", updateHostStyle, true);
      window.removeEventListener("resize", updateHostStyle);
    };
  }, [active, hostElement, inlineHost, placement]);

  if (!active) {
    return null;
  }

  return (
    <>
      <div
        ref={setHostElement}
        className="fixed left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
        aria-hidden
      />
      {hostElement
        ? createPortal(
            <YouTubeInlinePlayer
              itemId={active.itemId}
              videoId={active.videoId}
              title={active.title}
              startSeconds={active.startSeconds}
              variant="mount"
              className="h-full w-full"
              onPlaybackStateChange={onPlaybackStateChange}
            />,
            hostElement,
          )
        : null}
    </>
  );
}

// Set once at module load time — prevents the browser from auto-scrolling
// to 0 on popstate (back navigation). Without this, the browser's own scroll
// restoration fires before any React effect can set it to "manual", causing
// the timeline scroll position to reset when returning from an article.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [activeYouTubePlayback, setActiveYouTubePlayback] = useState<ActiveYouTubePlayback | null>(null);
  const [inlineYouTubeHost, setInlineYouTubeHost] = useState<InlineYouTubeHost>(null);
  const lastResumeRefetchAtRef = useRef(0);

  useEffect(() => {
    const refetchFreshServerState = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastResumeRefetchAtRef.current < 750) {
        return;
      }
      lastResumeRefetchAtRef.current = now;

      void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
      void queryClient.refetchQueries({ queryKey: ["items"], type: "active" });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchFreshServerState();
      }
    };

    window.addEventListener("focus", refetchFreshServerState);
    window.addEventListener("pageshow", refetchFreshServerState);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", refetchFreshServerState);
      window.removeEventListener("pageshow", refetchFreshServerState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [queryClient]);

  useLayoutEffect(() => {
    if (!pathname.startsWith("/reader/")) {
      return;
    }

    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frameOne = window.requestAnimationFrame(resetScroll);
    const frameTwo = window.requestAnimationFrame(() => window.requestAnimationFrame(resetScroll));
    const timeoutOne = window.setTimeout(resetScroll, 60);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timeoutOne);
    };
  }, [pathname]);

  const backgroundPlaybackApi = {
    activeYouTubePlayback,
    startYouTubePlayback: (playback: Omit<ActiveYouTubePlayback, "state">) => {
      setActiveYouTubePlayback({ ...playback, state: "playing" });
    },
    stopYouTubePlayback: () => {
      setActiveYouTubePlayback(null);
    },
    setYouTubeInlineHost: (itemId: string, element: HTMLElement | null) => {
      setInlineYouTubeHost((current) => {
        if (element) {
          return { itemId, element };
        }

        if (!current || current.itemId !== itemId) {
          return current;
        }

        return null;
      });
    },
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      <BackgroundPlaybackContext.Provider value={backgroundPlaybackApi}>
        <QueryClientProvider client={queryClient}>
          {children}
          <WakeLockManager />
          <YouTubePlaybackSession
            pathname={pathname}
            active={activeYouTubePlayback}
            inlineHost={inlineYouTubeHost}
            onPlaybackStateChange={(state) => {
              setActiveYouTubePlayback((current) => {
                if (!current) {
                  return current;
                }

                if (state === "ended") {
                  return null;
                }

                return { ...current, state };
              });
            }}
          />
          {process.env.NODE_ENV === "development" ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}
        </QueryClientProvider>
      </BackgroundPlaybackContext.Provider>
    </ThemeProvider>
  );
}

import type { CSSProperties } from "react";

export type YouTubePlaybackState = "playing" | "paused" | "buffering" | "ended";

export type ActiveYouTubePlaybackRef = {
  sourcePathname: string;
  state: YouTubePlaybackState;
};

export type YouTubePlaybackSessionPlacement = "inline" | "background" | "none";

type PlaybackHostRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function shouldMountBackgroundYouTubePlayer({
  pathname,
  active,
}: {
  pathname: string;
  active: ActiveYouTubePlaybackRef | null;
}) {
  if (!active) {
    return false;
  }

  if (active.state === "ended") {
    return false;
  }

  // The bottom tabs live under /app/*.
  if (!pathname.startsWith("/app/")) {
    return false;
  }

  // The timeline tab is where the inline host lives.
  if (pathname.startsWith("/app/unread")) {
    return false;
  }

  // If we're still on the source page, prefer inline playback.
  if (pathname === active.sourcePathname) {
    return false;
  }

  return true;
}

export function getYouTubePlaybackSessionPlacement({
  pathname,
  active,
}: {
  pathname: string;
  active: ActiveYouTubePlaybackRef | null;
}): YouTubePlaybackSessionPlacement {
  if (!active || active.state === "ended") {
    return "none";
  }

  if (pathname === active.sourcePathname) {
    return "inline";
  }

  if (shouldMountBackgroundYouTubePlayer({ pathname, active })) {
    return "background";
  }

  return "none";
}

export function getYouTubePlaybackHostStyle({
  placement,
  active,
  sourceRect,
}: {
  placement: YouTubePlaybackSessionPlacement;
  active?: ActiveYouTubePlaybackRef | null;
  sourceRect: PlaybackHostRect | null;
}): CSSProperties {
  if (!active || active.state === "ended") {
    return {
      position: "fixed",
      top: "0px",
      left: "-9999px",
      width: "1px",
      height: "1px",
      zIndex: 60,
      opacity: 0,
      pointerEvents: "none",
    };
  }

  if (placement === "inline" && sourceRect) {
    return {
      position: "fixed",
      top: `${sourceRect.top}px`,
      left: `${sourceRect.left}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      zIndex: 60,
      opacity: 1,
      pointerEvents: "auto",
    };
  }

  return {
    position: "fixed",
    top: "0px",
    left: "-9999px",
    width: "1px",
    height: "1px",
    zIndex: 60,
    opacity: 0,
    pointerEvents: "none",
  };
}

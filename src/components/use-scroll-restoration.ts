import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function readTimelineAnchor(raw: string | null) {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    const anchor = value as Record<string, unknown>;
    if (typeof anchor.scrollY !== "number" || !Number.isFinite(anchor.scrollY))
      return null;
    return {
      itemId: typeof anchor.itemId === "string" ? anchor.itemId : null,
      scrollY: Math.max(0, anchor.scrollY),
      viewportTop:
        typeof anchor.viewportTop === "number" &&
        Number.isFinite(anchor.viewportTop)
          ? anchor.viewportTop
          : null,
    };
  } catch {
    return null;
  }
}

/** Restore after client navigation, full reload, and Safari's back/forward cache. */
export function useScrollRestoration({
  scrollStorageKey,
  anchorStorageKey,
  isItemsLoading,
  timelineItems,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  scrollStorageKey: string;
  anchorStorageKey: string;
  timelineFixedTop: number;
  isItemsLoading: boolean;
  timelineItems: Array<{ id: string }>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => Promise<unknown>;
}) {
  const restoredScrollRef = useRef(false);
  const [resume, setResume] = useState(0);

  useEffect(() => {
    const save = () => {
      // An explicit article anchor wins over outgoing route resets and loading layouts.
      if (
        !restoredScrollRef.current ||
        window.sessionStorage.getItem(anchorStorageKey)
      )
        return;
      window.sessionStorage.setItem(
        scrollStorageKey,
        String(Math.max(0, window.scrollY)),
      );
    };
    const restoreOnReturn = () => {
      if (!window.sessionStorage.getItem(anchorStorageKey)) return;
      restoredScrollRef.current = false;
      setResume((value) => value + 1);
    };
    const visibility = () => {
      if (document.visibilityState === "visible") restoreOnReturn();
      else save();
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("pageshow", restoreOnReturn);
    window.addEventListener("focus", restoreOnReturn);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("pageshow", restoreOnReturn);
      window.removeEventListener("focus", restoreOnReturn);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scrollStorageKey, anchorStorageKey]);

  useLayoutEffect(() => {
    if (isItemsLoading || restoredScrollRef.current) return;
    const anchor = readTimelineAnchor(
      window.sessionStorage.getItem(anchorStorageKey),
    );
    const stored = Number(window.sessionStorage.getItem(scrollStorageKey));
    const savedScroll =
      anchor?.scrollY ?? (Number.isFinite(stored) ? Math.max(0, stored) : 0);
    const element = anchor?.itemId
      ? Array.from(
          document.querySelectorAll<HTMLElement>("[data-timeline-item-id]"),
        ).find((entry) => entry.dataset.timelineItemId === anchor.itemId)
      : undefined;
    const target =
      element && anchor?.viewportTop != null
        ? Math.max(
            0,
            window.scrollY +
              element.getBoundingClientRect().top -
              anchor.viewportTop,
          )
        : savedScroll;
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );

    // A cold Safari return may only have the first page. Load enough before consuming the anchor.
    if (target > maxScroll && hasNextPage && fetchNextPage) {
      if (!isFetchingNextPage) void fetchNextPage().catch(() => {});
      return;
    }

    window.scrollTo({ top: target, behavior: "instant" });
    restoredScrollRef.current = true;
    window.sessionStorage.setItem(
      scrollStorageKey,
      String(Math.min(target, maxScroll)),
    );
    window.sessionStorage.removeItem(anchorStorageKey);
    // No timed scroll guard: it fights the user's first swipe after returning.
  }, [
    isItemsLoading,
    scrollStorageKey,
    anchorStorageKey,
    timelineItems,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    resume,
  ]);

  return { restoredScrollRef };
}

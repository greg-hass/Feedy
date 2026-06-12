"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type StorageKey = string;

/**
 * Manages timeline scroll position save/restore across navigations.
 *
 * Saves scroll position to sessionStorage on scroll/visibilitychange/pagehide,
 * and restores it when the component mounts with new data.
 *
 * The scroll restoration retries across several animation frames to handle
 * layout settling (fonts, lazy images, flex recalculation).
 */
export function useScrollRestoration(
  deps: {
    scrollStorageKey: StorageKey;
    anchorStorageKey: StorageKey;
    timelineFixedTop: number;
    isItemsLoading: boolean;
    timelineItems: Array<{ id: string }>;
  },
) {
  const {
    scrollStorageKey,
    anchorStorageKey,
    timelineFixedTop,
    isItemsLoading,
    timelineItems,
  } = deps;

  const restoredScrollRef = useRef(false);
  const saveScrollFrameRef = useRef<number | null>(null);
  const saveScrollYRef = useRef(0);

  // Save scroll position to sessionStorage
  useEffect(() => {
    const flushScroll = () => {
      window.sessionStorage.setItem(
        scrollStorageKey,
        String(Math.max(0, Math.round(saveScrollYRef.current))),
      );
    };

    const saveScroll = () => {
      saveScrollYRef.current = window.scrollY;
      if (saveScrollFrameRef.current != null) {
        return;
      }

      saveScrollFrameRef.current = window.requestAnimationFrame(() => {
        saveScrollFrameRef.current = null;
        flushScroll();
      });
    };

    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", flushScroll);
    window.addEventListener("visibilitychange", flushScroll);
    return () => {
      if (saveScrollFrameRef.current != null) {
        window.cancelAnimationFrame(saveScrollFrameRef.current);
        saveScrollFrameRef.current = null;
      }
      saveScrollYRef.current = window.scrollY;
      flushScroll();
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", flushScroll);
      window.removeEventListener("visibilitychange", flushScroll);
    };
  }, [scrollStorageKey]);

  // Restore scroll position after data loads
  useLayoutEffect(() => {
    if (isItemsLoading || restoredScrollRef.current) {
      return;
    }

    restoredScrollRef.current = true;

    const anchorStateRaw = window.sessionStorage.getItem(anchorStorageKey);
    let anchorItemId: string | null = null;
    let anchorScrollY: number | null = null;

    if (anchorStateRaw) {
      try {
        const parsed = JSON.parse(anchorStateRaw) as { itemId?: string; scrollY?: number };
        anchorItemId = parsed.itemId ?? null;
        anchorScrollY = typeof parsed.scrollY === "number" ? parsed.scrollY : null;
      } catch {
        // Ignore malformed saved anchor state.
      }
    }

    const savedScroll = anchorScrollY ?? Number(window.sessionStorage.getItem(scrollStorageKey) || "0");

    if (savedScroll <= 0 && !anchorItemId) {
      window.sessionStorage.removeItem(anchorStorageKey);
      return;
    }

    const computeTarget = (): number => {
      if (savedScroll > 0) {
        return savedScroll;
      }
      if (anchorItemId) {
        const el = document.querySelector<HTMLElement>(`[data-timeline-item-id="${anchorItemId}"]`);
        if (el) {
          return Math.max(0, el.offsetTop - timelineFixedTop - 8);
        }
      }
      return 0;
    };

    let guardActive = true;

    const restoreScroll = () => {
      if (!guardActive) return;
      window.scrollTo({ top: computeTarget(), behavior: "auto" });
    };

    const onUnwantedScroll = () => {
      if (guardActive && window.scrollY < savedScroll * 0.5) {
        restoreScroll();
      }
    };

    window.addEventListener("scroll", onUnwantedScroll, { passive: true });

    restoreScroll();
    const frameOne = window.requestAnimationFrame(restoreScroll);
    const frameTwo = window.requestAnimationFrame(() => window.requestAnimationFrame(restoreScroll));
    const timeoutOne = window.setTimeout(restoreScroll, 60);
    const timeoutTwo = window.setTimeout(restoreScroll, 200);
    const timeoutThree = window.setTimeout(restoreScroll, 400);
    const timeoutFour = window.setTimeout(() => {
      guardActive = false;
      window.removeEventListener("scroll", onUnwantedScroll);
      window.sessionStorage.removeItem(anchorStorageKey);
    }, 650);

    return () => {
      guardActive = false;
      window.removeEventListener("scroll", onUnwantedScroll);
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timeoutOne);
      window.clearTimeout(timeoutTwo);
      window.clearTimeout(timeoutThree);
      window.clearTimeout(timeoutFour);
    };
  }, [isItemsLoading, scrollStorageKey, anchorStorageKey, timelineFixedTop, timelineItems]);

  return { restoredScrollRef };
}

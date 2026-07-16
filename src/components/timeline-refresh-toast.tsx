"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

import { formatTimelineRefreshLabel } from "@/lib/timeline-refresh";

export function TimelineRefreshToast({
  count,
  onJump,
  onDismiss,
}: {
  count: number;
  onJump: () => void;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (count <= 0) {
      return;
    }

    const timer = window.setTimeout(() => onDismissRef.current(), 5_000);
    return () => window.clearTimeout(timer);
  }, [count]);

  if (count <= 0) {
    return null;
  }

  const label = formatTimelineRefreshLabel(count);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-40 flex justify-center px-5"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onJump}
        aria-label={formatTimelineRefreshLabel(count)}
        data-flat-toast="true"
        className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--accent)] shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
      >
        <ArrowUp className="size-3.5" aria-hidden />
        {label.replace(/^↑ /, "")}
      </button>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";

export function TimelineRefreshToast({
  count,
  onJump,
  onDismiss,
}: {
  count: number;
  onJump: () => void;
  onDismiss: () => void;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-[84px] z-40 px-5">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-[24px] border border-subtle bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.22)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{count} new articles</p>
          <p className="text-xs text-secondary">The timeline stayed in place while we refreshed it.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={onJump}>
            View new articles
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-subtle bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-secondary"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

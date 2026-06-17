"use client";

import { useEffect } from "react";
import { Bookmark, BookmarkX, Eye, EyeOff, ExternalLink, Share2, X } from "lucide-react";

export type CardAction =
  | { type: "bookmark"; bookmarked: boolean }
  | { type: "read"; read: boolean }
  | { type: "share" }
  | { type: "external" };

interface CardActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: CardAction) => void;
  feedTitle: string;
  itemTitle: string;
  bookmarked: boolean;
  read: boolean;
  hasExternalLink: boolean;
}

export function CardActionSheet({
  isOpen,
  onClose,
  onAction,
  feedTitle,
  itemTitle,
  bookmarked,
  read,
  hasExternalLink,
}: CardActionSheetProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions: { action: CardAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [
    {
      action: { type: "bookmark", bookmarked: !bookmarked },
      label: bookmarked ? "Remove bookmark" : "Bookmark",
      icon: bookmarked ? <BookmarkX className="size-5" /> : <Bookmark className="size-5" />,
    },
    {
      action: { type: "read", read: !read },
      label: read ? "Mark unread" : "Mark read",
      icon: read ? <EyeOff className="size-5" /> : <Eye className="size-5" />,
    },
    {
      action: { type: "share" },
      label: "Share",
      icon: <Share2 className="size-5" />,
    },
  ];

  if (hasExternalLink) {
    actions.push({
      action: { type: "external" },
      label: "Open in browser",
      icon: <ExternalLink className="size-5" />,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: "fadeIn 150ms ease-out" }}
      />

      {/* Sheet */}
      <div
        className="relative mx-auto w-full max-w-md rounded-t-[28px] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-5"
        style={{
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
          animation: "slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[var(--surface-muted)]" />

        {/* Item preview */}
        <div className="mb-4">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">{feedTitle}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-[var(--text-primary)] line-clamp-2">
            {itemTitle}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                onAction(a.action);
                onClose();
              }}
              className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors duration-150 hover:bg-[var(--surface-muted)]"
            >
              <span className="text-[var(--text-secondary)]">{a.icon}</span>
              <span className="text-[15px] font-medium text-[var(--text-primary)]">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-colors duration-150"
          style={{
            backgroundColor: "var(--surface-muted)",
            color: "var(--text-primary)",
          }}
        >
          <X className="size-4" />
          Cancel
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Check, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import type { NavFeed, NavFolder } from "@/types/app";

export function AddFolderForm({ onClose }: { onClose?: () => void }) {
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/folders", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose?.();
    },
  });

  return (
    <div className="surface rounded-[20px] border border-subtle p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">New folder</p>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1 text-secondary">
            <X className="size-4" />
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) mutation.mutate();
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Daily reads"
          className="mt-3"
        />
        <Button onClick={() => mutation.mutate()} className="mt-3 w-full" disabled={!title.trim()}>
          Create folder
        </Button>
      </form>
    </div>
  );
}

export function EditFolderSheet({
  folder,
  onClose,
  onDelete,
  onReorder,
}: {
  folder: NavFolder;
  onClose: () => void;
  onDelete: () => void;
  onReorder?: (direction: "up" | "down") => void;
}) {
  const [title, setTitle] = useState(folder.title);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/folders/${folder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[24px] bg-[var(--surface-strong)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Edit folder</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-secondary">
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">Name</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        {onReorder && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onReorder("up")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-subtle bg-[var(--surface-muted)] py-2.5 text-xs font-medium text-secondary"
            >
              <ArrowUp className="size-4" />
              Move up
            </button>
            <button
              onClick={() => onReorder("down")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-subtle bg-[var(--surface-muted)] py-2.5 text-xs font-medium text-secondary"
            >
              <ArrowDown className="size-4" />
              Move down
            </button>
          </div>
        )}

        <Button onClick={() => mutation.mutate()} className="mt-4 w-full" disabled={!title.trim()}>
          Save
        </Button>

        <button
          onClick={() => {
            if (confirm("Delete this folder? Feeds will become uncategorized.")) {
              onDelete();
              onClose();
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2.5 text-sm font-medium text-[var(--danger)]"
        >
          <Trash2 className="size-4" />
          Delete folder
        </button>
      </div>
    </div>
  );
}

export function AddFeedForm({
  folders,
  onClose,
}: {
  folders: NavFolder[];
  onClose?: () => void;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [label, setLabel] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api("/api/feeds", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl,
          label: label || null,
          folderId: folderId || null,
        }),
      }),
    onSuccess: async () => {
      setSourceUrl("");
      setLabel("");
      setFolderId("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      onClose?.();
    },
  });

  return (
    <div className="surface rounded-[20px] border border-subtle p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add feed</p>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1 text-secondary">
            <X className="size-4" />
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (sourceUrl.trim()) mutation.mutate();
        }}
      >
        <Input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://example.com/feed.xml"
          className="mt-3"
        />
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Optional label"
          className="mt-3"
        />
        {folders.length > 0 && (
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="mt-3 h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.title}
              </option>
            ))}
          </select>
        )}
        <Button onClick={() => mutation.mutate()} className="mt-3 w-full" disabled={!sourceUrl.trim()}>
          {mutation.isPending ? "Validating..." : "Validate and add"}
        </Button>
        {mutation.error && (
          <p className="mt-2 text-sm text-[var(--danger)]">{mutation.error.message}</p>
        )}
      </form>
    </div>
  );
}

export function EditFeedSheet({
  feed,
  onClose,
  onDelete,
  onReorder,
}: {
  feed: NavFeed;
  onClose: () => void;
  onDelete: () => void;
  onReorder?: (direction: "up" | "down") => void;
}) {
  const [label, setLabel] = useState(feed.label || "");
  const [folderId, setFolderId] = useState(feed.folderId || "");
  const [isPinned, setIsPinned] = useState(feed.isPinned);
  const queryClient = useQueryClient();

  const me = queryClient.getQueryData<{
    navigation: { folders: NavFolder[] };
  }>(["me"]);
  const folders = me?.navigation.folders ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/feeds/${feed.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: label || null,
          folderId: folderId || null,
          isPinned,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[24px] bg-[var(--surface-strong)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Edit feed</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-secondary">
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-1 truncate text-xs text-secondary">{feed.sourceUrl}</p>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">Label</span>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={feed.title} />
        </label>

        {folders.length > 0 && (
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">Folder</span>
            <select
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
              className="h-12 w-full rounded-xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm"
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={() => setIsPinned(!isPinned)}
          className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            isPinned
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-subtle text-secondary"
          }`}
        >
          {isPinned ? <Check className="size-4" /> : <div className="size-4 rounded border border-subtle" />}
          Pin to top
        </button>

        {onReorder && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onReorder("up")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-subtle bg-[var(--surface-muted)] py-2.5 text-xs font-medium text-secondary"
            >
              <ArrowUp className="size-4" />
              Move up
            </button>
            <button
              onClick={() => onReorder("down")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-subtle bg-[var(--surface-muted)] py-2.5 text-xs font-medium text-secondary"
            >
              <ArrowDown className="size-4" />
              Move down
            </button>
          </div>
        )}

        <Button onClick={() => mutation.mutate()} className="mt-4 w-full" disabled={mutation.isPending}>
          Save
        </Button>

        <button
          onClick={() => {
            if (confirm("Delete this feed and all its items?")) {
              onDelete();
              onClose();
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2.5 text-sm font-medium text-[var(--danger)]"
        >
          <Trash2 className="size-4" />
          Delete feed
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Check, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/client";
import type { NavFeed, NavFolder } from "@/types/app";

export function AddFolderForm({
	onClose,
	showHeader = true,
}: {
	onClose?: () => void;
	showHeader?: boolean;
}) {
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

	const form = (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (title.trim()) mutation.mutate();
			}}
		>
			<label className="mt-3 block">
				<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
					Folder name
				</span>
				<Input
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Daily reads"
				/>
			</label>
			<Button
				type="submit"
				className="mt-3 w-full"
				disabled={!title.trim() || mutation.isPending}
			>
				{mutation.isPending ? "Creating..." : "Create folder"}
			</Button>
			{mutation.error ? (
				<p role="alert" className="mt-2 text-sm text-[var(--danger)]">
					{mutation.error.message}
				</p>
			) : null}
		</form>
	);

	if (!showHeader) {
		return form;
	}

	return (
		<div className="rounded-[24px] border border-subtle bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold">New folder</p>
				{onClose && (
					<button
						onClick={onClose}
						aria-label="Close"
						className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)]"
					>
						<X className="size-4" />
					</button>
				)}
			</div>
			{form}
		</div>
	);
}

export function AddFolderSheet({ onClose }: { onClose: () => void }) {
	return (
		<Sheet title="New folder" onClose={onClose} showHandle={false}>
			<AddFolderForm onClose={onClose} showHeader={false} />
		</Sheet>
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
			await queryClient.invalidateQueries({ queryKey: ["items"] });
			onClose();
		},
	});

	return (
		<Sheet
			title="Edit folder"
			subtitle="Rename, reorder, or remove this folder."
			onClose={onClose}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					mutation.mutate();
				}}
			>
				<label className="mt-3 block">
					<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
						Name
					</span>
					<Input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</label>

				{onReorder && (
					<div className="mt-2.5 flex gap-2">
						<button
							type="button"
							onClick={() => onReorder("up")}
							className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-subtle bg-[var(--surface-muted)] py-3 text-xs font-medium text-secondary"
						>
							<ArrowUp className="size-4" />
							Move up
						</button>
						<button
							type="button"
							onClick={() => onReorder("down")}
							className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-subtle bg-[var(--surface-muted)] py-3 text-xs font-medium text-secondary"
						>
							<ArrowDown className="size-4" />
							Move down
						</button>
					</div>
				)}

				<Button
					type="submit"
					className="mt-3.5 w-full"
					disabled={!title.trim() || mutation.isPending}
				>
					{mutation.isPending ? "Saving..." : "Save"}
				</Button>
				{mutation.error ? (
					<p role="alert" className="mt-2 text-sm text-[var(--danger)]">
						{mutation.error.message}
					</p>
				) : null}
			</form>

			<button
				type="button"
				onClick={() => {
					if (confirm("Delete this folder? Feeds will become uncategorized.")) {
						onDelete();
						onClose();
					}
				}}
				className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2.5 text-sm font-medium text-[var(--danger)]"
			>
				<Trash2 className="size-4" />
				Delete folder
			</button>
		</Sheet>
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
		<div className="rounded-[24px] border border-subtle bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold">Add feed</p>
				{onClose && (
					<button
						onClick={onClose}
						className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)]"
					>
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
				<label className="mt-3 block">
					<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
						Feed URL
					</span>
					<Input
						value={sourceUrl}
						onChange={(event) => setSourceUrl(event.target.value)}
						placeholder="https://example.com/feed.xml"
					/>
				</label>
				<label className="mt-3 block">
					<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
						Label (optional)
					</span>
					<Input
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						placeholder="My daily news"
					/>
				</label>
				{folders.length > 0 && (
					<label className="mt-3 block">
						<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
							Folder
						</span>
						<select
							value={folderId}
							onChange={(event) => setFolderId(event.target.value)}
							className="mt-0 h-12 w-full rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)]"
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
				<Button
					type="submit"
					className="mt-3 w-full"
					disabled={!sourceUrl.trim() || mutation.isPending}
				>
					{mutation.isPending ? "Validating..." : "Validate and add"}
				</Button>
				{mutation.error && (
					<p role="alert" className="mt-2 text-sm text-[var(--danger)]">
						{mutation.error.message}
					</p>
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
		<Sheet title="Edit feed" subtitle={feed.sourceUrl} onClose={onClose}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					mutation.mutate();
				}}
			>
				<label className="mt-3 block">
					<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
						Label
					</span>
					<Input
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						placeholder={feed.title}
					/>
				</label>

				{folders.length > 0 && (
					<label className="mt-2.5 block">
						<span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-secondary">
							Folder
						</span>
						<select
							value={folderId}
							onChange={(event) => setFolderId(event.target.value)}
							className="h-12 w-full rounded-2xl border border-subtle bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)]"
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
					type="button"
					onClick={() => setIsPinned(!isPinned)}
					className={`mt-2.5 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
						isPinned
							? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.2)]"
							: "border-subtle text-secondary"
					}`}
				>
					{isPinned ? (
						<Check className="size-4" />
					) : (
						<div className="size-4 rounded border border-subtle" />
					)}
					Pin to top
				</button>

				{onReorder && (
					<div className="mt-2.5 flex gap-2">
						<button
							type="button"
							onClick={() => onReorder("up")}
							className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-subtle bg-[var(--surface-muted)] py-3 text-xs font-medium text-secondary"
						>
							<ArrowUp className="size-4" />
							Move up
						</button>
						<button
							type="button"
							onClick={() => onReorder("down")}
							className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-subtle bg-[var(--surface-muted)] py-3 text-xs font-medium text-secondary"
						>
							<ArrowDown className="size-4" />
							Move down
						</button>
					</div>
				)}

				<Button
					type="submit"
					className="mt-3.5 w-full"
					disabled={mutation.isPending}
				>
					{mutation.isPending ? "Saving..." : "Save"}
				</Button>
				{mutation.error ? (
					<p role="alert" className="mt-2 text-sm text-[var(--danger)]">
						{mutation.error.message}
					</p>
				) : null}
			</form>

			<button
				type="button"
				onClick={() => {
					if (confirm("Delete this feed and all its items?")) {
						onDelete();
						onClose();
					}
				}}
				className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-2.5 text-sm font-medium text-[var(--danger)]"
			>
				<Trash2 className="size-4" />
				Delete feed
			</button>
		</Sheet>
	);
}

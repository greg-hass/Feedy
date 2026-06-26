"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { FolderOpen, FolderPlus } from "lucide-react";

import {
	EmptyState,
	ErrorState,
	LoadingSkeleton,
	MobileShell,
	useMe,
} from "@/components/app-shell";
import { FolderRow } from "@/components/feed-library-components";
import { IconButton } from "@/components/ui/icon-button";

const AddFolderForm = dynamic(
	() => import("@/components/forms").then((module) => module.AddFolderForm),
	{
		ssr: false,
	},
);

export function FoldersScreen() {
	const me = useMe();
	const [showAddFolder, setShowAddFolder] = useState(false);

	if (me.isLoading)
		return (
			<MobileShell title="Folders">
				<LoadingSkeleton />
			</MobileShell>
		);
	if (me.error)
		return (
			<MobileShell title="Folders">
				<ErrorState message={me.error.message} onRetry={() => me.refetch()} />
			</MobileShell>
		);

	const folders = me.data?.navigation.folders ?? [];

	return (
		<MobileShell
			title="Folders"
			actions={
				<IconButton
					variant="accent"
					onClick={() => setShowAddFolder(true)}
					aria-label="Create folder"
				>
					<FolderPlus className="size-4" />
				</IconButton>
			}
		>
			{showAddFolder && (
				<div className="mb-3">
					<AddFolderForm onClose={() => setShowAddFolder(false)} />
				</div>
			)}

			<div className="space-y-2">
				{folders.map((folder, index) => (
					<FolderRow
						key={folder.id}
						folder={folder}
						folders={folders}
						index={index}
					/>
				))}
				{!folders.length && (
					<EmptyState
						title="No folders yet"
						body="Create folders to organize your feeds."
						icon={<FolderOpen className="size-6" />}
					/>
				)}
			</div>
		</MobileShell>
	);
}

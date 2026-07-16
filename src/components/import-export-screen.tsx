"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { MobileShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
	formatImportSummary,
	type ImportSummary,
} from "@/lib/import-export-ui";
import {
	MAX_JSON_EXPORT_ITEMS,
	MAX_OPML_IMPORT_BYTES,
	MAX_OPML_IMPORT_FEEDS,
} from "@/lib/workload-limits";

export function ImportExportScreen() {
	const queryClient = useQueryClient();
	const [file, setFile] = useState<File | null>(null);
	const [status, setStatus] = useState<
		"idle" | "uploading" | "success" | "error"
	>("idle");
	const [statusMessage, setStatusMessage] = useState("");
	const [exportStatus, setExportStatus] = useState<
		"idle" | "downloading" | "success" | "error"
	>("idle");
	const [exportMessage, setExportMessage] = useState("");
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const upload = useMutation({
		mutationFn: async () => {
			if (!file) throw new Error("Choose an OPML file");
			const form = new FormData();
			form.append("file", file);
			const response = await fetch("/api/import/opml", {
				method: "POST",
				body: form,
			});
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error || "Import failed");
			}
			return response.json();
		},
		onMutate: () => {
			setStatus("uploading");
			setStatusMessage(
				"Importing subscriptions and preserving folder structure...",
			);
		},
		onSuccess: (result: ImportSummary) => {
			setFile(null);
			setStatus("success");
			setStatusMessage(formatImportSummary(result));
			queryClient.invalidateQueries({ queryKey: ["me"] });
		},
		onError: (err) => {
			setStatus("error");
			setStatusMessage(err instanceof Error ? err.message : "Import failed");
		},
	});

	const downloadJson = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/export/json", {
				cache: "no-store",
				credentials: "same-origin",
			});
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error || "JSON export failed");
			}

			const url = window.URL.createObjectURL(await response.blob());
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = "feedy-backup.json";
			anchor.click();
			window.URL.revokeObjectURL(url);
		},
		onMutate: () => {
			setExportStatus("downloading");
			setExportMessage("Preparing your JSON backup...");
		},
		onSuccess: () => {
			setExportStatus("success");
			setExportMessage("JSON backup downloaded.");
		},
		onError: (error) => {
			setExportStatus("error");
			setExportMessage(
				error instanceof Error ? error.message : "JSON export failed",
			);
		},
	});

	return (
		<MobileShell title="Import / Export">
			<div className="space-y-3">
				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Import OPML</h3>
					<p className="mt-1 text-xs leading-relaxed text-secondary">
						Upload an OPML file from another feed reader. Imports support files
						up to {MAX_OPML_IMPORT_BYTES / (1024 * 1024)} MB and{" "}
						{MAX_OPML_IMPORT_FEEDS.toLocaleString()} subscriptions.
					</p>
					<input
						ref={fileInputRef}
						type="file"
						accept="*/*"
						className="hidden"
						onChange={(event) => {
							setFile(event.target.files?.[0] ?? null);
							setStatus("idle");
							setStatusMessage("");
						}}
					/>
					<div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="flex h-12 items-center rounded-2xl bg-[var(--surface-strong)] px-4 text-sm text-secondary"
						>
							<span className="truncate">
								{file ? file.name : "Choose OPML file"}
							</span>
						</button>
						{file ? (
							<button
								type="button"
								onClick={() => {
									setFile(null);
									setStatus("idle");
									setStatusMessage("");
									if (fileInputRef.current) {
										fileInputRef.current.value = "";
									}
								}}
								className="h-12 rounded-2xl bg-[var(--surface-strong)] px-4 text-sm text-secondary"
							>
								Clear
							</button>
						) : null}
					</div>
					<Button
						onClick={() => {
							if (!file) {
								setStatus("error");
								setStatusMessage("Choose an OPML file first.");
								return;
							}
							upload.mutate();
						}}
						className="mt-3 w-full"
						disabled={status === "uploading"}
					>
						{status === "uploading" ? "Importing..." : "Import subscriptions"}
					</Button>
					{status === "uploading" ? (
						<div className="mt-3 rounded-2xl border border-subtle bg-[var(--surface-strong)] px-4 py-3">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-[var(--text-primary)]">
									Importing feeds
								</p>
								<p className="text-xs text-secondary">Working</p>
							</div>
							<div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
								<div className="import-progress-bar h-full w-1/3 rounded-full bg-[var(--accent)]" />
							</div>
							<p className="mt-2 text-xs text-secondary">
								This can take a moment for larger OPML files.
							</p>
						</div>
					) : null}
					{status !== "idle" && (
						<div
							role={status === "error" ? "alert" : "status"}
							aria-live="polite"
							className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
								status === "success"
									? "border-subtle bg-[var(--surface-strong)] text-[var(--text-primary)]"
									: status === "error"
										? "border-[var(--danger)]/25 bg-[var(--danger)]/8 text-[var(--danger)]"
										: "border-subtle bg-[var(--surface-muted)] text-secondary"
							}`}
						>
							{statusMessage}
						</div>
					)}
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Export</h3>
					<p className="mt-1 text-xs leading-relaxed text-secondary">
						JSON backups include up to {MAX_JSON_EXPORT_ITEMS.toLocaleString()}{" "}
						articles. For larger libraries, keep a database backup.
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<a href="/api/export/opml">
							<Button variant="secondary" className="w-full text-xs">
								Export OPML
							</Button>
						</a>
						<Button
							className="w-full text-xs"
							onClick={() => downloadJson.mutate()}
							disabled={exportStatus === "downloading"}
						>
							{exportStatus === "downloading" ? "Exporting..." : "Export JSON"}
						</Button>
					</div>
					{exportStatus !== "idle" ? (
						<div
							role={exportStatus === "error" ? "alert" : "status"}
							aria-live="polite"
							className={`mt-3 rounded-xl px-3 py-2 text-xs ${
								exportStatus === "success"
									? "bg-[var(--accent-soft)] text-[var(--accent)]"
									: exportStatus === "error"
										? "bg-[var(--danger)]/10 text-[var(--danger)]"
										: "bg-[var(--surface-muted)] text-secondary"
							}`}
						>
							{exportMessage}
						</div>
					) : null}
				</div>
			</div>
		</MobileShell>
	);
}

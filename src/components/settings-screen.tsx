"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { Loader2, Upload } from "lucide-react";

import { MobileShell, useMe } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { accentOptions } from "@/lib/theme";
import {
	getStoredLayoutMode,
	layoutModes,
	setStoredLayoutMode,
	subscribeToLayoutMode,
	type LayoutMode,
} from "@/lib/layout";
import type { MeResponse } from "@/types/app";

type SettingKey = keyof MeResponse["user"]["settings"];

type StorageStats = {
	dbSizeBytes: number;
	feedCount: number;
	articleCount: number;
	bookmarkedArticleCount: number;
	retentionDays: number;
};

function formatBytes(bytes: number) {
	if (bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	return `${value.toFixed(exponent === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[exponent]}`;
}

export function SettingsScreen() {
	const me = useMe();
	const queryClient = useQueryClient();
	const [pendingLabel, setPendingLabel] = useState("");
	const [pendingSetting, setPendingSetting] = useState<SettingKey | null>(null);
	const layoutMode = useSyncExternalStore<LayoutMode>(
		subscribeToLayoutMode,
		getStoredLayoutMode,
		() => "card",
	);
	const storage = useQuery({
		queryKey: ["settings-storage"],
		queryFn: () => api<StorageStats>("/api/settings/storage"),
	});
	const settings = useMutation({
		mutationFn: (body: Record<string, unknown>) =>
			api("/api/settings", {
				method: "PATCH",
				body: JSON.stringify(body),
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["me"] });
		},
	});
	const saveSetting = (
		key: SettingKey,
		label: string,
		body: Record<string, unknown>,
	) => {
		setPendingLabel(label);
		setPendingSetting(key);
		settings.mutate(body);
	};

	return (
		<MobileShell title="Settings">
			<div className="space-y-3">
				{(settings.error || (settings.isSuccess && pendingLabel)) && (
					<p
						role={settings.error ? "alert" : "status"}
						aria-live="polite"
						className={
							settings.error
								? "text-sm text-[var(--danger)]"
								: "text-sm text-secondary"
						}
					>
						{settings.error
							? `Could not save ${pendingLabel}. ${settings.error.message}`
							: `${pendingLabel} saved.`}
					</p>
				)}
				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Account</h3>
					<p className="mt-2 text-sm text-secondary">
						Signed in as{" "}
						<span className="font-medium text-[var(--text-primary)]">
							{me.data?.user.username}
						</span>
					</p>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Appearance</h3>
					<div className="mt-4">
						<p className="text-xs font-medium text-[var(--text-primary)]">
							Layout style
						</p>
						<p className="mt-1 text-xs text-secondary">
							Choose between floating cards and a flatter list layout.
						</p>
						<div className="mt-3 grid grid-cols-2 gap-2">
							{layoutModes.map((mode) => {
								const active = layoutMode === mode;
								return (
									<button
										key={mode}
										type="button"
									onClick={() => {
										setStoredLayoutMode(mode);
										}}
										className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize transition-colors ${
											active
												? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
												: "border-subtle bg-[var(--surface-muted)] text-secondary"
										}`}
										aria-pressed={active}
									>
										{mode}
									</button>
								);
							})}
						</div>
					</div>
					<div className="mt-4">
						<p className="text-xs font-medium text-[var(--text-primary)]">
							Accent colour
						</p>
						<p className="mt-1 text-xs text-secondary">
							Used for active states and highlights.
						</p>
						<div className="mt-3 grid grid-cols-6 justify-items-center gap-2.5">
							{accentOptions.map((option) => {
								const active =
									me.data?.user.settings.accentColor === option.key;
								return (
									<button
										key={option.key}
										onClick={() => {
										saveSetting("accentColor", "accent colour", {
										accentColor: option.key,
									});
								}}
										disabled={settings.isPending}
										className={`flex size-11 items-center justify-center rounded-full border-2 transition-transform ${
											active
												? "scale-105 border-[var(--text-primary)]"
												: "border-transparent"
										}`}
										style={{
											backgroundColor: option.hex,
											boxShadow: active
												? "0 0 0 3px color-mix(in srgb, var(--text-primary) 16%, transparent)"
												: "none",
										}}
										aria-label={`Use ${option.label} accent`}
										title={option.label}
									>
										{active && settings.isPending ? (
											<Loader2 className="size-4 animate-spin text-[var(--text-primary)]" />
										) : active ? (
											<span className="text-lg font-semibold text-[var(--text-primary)]">
												✓
											</span>
										) : null}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Refresh cadence</h3>
					<p className="mt-2 text-xs text-secondary">
						Current: {me.data?.user.settings.refreshIntervalMinutes ?? 15}{" "}
						minutes
					</p>
					<div className="mt-3 flex gap-2">
						{[15, 30, 60, 180].map((minutes) => (
							<button
								key={minutes}
								onClick={() => {
									saveSetting("refreshIntervalMinutes", "refresh cadence", {
										refreshIntervalMinutes: minutes,
									});
								}}
								disabled={settings.isPending}
								aria-pressed={
									me.data?.user.settings.refreshIntervalMinutes === minutes
								}
								className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
									me.data?.user.settings.refreshIntervalMinutes === minutes
										? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
										: "border-subtle bg-[var(--surface-muted)] text-secondary"
								}`}
							>
								<span className="inline-flex items-center gap-1.5">
									{me.data?.user.settings.refreshIntervalMinutes === minutes &&
									settings.isPending &&
									pendingSetting === "refreshIntervalMinutes" ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : null}
									{minutes}m
								</span>
							</button>
						))}
					</div>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Article view</h3>
					<p className="mt-2 text-xs text-secondary">
						Choose what happens when you tap an article. Safari marks the
						article read and opens the original site.
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						{[
							{ value: false, label: "Reader" },
							{ value: true, label: "Safari" },
						].map((option) => {
							const active =
								Boolean(me.data?.user.settings.readerOpenOriginalByDefault) ===
								option.value;
							return (
								<button
									key={option.label}
									onClick={() => {
										saveSetting(
											"readerOpenOriginalByDefault",
											"article view",
											{ readerOpenOriginalByDefault: option.value },
										);
									}}
									disabled={settings.isPending}
									aria-pressed={active}
									className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
										active
											? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
											: "border-subtle bg-[var(--surface-muted)] text-secondary"
									}`}
								>
									<span className="inline-flex items-center gap-1.5">
										{active &&
										settings.isPending &&
										pendingSetting === "readerOpenOriginalByDefault" ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : null}
										{option.label}
									</span>
								</button>
							);
						})}
					</div>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Device</h3>
					<div className="mt-3 flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-medium">Keep screen awake</p>
							<p className="mt-1 text-xs leading-relaxed text-secondary">
								Prevent the screen from dimming while Feedy is open. iPhone may
								still revoke this in low power mode or the background.
							</p>
						</div>
						<button
							type="button"
							onClick={() =>
								saveSetting("keepScreenAwake", "keep screen awake", {
									keepScreenAwake: !me.data?.user.settings.keepScreenAwake,
								})
							}
							className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
								me.data?.user.settings.keepScreenAwake
									? "border-[var(--accent)] bg-[var(--accent)]"
									: "border-subtle bg-[var(--surface-muted)]"
							}`}
							aria-pressed={Boolean(me.data?.user.settings.keepScreenAwake)}
							aria-label="Toggle keep screen awake"
						>
							<span
								className={`absolute size-6 rounded-full bg-[var(--surface)] shadow-[0_6px_16px_rgba(0,0,0,0.22)] transition-transform ${
									me.data?.user.settings.keepScreenAwake
										? "translate-x-7"
										: "translate-x-1"
								}`}
							/>
						</button>
					</div>
					<div className="mt-4 flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-medium">Hide YouTube Shorts</p>
							<p className="mt-1 text-xs leading-relaxed text-secondary">
								Remove YouTube Shorts from the timeline and unread counts.
							</p>
						</div>
						<button
							type="button"
							onClick={() =>
								saveSetting("hideYouTubeShorts", "hide YouTube Shorts", {
									hideYouTubeShorts: !me.data?.user.settings.hideYouTubeShorts,
								})
							}
							className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
								me.data?.user.settings.hideYouTubeShorts
									? "border-[var(--accent)] bg-[var(--accent)]"
									: "border-subtle bg-[var(--surface-muted)]"
							}`}
							aria-pressed={Boolean(me.data?.user.settings.hideYouTubeShorts)}
							aria-label="Toggle hide YouTube Shorts"
						>
							<span
								className={`absolute size-6 rounded-full bg-[var(--surface)] shadow-[0_6px_16px_rgba(0,0,0,0.22)] transition-transform ${
									me.data?.user.settings.hideYouTubeShorts
										? "translate-x-7"
										: "translate-x-1"
								}`}
							/>
						</button>
					</div>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Database</h3>
					<p className="mt-2 text-xs leading-relaxed text-secondary">
						Local storage usage, retention, and safe purge controls. Bookmarked
						items are never deleted.
					</p>
					<div className="mt-4 grid grid-cols-2 gap-2">
						<div data-flat-surface="true" className="rounded-2xl bg-[var(--surface-strong)] p-3">
							<p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">
								Database size
							</p>
							<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
								{storage.data ? formatBytes(storage.data.dbSizeBytes) : "—"}
							</p>
						</div>
						<div data-flat-surface="true" className="rounded-2xl bg-[var(--surface-strong)] p-3">
							<p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">
								Feeds stored
							</p>
							<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
								{storage.data ? storage.data.feedCount.toLocaleString() : "—"}
							</p>
						</div>
						<div data-flat-surface="true" className="rounded-2xl bg-[var(--surface-strong)] p-3">
							<p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">
								Articles stored
							</p>
							<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
								{storage.data
									? storage.data.articleCount.toLocaleString()
									: "—"}
							</p>
						</div>
						<div data-flat-surface="true" className="rounded-2xl bg-[var(--surface-strong)] p-3">
							<p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">
								Saved items
							</p>
							<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
								{storage.data
									? storage.data.bookmarkedArticleCount.toLocaleString()
									: "—"}
							</p>
						</div>
					</div>
					<div data-flat-surface="true" className="mt-4 rounded-2xl bg-[var(--surface-strong)] p-3">
						<p className="text-[11px] uppercase tracking-[0.12em] text-tertiary">
							Retention
						</p>
						<p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
							{me.data?.user.settings.itemRetentionDays ?? 90} days
						</p>
						<p className="mt-1 text-xs leading-relaxed text-secondary">
							Unread and read items older than this window are removed
							automatically unless they are bookmarked.
						</p>
						<div className="mt-3 flex gap-2">
							{[14, 30, 90, 180, 365].map((days) => (
								<button
									key={days}
									onClick={() => {
										setPendingLabel("retention");
										settings.mutate({ itemRetentionDays: days });
									}}
									aria-pressed={
										me.data?.user.settings.itemRetentionDays === days
									}
									className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
										me.data?.user.settings.itemRetentionDays === days
											? "border-[var(--accent)]/30 bg-[var(--accent-dim)] text-[var(--accent)]"
											: "border-subtle bg-[var(--surface-muted)] text-secondary"
									}`}
								>
									{days}d
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="panel p-4">
					<h3 className="text-sm font-semibold">Import & export</h3>
					<p className="mt-2 text-xs text-secondary">
						Move subscriptions with OPML or keep a full JSON backup.
					</p>
					<div className="mt-3">
						<Link href="/app/import-export">
							<Button variant="secondary" className="w-full text-xs">
								<Upload className="size-3.5 mr-1.5" />
								Manage imports and backups
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</MobileShell>
	);
}

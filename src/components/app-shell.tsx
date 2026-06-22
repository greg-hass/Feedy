"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Compass, Flame, LogOut, Rss, Settings } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { api } from "@/lib/client";
import { isActiveTabTap, vibrateIfSupported } from "@/lib/tab-interactions";
import type { MeResponse } from "@/types/app";

const navItems = [
	{ href: "/app/unread", label: "Timeline", icon: Flame },
	{ href: "/app/feeds", label: "Feeds", icon: Rss },
	{ href: "/app/discover", label: "Discover", icon: Compass },
	{ href: "/app/saved", label: "Saved", icon: Bookmark },
	{ href: "/app/settings", label: "Settings", icon: Settings },
];

export function useMe() {
	return useQuery({
		queryKey: ["me"],
		queryFn: () => api<MeResponse>("/api/me"),
		staleTime: 30_000,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: true,
	});
}

export function MobileShell({
	title,
	subtitle: _subtitle,
	actions,
	backButton,
	children,
}: {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
	backButton?: React.ReactNode;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const queryClient = useQueryClient();
	const me = useMe();

	const logout = useMutation({
		mutationFn: () => api("/api/auth/logout", { method: "POST" }),
		onSuccess: async () => {
			await queryClient.clear();
			router.replace("/login");
		},
	});

	const unreadTotal = me.data?.navigation.stats.unreadTotal ?? 0;
	const accent = me.data?.user.settings.accentColor ?? "EMERALD";

	useEffect(() => {
		document.documentElement.dataset.accent = accent;
	}, [accent]);

	return (
		<div className="app-shell screen-enter">
			<div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
				<header
					data-mobile-shell-header="true"
					className="fixed inset-x-0 top-0 z-40"
					style={{ backgroundColor: "var(--app-bg)" }}
				>
					<div className="mx-auto max-w-md px-5 pb-0 pt-[max(12px,env(safe-area-inset-top))]">
						<div className="flex items-center justify-between gap-3">
							<div className="shrink-0">{backButton ?? null}</div>
							<div className="flex shrink-0 items-center gap-2">
								{actions}
								<IconButton
									onClick={() => logout.mutate()}
									aria-label="Sign out"
								>
									<LogOut className="size-4" />
								</IconButton>
							</div>
						</div>

						<div className="mt-2 flex items-end justify-between gap-3 border-b border-subtle pb-2">
							<div className="min-w-0 flex-1 pb-0.5">
								<h1
									className="text-[2rem] font-bold leading-[0.98] tracking-[-0.045em]"
									style={{ color: "var(--text-primary)" }}
								>
									{title}
								</h1>
							</div>
							<div
								className="shrink-0 rounded-full px-3.5 py-2"
								style={{
									border: "1px solid var(--border)",
									backgroundColor: "var(--surface)",
								}}
							>
								<div className="flex items-center gap-1.5">
									{unreadTotal > 0 && (
										<span
											className="h-2 w-2 rounded-full"
											style={{ backgroundColor: "var(--accent)" }}
										/>
									)}
									<span
										className="text-[13px] font-semibold leading-none"
										style={{ color: "var(--text-primary)" }}
									>
										{unreadTotal}
									</span>
									<span
										className="text-[11px] leading-none"
										style={{ color: "var(--text-secondary)" }}
									>
										unread
									</span>
								</div>
							</div>
						</div>
					</div>
				</header>

				<div className="px-5">
					<main
						className="flex-1 pb-24"
						style={{
							paddingTop: "calc(env(safe-area-inset-top) + 116px)",
						}}
					>
						{children}
					</main>
				</div>

				<nav className="fixed inset-x-0 bottom-0 z-50 pb-[max(16px,env(safe-area-inset-bottom))]">
					<div className="mx-auto flex max-w-md justify-center px-6">
						<div
							className="flex items-center gap-1 rounded-[28px] border px-1.5 py-1.5 backdrop-blur-2xl"
							style={{
								backgroundColor: "var(--glass-bg)",
								borderColor: "var(--glass-border)",
								boxShadow: "var(--glass-shadow)",
								WebkitBackdropFilter: "blur(40px) saturate(180%)",
								backdropFilter: "blur(40px) saturate(180%)",
							}}
						>
							{navItems.map((item) => {
								const Icon = item.icon;
								const active = pathname === item.href;
								const handleTabClick = (
									event: React.MouseEvent<HTMLAnchorElement>,
								) => {
									if (
										event.metaKey ||
										event.ctrlKey ||
										event.shiftKey ||
										event.altKey ||
										event.button !== 0
									) {
										return;
									}

									if (!isActiveTabTap(pathname, item.href)) {
										return;
									}

									event.preventDefault();
									window.scrollTo({ top: 0, behavior: "auto" });
									vibrateIfSupported(window.navigator, 10);
								};

								return (
									<Link
										key={item.href}
										href={item.href}
										onClick={handleTabClick}
										className={`relative flex min-w-0 flex-col items-center gap-1 rounded-[18px] px-3.5 py-2 text-[10px] transition-all duration-200 ${
											active
												? "border"
												: "border border-transparent"
										}`}
										style={
											active
												? {
														backgroundColor: "var(--accent-dim)",
														borderColor:
															"color-mix(in srgb, var(--accent) 30%, transparent)",
														color: "var(--accent)",
														fontWeight: 600,
													}
												: {
														color: "var(--text-secondary)",
														fontWeight: 500,
													}
										}
									>
										<Icon
											className="size-[22px]"
											strokeWidth={active ? 2.5 : 2}
											style={{
												color: active
													? "var(--accent)"
													: "var(--text-secondary)",
											}}
										/>
										<span style={{ letterSpacing: "0.04em" }}>
											{item.label}
										</span>
									</Link>
								);
							})}
						</div>
					</div>
				</nav>
			</div>
		</div>
	);
}

// Premium Loading Skeleton
export function LoadingSkeleton() {
	return (
		<div className="space-y-4">
			{[1, 2, 3].map((i) => (
				<div
					key={i}
					className="overflow-hidden rounded-[24px]"
					style={{
						border: "1px solid var(--border)",
						backgroundColor: "var(--surface)",
					}}
				>
					<div className="aspect-video w-full shimmer" />
					<div className="p-4">
						<div
							className="h-3 w-20 rounded-full"
							style={{ backgroundColor: "var(--surface-muted)" }}
						/>
						<div
							className="mt-3 h-5 w-4/5 rounded-full"
							style={{ backgroundColor: "var(--surface-muted)" }}
						/>
						<div
							className="mt-2 h-4 w-full rounded-full"
							style={{ backgroundColor: "var(--surface-muted)" }}
						/>
						<div
							className="mt-2 h-4 w-2/3 rounded-full"
							style={{ backgroundColor: "var(--surface-muted)" }}
						/>
						<div className="mt-4 flex gap-2">
							<div
								className="h-10 flex-1 rounded-xl"
								style={{ backgroundColor: "var(--surface-muted)" }}
							/>
							<div
								className="h-10 w-10 rounded-xl"
								style={{ backgroundColor: "var(--surface-muted)" }}
							/>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

// Premium Error State
export function ErrorState({
	title = "Something went wrong",
	message,
	onRetry,
}: {
	title?: string;
	message: string;
	onRetry?: () => void;
}) {
	return (
		<div
			className="rounded-[24px] p-6 text-center"
			style={{
				backgroundColor: "var(--surface)",
				border: "1px solid var(--border)",
				boxShadow: "var(--shadow)",
			}}
		>
			<div
				className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
				style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
			>
				<span className="text-xl">⚠️</span>
			</div>
			<p
				className="text-lg font-semibold"
				style={{ color: "var(--text-primary)" }}
			>
				{title}
			</p>
			<p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
				{message}
			</p>
			{onRetry && (
				<button
					onClick={onRetry}
					className="mt-5 rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
					style={{
						backgroundColor: "var(--accent)",
						color: "var(--accent-contrast)",
					}}
				>
					Try again
				</button>
			)}
		</div>
	);
}

// Premium Empty State
export function EmptyState({
	title,
	body,
	icon,
	action,
}: {
	title: string;
	body: string;
	icon?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div
			className="rounded-[24px] px-6 py-12 text-center"
			style={{
				backgroundColor: "var(--surface)",
				border: "1px dashed var(--border)",
			}}
		>
			{icon && (
				<div
					className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
					style={{
						backgroundColor: "var(--accent-dim)",
						color: "var(--accent)",
					}}
				>
					{icon}
				</div>
			)}
			<h3
				className="text-lg font-semibold"
				style={{ color: "var(--text-primary)" }}
			>
				{title}
			</h3>
			<p
				className="mt-2 text-sm leading-relaxed"
				style={{ color: "var(--text-secondary)" }}
			>
				{body}
			</p>
			{action ? <div className="mt-5 flex justify-center">{action}</div> : null}
		</div>
	);
}

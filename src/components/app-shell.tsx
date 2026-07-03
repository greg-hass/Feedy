"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Compass, Flame, LogOut, Rss, Settings } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { useAutoHideHeader } from "@/components/use-auto-hide-header";
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

function useLogout() {
	const queryClient = useQueryClient();
	const router = useRouter();

	return useMutation({
		mutationFn: () => api("/api/auth/logout", { method: "POST" }),
		onSuccess: async () => {
			await queryClient.clear();
			router.replace("/login");
		},
	});
}

export function MobileShell({
	title,
	actions,
	backButton,
	center,
	children,
}: {
	title: string;
	actions?: React.ReactNode;
	backButton?: React.ReactNode;
	center?: React.ReactNode;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const me = useMe();
	const { offsetPx: headerOffsetPx } = useAutoHideHeader();
	const logout = useLogout();

	const accent = me.data?.user.settings.accentColor ?? "EMERALD";

	useEffect(() => {
		document.documentElement.dataset.accent = accent;
	}, [accent]);

	return (
		<div className="app-shell screen-enter">
			<div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
				<header
					data-mobile-shell-header="true"
					className="fixed inset-x-0 top-0 z-40 will-change-transform"
					style={{
						backgroundColor: "var(--app-bg)",
						transform: `translateY(-${headerOffsetPx}px)`,
					}}
				>
					<div className="mx-auto max-w-md px-5 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
						<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
							<div className="flex min-w-0 items-center gap-2 justify-self-start">
								<div className="shrink-0">{backButton ?? null}</div>
								<h1
									className="truncate text-[2rem] font-bold leading-[1.1] tracking-[-0.045em]"
									style={{ color: "var(--text-primary)" }}
								>
									{title}
								</h1>
							</div>
							<div className="flex items-center justify-center justify-self-center">
								{center ?? <span />}
							</div>
							<div className="flex items-center gap-2 justify-self-end">
								{actions}
								<IconButton
									onClick={() => logout.mutate()}
									aria-label="Sign out"
								>
									<LogOut className="size-4" />
								</IconButton>
							</div>
						</div>
					</div>
				</header>

				<div className="px-5">
					<main
						className="flex-1 pb-24"
						style={{
							// Header is a single row (max(12px, safe-area) top +
							// 40px action row + 8px bottom padding). The base
							// uses the same `max(12px, env(...))` clamp as the
							// header so the constant below (60px = row + pb +
							// 12px gap) always yields a 12px gap between the
							// header bottom and the first content card on every
							// device, matching the inter-card `space-y-3` gap.
							paddingTop: "calc(max(12px, env(safe-area-inset-top)) + 60px)",
						}}
					>
						{children}
					</main>
				</div>

				<nav
					className="fixed inset-x-0 z-50"
					style={{
						bottom: "max(4px, calc(env(safe-area-inset-bottom) - 12px))",
					}}
				>
					<div className="mx-auto max-w-md px-5">
						<div
							className="flex w-full items-center justify-around rounded-[34px] border px-2 py-1.5 backdrop-blur-2xl"
							style={{
								background: "var(--glass-bg)",
								borderColor: "var(--glass-border)",
								boxShadow: "var(--glass-shadow)",
								WebkitBackdropFilter: "blur(20px) saturate(180%)",
								backdropFilter: "blur(20px) saturate(180%)",
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
										className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] transition-colors duration-200 ${
											active ? "font-semibold" : "font-medium"
										}`}
										style={{
											color: active ? "var(--accent)" : "var(--nav-inactive)",
										}}
										aria-current={active ? "page" : undefined}
									>
										<Icon
											className="size-[26px]"
											strokeWidth={active ? 2.5 : 2}
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

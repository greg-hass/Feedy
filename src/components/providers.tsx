"use client";

import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";
import { createPortal } from "react-dom";

import { WakeLockManager } from "@/components/wake-lock-manager";
import {
	applyLayoutMode,
	getStoredLayoutMode,
	layoutModeChangeEvent,
} from "@/lib/layout";
import { YouTubeInlinePlayer } from "@/components/youtube-inline-player";
import {
	getYouTubePlaybackHostStyle,
	getYouTubePlaybackSessionPlacement,
} from "@/lib/youtube-playback-session";

type ActiveYouTubePlayback = {
	itemId: string;
	videoId: string;
	title: string;
	startSeconds: number;
	sourcePathname: string;
	state: "playing" | "paused" | "buffering" | "ended";
};

type InlineYouTubeHost = { itemId: string; element: HTMLElement } | null;

function YouTubePlaybackSession({
	pathname,
	active,
	inlineHost,
	onPlaybackStateChange,
}: {
	pathname: string;
	active: ActiveYouTubePlayback | null;
	inlineHost: InlineYouTubeHost;
	onPlaybackStateChange: (state: ActiveYouTubePlayback["state"]) => void;
}) {
	const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null);
	const placement = active
		? getYouTubePlaybackSessionPlacement({
				pathname,
				active: { sourcePathname: active.sourcePathname, state: active.state },
			})
		: "none";

	useLayoutEffect(() => {
		if (!active || !hostElement) {
			if (hostElement) {
				Object.assign(
					hostElement.style,
					getYouTubePlaybackHostStyle({
						placement: "none",
						active,
						sourceRect: null,
					}),
				);
			}
			return;
		}

		const inlineElement =
			placement === "inline" && inlineHost?.itemId === active.itemId
				? inlineHost.element
				: null;

		const updateHostStyle = () => {
			Object.assign(
				hostElement.style,
				getYouTubePlaybackHostStyle({
					placement,
					active,
					sourceRect: inlineElement
						? inlineElement.getBoundingClientRect()
						: null,
				}),
			);
		};

		updateHostStyle();

		if (!inlineElement) {
			return;
		}

		let resizeObserver: ResizeObserver | null = null;

		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(updateHostStyle);
			resizeObserver.observe(inlineElement);
		}

		window.addEventListener("scroll", updateHostStyle, true);
		window.addEventListener("resize", updateHostStyle);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener("scroll", updateHostStyle, true);
			window.removeEventListener("resize", updateHostStyle);
		};
	}, [active, hostElement, inlineHost, placement]);

	if (!active) {
		return null;
	}

	return (
		<>
			<div
				ref={setHostElement}
				className="fixed left-[-9999px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
				aria-hidden
			/>
			{hostElement
				? createPortal(
						<YouTubeInlinePlayer
							itemId={active.itemId}
							videoId={active.videoId}
							title={active.title}
							startSeconds={active.startSeconds}
							variant="mount"
							className="h-full w-full"
							onPlaybackStateChange={onPlaybackStateChange}
						/>,
						hostElement,
					)
				: null}
		</>
	);
}

// Set once at module load time — prevents the browser from auto-scrolling
// to 0 on popstate (back navigation). Without this, the browser's own scroll
// restoration fires before any React effect can set it to "manual", causing
// the timeline scroll position to reset when returning from an article.
if (typeof window !== "undefined") {
	window.history.scrollRestoration = "manual";
}

export function Providers({
	children,
	nonce,
}: {
	children: React.ReactNode;
	nonce?: string;
}) {
	const pathname = usePathname();
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60_000,
						refetchOnWindowFocus: false,
					},
				},
			}),
	);
	const [activeYouTubePlayback] = useState<ActiveYouTubePlayback | null>(null);
	const [inlineYouTubeHost] = useState<InlineYouTubeHost>(null);
	const lastResumeRefetchAtRef = useRef(0);

	useEffect(() => {
		const refetchFreshServerState = () => {
			if (document.visibilityState !== "visible") {
				return;
			}

			const now = Date.now();
			if (now - lastResumeRefetchAtRef.current < 750) {
				return;
			}
			lastResumeRefetchAtRef.current = now;

			void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
			void queryClient.refetchQueries({ queryKey: ["items"], type: "active" });
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				refetchFreshServerState();
			}
		};

		window.addEventListener("focus", refetchFreshServerState);
		window.addEventListener("pageshow", refetchFreshServerState);
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			window.removeEventListener("focus", refetchFreshServerState);
			window.removeEventListener("pageshow", refetchFreshServerState);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [queryClient]);

	useLayoutEffect(() => {
		applyLayoutMode(getStoredLayoutMode());
	}, []);

	useEffect(() => {
		const onLayoutModeChange = () => applyLayoutMode(getStoredLayoutMode());
		window.addEventListener("storage", onLayoutModeChange);
		window.addEventListener(layoutModeChangeEvent, onLayoutModeChange);

		return () => {
			window.removeEventListener("storage", onLayoutModeChange);
			window.removeEventListener(layoutModeChangeEvent, onLayoutModeChange);
		};
	}, []);

	useLayoutEffect(() => {
		if (!pathname.startsWith("/reader/")) {
			return;
		}

		// Reset scroll once when entering the reader route. The reader page
		// also resets on mount, so this provider-level reset is just a safety
		// net for the brief window before the page's own effect runs — kept
		// to a single call to avoid hammering the main thread on navigation.
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
	}, [pathname]);

	return (
		<ThemeProvider attribute="class" forcedTheme="dark" nonce={nonce}>
			<QueryClientProvider client={queryClient}>
				{children}
				<WakeLockManager />
				<YouTubePlaybackSession
					pathname={pathname}
					active={activeYouTubePlayback}
					inlineHost={inlineYouTubeHost}
					onPlaybackStateChange={() => {}}
				/>
				{process.env.NODE_ENV === "development" ? (
					<ReactQueryDevtools initialIsOpen={false} />
				) : null}
			</QueryClientProvider>
		</ThemeProvider>
	);
}

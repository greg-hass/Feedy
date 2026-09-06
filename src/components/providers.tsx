"use client";

import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";

import { WakeLockManager } from "@/components/wake-lock-manager";
import {
	applyLayoutMode,
	getStoredLayoutMode,
	layoutModeChangeEvent,
} from "@/lib/layout";
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
				{process.env.NODE_ENV === "development" ? (
					<ReactQueryDevtools initialIsOpen={false} />
				) : null}
			</QueryClientProvider>
		</ThemeProvider>
	);
}

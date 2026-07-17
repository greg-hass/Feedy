"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export function useListScrollRestoration({
	storageKey,
	enabled = true,
}: {
	storageKey: string;
	enabled?: boolean;
}) {
	const restoredKeyRef = useRef<string | null>(null);
	const saveFrameRef = useRef<number | null>(null);
	const latestScrollYRef = useRef(0);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const flush = () => {
			window.sessionStorage.setItem(
				storageKey,
				String(Math.max(0, Math.round(latestScrollYRef.current))),
			);
		};
		const save = () => {
			latestScrollYRef.current = window.scrollY;
			if (saveFrameRef.current != null) {
				return;
			}

			saveFrameRef.current = window.requestAnimationFrame(() => {
				saveFrameRef.current = null;
				flush();
			});
		};

		window.addEventListener("scroll", save, { passive: true });
		window.addEventListener("pagehide", flush);
		window.addEventListener("visibilitychange", flush);

		return () => {
			if (saveFrameRef.current != null) {
				window.cancelAnimationFrame(saveFrameRef.current);
				saveFrameRef.current = null;
			}
			latestScrollYRef.current = window.scrollY;
			flush();
			window.removeEventListener("scroll", save);
			window.removeEventListener("pagehide", flush);
			window.removeEventListener("visibilitychange", flush);
		};
	}, [enabled, storageKey]);

	useLayoutEffect(() => {
		if (!enabled || restoredKeyRef.current === storageKey) {
			return;
		}

		restoredKeyRef.current = storageKey;
		const savedScrollY = Number(
			window.sessionStorage.getItem(storageKey) || "0",
		);
		if (!Number.isFinite(savedScrollY) || savedScrollY <= 0) {
			return;
		}

		let active = true;
		let attempts = 0;
		let frame: number | null = null;
		let timeout: number | null = null;
		const restore = () => {
			if (!active) {
				return;
			}

			window.scrollTo({ top: savedScrollY, behavior: "auto" });
			attempts += 1;
			if (attempts < 8 && Math.abs(window.scrollY - savedScrollY) > 1) {
				frame = window.requestAnimationFrame(restore);
			}
		};

		frame = window.requestAnimationFrame(restore);
		timeout = window.setTimeout(restore, 250);

		return () => {
			active = false;
			if (frame != null) {
				window.cancelAnimationFrame(frame);
			}
			if (timeout != null) {
				window.clearTimeout(timeout);
			}
		};
	}, [enabled, storageKey]);
}

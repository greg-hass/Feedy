"use client";

import { useEffect, useLayoutEffect } from "react";

export function saveListScrollPosition(storageKey: string) {
	if (typeof window === "undefined") {
		return;
	}

	const scrollY = Math.max(
		window.scrollY,
		document.documentElement.scrollTop,
		document.body.scrollTop,
	);
	window.sessionStorage.setItem(
		storageKey,
		String(Math.max(0, Math.round(scrollY))),
	);
}

function restoreListScrollPosition(scrollY: number) {
	window.scrollTo({ top: scrollY, behavior: "auto" });
	document.documentElement.scrollTop = scrollY;
	document.body.scrollTop = scrollY;
}

export function useListScrollRestoration({
	storageKey,
	enabled = true,
}: {
	storageKey: string;
	enabled?: boolean;
}) {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const save = () => saveListScrollPosition(storageKey);
		window.addEventListener("scroll", save, { passive: true });
		window.addEventListener("pagehide", save);
		window.addEventListener("visibilitychange", save);

		return () => {
			save();
			window.removeEventListener("scroll", save);
			window.removeEventListener("pagehide", save);
			window.removeEventListener("visibilitychange", save);
		};
	}, [enabled, storageKey]);

	useLayoutEffect(() => {
		if (!enabled) {
			return;
		}

		const savedScrollY = Number(
			window.sessionStorage.getItem(storageKey) || "0",
		);
		if (!Number.isFinite(savedScrollY) || savedScrollY <= 0) {
			return;
		}

		let cancelled = false;
		const restore = () => {
			if (!cancelled) {
				restoreListScrollPosition(savedScrollY);
			}
		};
		const frame = window.requestAnimationFrame(restore);
		const timers = [0, 50, 150, 300, 600].map((delay) =>
			window.setTimeout(restore, delay),
		);

		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			timers.forEach((timer) => window.clearTimeout(timer));
		};
	}, [enabled, storageKey]);
}

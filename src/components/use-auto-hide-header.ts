"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_AT_TOP_PX = 16;
const SCROLL_TO_HEADER_RATIO = 0.48;
const MAX_OFFSET_HEADER_MULTIPLIER = 2.1;

/**
 * Clamp the header offset to [0, headerHeight * MAX_OFFSET_HEADER_MULTIPLIER]
 * and snap it to a whole pixel.
 *
 * Rationale: fractional translateY on the header's compositing layer
 * ("will-change-transform") makes iOS Safari rasterise text off the pixel
 * grid, which renders the header — and the fixed timeline panel that mirrors
 * this offset — blurry. Sub-pixel precision buys nothing visually.
 */
export function computeHeaderOffset(
	nextOffset: number,
	headerHeight: number,
): number {
	const safeHeight = Math.max(1, headerHeight);
	const maxOffset = safeHeight * MAX_OFFSET_HEADER_MULTIPLIER;
	return Math.round(Math.min(maxOffset, Math.max(0, nextOffset)));
}

/**
 * Gradually hides a fixed header on scroll-down and reveals it on scroll-up.
 *
 * Behaviour:
 * - Always visible near the top of the page (scrollY < SHOW_AT_TOP_PX).
 * - The header offset follows scroll distance instead of snapping between two
 *   states, which keeps the title row and timeline controls visually attached.
 *
 * The header stays `position: fixed`; only its visual offset is changed.
 */
export function useAutoHideHeader(): {
	hidden: boolean;
	offsetPx: number;
} {
	const [offsetPx, setOffsetPx] = useState(0);
	const [hidden, setHidden] = useState(false);
	const lastYRef = useRef(0);
	const frameRef = useRef<number | null>(null);
	const offsetRef = useRef(0);
	const headerHeightRef = useRef(96);

	useEffect(() => {
		lastYRef.current = window.scrollY;

		const updateHeaderHeight = () => {
			const header = document.querySelector<HTMLElement>(
				"[data-mobile-shell-header='true']",
			);
			headerHeightRef.current = Math.max(1, header?.offsetHeight ?? 96);
			document.documentElement.style.setProperty(
				"--mobile-header-height",
				`${headerHeightRef.current}px`,
			);
		};

		const setOffset = (nextOffset: number) => {
			const headerHeight = headerHeightRef.current;
			const clampedOffset = computeHeaderOffset(nextOffset, headerHeight);
			const nextProgress = clampedOffset / headerHeight;
			offsetRef.current = clampedOffset;
			document.documentElement.style.setProperty(
				"--mobile-header-offset",
				`${clampedOffset}px`,
			);
			document.documentElement.style.setProperty(
				"--mobile-header-hide-progress",
				nextProgress.toFixed(4),
			);
			document.documentElement.dataset.mobileHeaderHidden =
				nextProgress >= 0.98 ? "true" : "false";
			setHidden(nextProgress >= 0.98);
			setOffsetPx(clampedOffset);
		};

		const update = () => {
			frameRef.current = null;
			const currentY = window.scrollY;
			const delta = currentY - lastYRef.current;
			lastYRef.current = currentY;

			if (currentY < SHOW_AT_TOP_PX) {
				setOffset(0);
				return;
			}

			if (delta !== 0) {
				setOffset(offsetRef.current + delta * SCROLL_TO_HEADER_RATIO);
			}
		};

		const onScroll = () => {
			if (frameRef.current != null) return;
			frameRef.current = window.requestAnimationFrame(update);
		};

		updateHeaderHeight();
		setOffset(0);
		window.addEventListener("resize", updateHeaderHeight);
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			if (frameRef.current != null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			window.removeEventListener("resize", updateHeaderHeight);
			window.removeEventListener("scroll", onScroll);
			delete document.documentElement.dataset.mobileHeaderHidden;
			document.documentElement.style.removeProperty("--mobile-header-height");
			document.documentElement.style.removeProperty("--mobile-header-offset");
			document.documentElement.style.removeProperty(
				"--mobile-header-hide-progress",
			);
		};
	}, []);

	return {
		hidden,
		offsetPx,
	};
}

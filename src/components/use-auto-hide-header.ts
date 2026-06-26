"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_AT_TOP_PX = 16;
const HIDE_AFTER_DOWN_PX = 4;
const SHOW_AFTER_UP_PX = 4;

/**
 * Hides a sticky header on scroll-down and reveals it on scroll-up.
 *
 * Behaviour:
 * - Always visible near the top of the page (scrollY < SHOW_AT_TOP_PX).
 * - Small scroll jitter (< 4px net in either direction) does not toggle state.
 * - Once the user commits ~4px of net scroll in one direction, the header
 *   snaps to hidden (down) or visible (up).
 *
 * Returns a `hidden` flag the caller applies to the header element via
 * `transform: translateY(...)`. The header stays `position: fixed`; only
 * its visual offset is animated.
 */
export function useAutoHideHeader(): { hidden: boolean } {
	const [hidden, setHidden] = useState(false);
	const lastYRef = useRef(0);
	const frameRef = useRef<number | null>(null);
	const accumulatedDeltaRef = useRef(0);

	useEffect(() => {
		lastYRef.current = window.scrollY;

		const update = () => {
			frameRef.current = null;
			const currentY = window.scrollY;
			const delta = currentY - lastYRef.current;
			lastYRef.current = currentY;

			if (currentY < SHOW_AT_TOP_PX) {
				if (hidden) setHidden(false);
				accumulatedDeltaRef.current = 0;
				return;
			}

			accumulatedDeltaRef.current += delta;

			if (
				delta > 0 &&
				accumulatedDeltaRef.current >= HIDE_AFTER_DOWN_PX &&
				!hidden
			) {
				setHidden(true);
				accumulatedDeltaRef.current = 0;
				return;
			}

			if (
				delta < 0 &&
				accumulatedDeltaRef.current <= -SHOW_AFTER_UP_PX &&
				hidden
			) {
				setHidden(false);
				accumulatedDeltaRef.current = 0;
				return;
			}

			// If the user scrolls in the opposite direction to the current
			// state (e.g. scrolling up while already visible, or scrolling
			// down while already hidden), reset the accumulator so the next
			// genuine move gets a clean threshold.
			if ((delta > 0 && hidden) || (delta < 0 && !hidden)) {
				accumulatedDeltaRef.current = 0;
			}
		};

		const onScroll = () => {
			if (frameRef.current != null) return;
			frameRef.current = window.requestAnimationFrame(update);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			if (frameRef.current != null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			window.removeEventListener("scroll", onScroll);
		};
		// `hidden` is intentionally not in the dep list — the listener uses
		// it via closure for decision-making only; the effect should run once
		// on mount and clean up on unmount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return { hidden };
}

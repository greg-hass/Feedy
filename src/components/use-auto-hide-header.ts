"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_AT_TOP_PX = 16;
const HIDE_AFTER_DOWN_PX = 28;
const SHOW_AFTER_UP_PX = 28;

/**
 * Hides a sticky header on scroll-down and reveals it on scroll-up.
 *
 * Behaviour:
 * - Always visible near the top of the page (scrollY < SHOW_AT_TOP_PX).
 * - Small scroll jitter does not toggle state.
 * - Once the user commits meaningful net scroll in one direction, the header
 *   eases to hidden (down) or visible (up).
 *
 * The current visibility is mirrored into a ref because the scroll listener
 * runs inside a `useEffect([])` closure; reading the React state from the
 * closure would always see the value captured at mount.
 *
 * Returns a `hidden` flag the caller applies to the header element via
 * `transform: translateY(...)`. The header stays `position: fixed`; only
 * its visual offset is animated.
 */
export function useAutoHideHeader(): { hidden: boolean } {
	const [hidden, setHidden] = useState(false);
	const hiddenRef = useRef(false);
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
				if (hiddenRef.current) {
					hiddenRef.current = false;
					document.documentElement.dataset.mobileHeaderHidden = "false";
					setHidden(false);
				}
				accumulatedDeltaRef.current = 0;
				return;
			}

			accumulatedDeltaRef.current += delta;

			if (
				delta > 0 &&
				accumulatedDeltaRef.current >= HIDE_AFTER_DOWN_PX &&
				!hiddenRef.current
			) {
				hiddenRef.current = true;
				document.documentElement.dataset.mobileHeaderHidden = "true";
				setHidden(true);
				accumulatedDeltaRef.current = 0;
				return;
			}

			if (
				delta < 0 &&
				accumulatedDeltaRef.current <= -SHOW_AFTER_UP_PX &&
				hiddenRef.current
			) {
				hiddenRef.current = false;
				document.documentElement.dataset.mobileHeaderHidden = "false";
				setHidden(false);
				accumulatedDeltaRef.current = 0;
				return;
			}

			// If the user scrolls in the opposite direction to the current
			// state (e.g. scrolling up while already visible, or scrolling
			// down while already hidden), reset the accumulator so the next
			// genuine move gets a clean threshold.
			if (
				(delta > 0 && hiddenRef.current) ||
				(delta < 0 && !hiddenRef.current)
			) {
				accumulatedDeltaRef.current = 0;
			}
		};

		const onScroll = () => {
			if (frameRef.current != null) return;
			frameRef.current = window.requestAnimationFrame(update);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		document.documentElement.dataset.mobileHeaderHidden = "false";
		return () => {
			if (frameRef.current != null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			window.removeEventListener("scroll", onScroll);
			delete document.documentElement.dataset.mobileHeaderHidden;
		};
	}, []);

	return { hidden };
}

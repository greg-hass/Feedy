"use client";

import { useEffect, useState } from "react";

/**
 * Manages pull-to-refresh gesture for standalone PWA mode.
 *
 * Detects touch drag from top of page, shows visual feedback,
 * and triggers refresh when the pull exceeds the threshold.
 */
export function usePullToRefresh(deps: {
	isRefreshActive: boolean;
	onRefresh: () => void;
	onPullCancel: () => void;
}) {
	const { isRefreshActive, onRefresh, onPullCancel } = deps;
	const [pullDistance, setPullDistance] = useState(0);

	useEffect(() => {
		let startY: number | null = null;
		let dragging = false;
		let latestDistance = 0;

		const onTouchStart = (event: TouchEvent) => {
			if (window.scrollY > 4 || isRefreshActive) {
				startY = null;
				dragging = false;
				latestDistance = 0;
				return;
			}

			const target = event.target as HTMLElement | null;
			if (target?.closest("input, textarea, select")) {
				startY = null;
				dragging = false;
				latestDistance = 0;
				return;
			}

			startY = event.touches[0]?.clientY ?? null;
			dragging = false;
			latestDistance = 0;
		};

		const onTouchMove = (event: TouchEvent) => {
			if (startY == null || window.scrollY > 4) {
				return;
			}

			const currentY = event.touches[0]?.clientY ?? startY;
			const delta = currentY - startY;
			if (delta <= 0) {
				return;
			}

			dragging = true;
			latestDistance = Math.min(88, Math.round(delta * 0.45));
			setPullDistance(latestDistance);
			event.preventDefault();
		};

		const finishDrag = () => {
			if (dragging && latestDistance >= 56 && !isRefreshActive) {
				onRefresh();
			} else if (dragging && !isRefreshActive) {
				onPullCancel();
			}

			startY = null;
			dragging = false;

			// Smoothly animate back to 0
			const startDist = latestDistance;
			latestDistance = 0;
			if (startDist > 0) {
				const animStart = performance.now();
				const duration = 220;
				const step = (now: number) => {
					const t = Math.min(1, (now - animStart) / duration);
					const eased = 1 - Math.pow(1 - t, 3);
					setPullDistance(Math.round(startDist * (1 - eased)));
					if (t < 1) {
						requestAnimationFrame(step);
					} else {
						setPullDistance(0);
					}
				};
				requestAnimationFrame(step);
			} else {
				setPullDistance(0);
			}
		};

		window.addEventListener("touchstart", onTouchStart, { passive: true });
		window.addEventListener("touchmove", onTouchMove, { passive: false });
		window.addEventListener("touchend", finishDrag, { passive: true });
		window.addEventListener("touchcancel", finishDrag, { passive: true });

		return () => {
			window.removeEventListener("touchstart", onTouchStart);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", finishDrag);
			window.removeEventListener("touchcancel", finishDrag);
		};
	}, [isRefreshActive, onRefresh, onPullCancel]);

	return { pullDistance };
}

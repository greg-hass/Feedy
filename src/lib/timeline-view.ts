import { useSyncExternalStore } from "react";

export const timelineViews = ["cards", "compact"] as const;

export type TimelineView = (typeof timelineViews)[number];

export const timelineViewStorageKey = "feedy-timeline-view";
export const timelineViewChangeEvent = "feedy-timeline-view-change";

export function isTimelineView(value: string | null): value is TimelineView {
	return value === "cards" || value === "compact";
}

export function getStoredTimelineView(): TimelineView {
	if (typeof window === "undefined") {
		return "cards";
	}

	const value = window.localStorage.getItem(timelineViewStorageKey);
	return isTimelineView(value) ? value : "cards";
}

export function applyTimelineView(view: TimelineView) {
	if (typeof document !== "undefined") {
		document.documentElement.dataset.timelineView = view;
	}
}

export function setStoredTimelineView(view: TimelineView) {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(timelineViewStorageKey, view);
	applyTimelineView(view);
	window.dispatchEvent(new Event(timelineViewChangeEvent));
}

export function subscribeToTimelineView(onChange: () => void) {
	if (typeof window === "undefined") {
		return () => {};
	}

	const handleChange = () => onChange();
	window.addEventListener("storage", handleChange);
	window.addEventListener(timelineViewChangeEvent, handleChange);

	return () => {
		window.removeEventListener("storage", handleChange);
		window.removeEventListener(timelineViewChangeEvent, handleChange);
	};
}

/** Live timeline density preference (client-side, like layout mode). */
export function useTimelineView(): TimelineView {
	return useSyncExternalStore(
		subscribeToTimelineView,
		getStoredTimelineView,
		() => "cards",
	);
}

/**
 * Shared list container classes for every screen that renders timeline items.
 * Both views use the two-column grid at 744px+; compact rows pack tighter.
 */
export function timelineListClassName(view: TimelineView): string {
	const grid = "min-[744px]:grid min-[744px]:grid-cols-2";
	if (view === "compact") {
		return `space-y-2 ${grid} min-[744px]:gap-2 min-[744px]:space-y-0`;
	}
	return `space-y-3 ${grid} min-[744px]:gap-3 min-[744px]:space-y-0`;
}

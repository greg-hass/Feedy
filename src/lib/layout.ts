export const layoutModes = ["card", "flat"] as const;

export type LayoutMode = (typeof layoutModes)[number];

export const layoutModeStorageKey = "feedy-layout-mode";

export function isLayoutMode(value: string | null): value is LayoutMode {
	return value === "card" || value === "flat";
}

export function getStoredLayoutMode(): LayoutMode {
	if (typeof window === "undefined") {
		return "card";
	}

	const value = window.localStorage.getItem(layoutModeStorageKey);
	return isLayoutMode(value) ? value : "card";
}

export function applyLayoutMode(mode: LayoutMode) {
	if (typeof document !== "undefined") {
		document.documentElement.dataset.layout = mode;
	}
}

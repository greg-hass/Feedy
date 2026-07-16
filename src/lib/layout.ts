export const layoutModes = ["card", "flat"] as const;

export type LayoutMode = (typeof layoutModes)[number];

export const layoutModeStorageKey = "feedy-layout-mode";
export const layoutModeChangeEvent = "feedy-layout-mode-change";

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

export function setStoredLayoutMode(mode: LayoutMode) {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(layoutModeStorageKey, mode);
		applyLayoutMode(mode);
		window.dispatchEvent(new Event(layoutModeChangeEvent));
	}
}

export function subscribeToLayoutMode(onChange: () => void) {
	if (typeof window === "undefined") {
		return () => {};
	}

	const handleChange = () => onChange();
	window.addEventListener("storage", handleChange);
	window.addEventListener(layoutModeChangeEvent, handleChange);

	return () => {
		window.removeEventListener("storage", handleChange);
		window.removeEventListener(layoutModeChangeEvent, handleChange);
	};
}

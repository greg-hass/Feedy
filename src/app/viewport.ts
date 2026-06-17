import type { Viewport } from "next";

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	colorScheme: "dark light",
	// Required on iOS PWA so env(safe-area-inset-*) returns real values.
	// Without this, the bottom-nav padding falls back to 16px and the
	// home-indicator swipe-up area overlaps the nav pill.
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

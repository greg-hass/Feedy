import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Feedy",
		short_name: "Feedy",
		description: "Mobile-first self-hosted RSS, Reddit RSS, and YouTube RSS reader",
		start_url: "/app/unread",
		// Without an explicit scope, iOS PWA defaults the scope to the parent
		// path of start_url — which is /app/. That means navigating to /reader/*
		// falls outside the PWA scope and iOS opens it in Safari instead of
		// keeping it in the standalone shell. Setting scope to "/" keeps every
		// route (timeline, feeds, reader, settings) inside the PWA.
		scope: "/",
		display: "standalone",
    background_color: "#081114",
    theme_color: "#081114",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Feedy",
    short_name: "Feedy",
    description: "Mobile-first self-hosted RSS, Reddit RSS, and YouTube RSS reader",
    start_url: "/app/unread",
    display: "standalone",
    background_color: "#081114",
    theme_color: "#081114",
    orientation: "portrait",
    icons: [
      {
        src: "/api/pwa/icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/api/pwa/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

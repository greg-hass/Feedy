import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { headers } from "next/headers";

import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
import { viewport as appViewport } from "@/app/viewport";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Feedy",
  description: "Mobile-first self-hosted feed reader",
  applicationName: "Feedy",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/icon-64.png", sizes: "64x64", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Feedy",
    // Let the app background continue behind the standalone PWA status bar.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = appViewport;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--app-bg)] text-[var(--text-primary)]">
        <Providers nonce={nonce}>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

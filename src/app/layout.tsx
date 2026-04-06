import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
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
  icons: {
    icon: [
      { url: "/api/pwa/icon?size=64", sizes: "64x64", type: "image/png" },
      { url: "/api/pwa/icon?size=192", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/api/pwa/icon?size=180", sizes: "180x180", type: "image/png" }],
    shortcut: [{ url: "/api/pwa/icon?size=64", sizes: "64x64", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Feedy",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--app-bg)] text-[var(--text-primary)]">
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

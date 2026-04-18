"use client";

import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useLayoutEffect, useState } from "react";
import { ThemeProvider } from "next-themes";

import { WakeLockManager } from "@/components/wake-lock-manager";

// Set once at module load time — prevents the browser from auto-scrolling
// to 0 on popstate (back navigation). Without this, the browser's own scroll
// restoration fires before any React effect can set it to "manual", causing
// the timeline scroll position to reset when returning from an article.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useLayoutEffect(() => {
    if (!pathname.startsWith("/reader/")) {
      return;
    }

    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frameOne = window.requestAnimationFrame(resetScroll);
    const frameTwo = window.requestAnimationFrame(() => window.requestAnimationFrame(resetScroll));
    const timeoutOne = window.setTimeout(resetScroll, 60);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timeoutOne);
    };
  }, [pathname]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <WakeLockManager />
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

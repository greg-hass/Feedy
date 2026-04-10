"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/client";
import type { MeResponse } from "@/types/app";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export function WakeLockManager() {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponse>("/api/me"),
    staleTime: 30_000,
    retry: false,
  });
  const keepScreenAwake = me.data?.authenticated
    ? me.data.user.settings.keepScreenAwake
    : false;

  useEffect(() => {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!keepScreenAwake || !wakeLock) {
      void sentinelRef.current?.release().catch(() => undefined);
      sentinelRef.current = null;
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (sentinelRef.current && !sentinelRef.current.released) {
        return;
      }

      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        sentinelRef.current = null;
      }
    };

    const release = async () => {
      if (!sentinelRef.current) {
        return;
      }

      await sentinelRef.current.release().catch(() => undefined);
      sentinelRef.current = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else {
        void release();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void release();
    };
  }, [keepScreenAwake]);

  return null;
}

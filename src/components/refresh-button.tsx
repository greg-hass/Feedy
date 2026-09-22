"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/client";
import { calculateRefreshProgress } from "@/lib/refresh-progress";

export function useRefreshController(endpoint: string, invalidate: string) {
  const queryClient = useQueryClient();
  const lastSeenCompleted = useRef(0);
  const lastTimelineReloadAt = useRef(0);
  const [trackedBatchId, setTrackedBatchId] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<{
    totalFeeds: number;
    queued: number;
    skipped: number;
  } | null>(null);
  const refreshStatus = useQuery({
    queryKey: ["refresh-status", endpoint, trackedBatchId],
    queryFn: () =>
      api<{
        active: number;
        completed: number;
        failed: number;
        queued: number;
        running: number;
        succeeded: number;
        total: number;
      }>(`/api/refresh/status?batchId=${encodeURIComponent(trackedBatchId ?? "")}`),
    enabled: !!trackedBatchId,
    refetchInterval: (query) =>
      trackedBatchId && query.state.data?.active !== 0 ? 5000 : false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{
        batchId?: string;
        batchStartedAt?: string;
        queued?: number;
        skipped?: number;
        totalFeeds?: number;
      }>(endpoint, { method: "POST" }),
    onSuccess: async (data) => {
      lastSeenCompleted.current = 0;
      lastTimelineReloadAt.current = Date.now();
      setTrackedBatchId(data.batchId && (data.queued ?? 0) > 0 ? data.batchId : null);
      setBatchSummary(
        typeof data.totalFeeds === "number" && typeof data.queued === "number"
          ? {
              totalFeeds: data.totalFeeds,
              queued: data.queued,
              skipped: data.skipped ?? Math.max(0, data.totalFeeds - data.queued),
            }
          : null,
      );
      // Show current articles immediately, even while the feed jobs are queued.
      await queryClient.refetchQueries({ queryKey: [invalidate], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
      if ((data.queued ?? 0) === 0) {
        window.setTimeout(() => setBatchSummary(null), 1800);
      }
    },
    onError: () => {
      setTrackedBatchId(null);
      setBatchSummary(null);
    },
  });

  const batchIsComplete = !!trackedBatchId && refreshStatus.data?.active === 0;
  const completed = refreshStatus.data?.completed ?? 0;

  useEffect(() => {
    if (!trackedBatchId || completed <= lastSeenCompleted.current) return;
    const firstCompletion = lastSeenCompleted.current === 0;
    lastSeenCompleted.current = completed;

    // Reddit can keep a batch open for many minutes. Publish completed feeds
    // during the batch without reloading on every status poll or render.
    const now = Date.now();
    if (!batchIsComplete && !firstCompletion && now - lastTimelineReloadAt.current < 15_000) return;
    lastTimelineReloadAt.current = now;
    void queryClient.refetchQueries({ queryKey: [invalidate], type: "active" });
    void queryClient.refetchQueries({ queryKey: ["me"], type: "active" });
  }, [batchIsComplete, completed, invalidate, queryClient, trackedBatchId]);

  useEffect(() => {
    if (!batchIsComplete) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTrackedBatchId(null);
      setBatchSummary(null);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [batchIsComplete, invalidate, queryClient]);

  const phase: "idle" | "queuing" | "refreshing" | "done" = (() => {
    if (!trackedBatchId && !mutation.isPending && batchSummary) return "done";
    if (!trackedBatchId && !mutation.isPending) return "idle";
    if (mutation.isPending) return "queuing";
    const status = refreshStatus.data;
    if (status && status.active === 0) return "done";
    return "refreshing";
  })();

  const progress = calculateRefreshProgress({
    phase,
    status: refreshStatus.data ?? null,
  });

  return {
    active: mutation.isPending || !!trackedBatchId || !!batchSummary,
    phase,
    progress,
    summary: batchSummary,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    start: () => mutation.mutate(),
    status: refreshStatus.data,
  };
}

export type RefreshController = ReturnType<typeof useRefreshController>;

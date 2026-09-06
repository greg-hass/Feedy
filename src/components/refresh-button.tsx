"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/client";
import { calculateRefreshProgress } from "@/lib/refresh-progress";

export function useRefreshController(endpoint: string, invalidate: string) {
  const queryClient = useQueryClient();
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
      trackedBatchId && query.state.data?.active !== 0 ? 1500 : false,
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
      if ((data.queued ?? 0) === 0) {
        await queryClient.refetchQueries({ queryKey: [invalidate], type: "active" });
        window.setTimeout(() => setBatchSummary(null), 1800);
      }
    },
    onError: () => {
      setTrackedBatchId(null);
      setBatchSummary(null);
    },
  });

  const batchIsComplete = !!trackedBatchId && refreshStatus.data?.active === 0;

  useEffect(() => {
    if (!batchIsComplete) {
      return;
    }

    // Refresh loaded pages once after the batch settles, not on each poll/render.
    void queryClient.refetchQueries({ queryKey: [invalidate], type: "active" });
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
    start: () => mutation.mutate(),
    status: refreshStatus.data,
  };
}

export type RefreshController = ReturnType<typeof useRefreshController>;

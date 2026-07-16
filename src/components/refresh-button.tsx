"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { api } from "@/lib/client";
import { calculateRefreshProgress } from "@/lib/refresh-progress";

export function useRefreshController(endpoint: string, invalidate: string[]) {
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
    refetchInterval: trackedBatchId ? 1500 : false,
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
      await queryClient.refetchQueries({ queryKey: invalidate, type: "active" });
      if ((data.queued ?? 0) === 0) {
        window.setTimeout(() => setBatchSummary(null), 1800);
      }
    },
    onError: () => {
      setTrackedBatchId(null);
      setBatchSummary(null);
    },
  });

  useEffect(() => {
    if (!trackedBatchId) {
      return;
    }

    const status = refreshStatus.data;
    if (!status) {
      return;
    }

    void queryClient.refetchQueries({ queryKey: invalidate, type: "active" });

    if (status.active === 0) {
      const timeout = window.setTimeout(() => {
        setTrackedBatchId(null);
        setBatchSummary(null);
      }, 1500);

      return () => window.clearTimeout(timeout);
    }
  }, [invalidate, queryClient, refreshStatus.data, trackedBatchId]);

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

export function RefreshButton({
  controller,
  endpoint,
  invalidate,
  onStart,
}: {
  controller?: RefreshController;
  endpoint?: string;
  invalidate?: string[];
  onStart?: () => void;
}) {
  const fallbackController = useRefreshController(endpoint ?? "/api/refresh/all", invalidate ?? ["items"]);
  const refresh = controller || fallbackController;

  return (
    <>
      <IconButton
        variant={refresh.active ? "active" : "default"}
        onClick={() => {
          onStart?.();
          refresh.start();
        }}
        disabled={refresh.active}
        aria-label={refresh.active ? "Refreshing feeds" : "Refresh feeds"}
      >
        <RefreshCcw className={`size-4 ${refresh.active ? "animate-spin" : ""}`} />
      </IconButton>
      {refresh.active ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-50 px-5">
          <div data-flat-toast="true" className="mx-auto w-full max-w-md rounded-[24px] border border-[var(--accent)]/18 bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-strong)_100%)] px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.52)] ring-1 ring-[var(--text-primary)]/5 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--accent)]">
                  {refresh.phase === "queuing"
                    ? "Queueing refresh"
                    : refresh.phase === "done"
                      ? "Refresh complete"
                      : "Refreshing feeds"}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-primary)]/72">
                  {refresh.phase === "queuing" ? (
                    "Preparing your feeds for refresh..."
                  ) : refresh.phase === "done" ? (
                    <>
                      {refresh.summary?.queued === 0 ? "Refresh already queued" : "Refresh complete"}
                      {refresh.status?.failed ? ` · ${refresh.status.failed} failed` : ""}
                    </>
                  ) : refresh.status ? (
                    <>
                      {`${refresh.status.completed} of ${refresh.status.total} feeds done`}
                      {refresh.status.running > 0
                        ? ` · ${refresh.status.running} refreshing`
                        : ""}
                      {refresh.status.failed > 0
                        ? ` · ${refresh.status.failed} failed`
                        : ""}
                    </>
                  ) : (
                    "Pulling in the latest items from your subscriptions."
                  )}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--accent)]">
                {refresh.progress}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--text-primary)]/8">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_100%,white_28%)_100%)] transition-[width] duration-500 ease-out"
                style={{ width: `${refresh.progress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

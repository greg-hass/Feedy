type DurableRefreshBatch = {
  totalFeeds: number;
  queued: number;
  skipped: number;
  succeeded: number;
  failed: number;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type LegacyRefreshJob = {
  status: string;
};

export function summarizeDurableRefreshBatch(batch: DurableRefreshBatch) {
  const active = Math.max(batch.queued - batch.succeeded - batch.failed, 0);

  return {
    ok: true,
    total: batch.totalFeeds,
    queued: active,
    running: active,
    succeeded: batch.succeeded,
    failed: batch.failed,
    skipped: batch.skipped,
    completed: batch.succeeded + batch.failed + batch.skipped,
    active,
    status: batch.status,
    startedAt: batch.startedAt,
    finishedAt: batch.finishedAt,
  };
}

export function summarizeLegacyRefreshJobs(jobs: LegacyRefreshJob[]) {
  const total = jobs.length;
  const queued = jobs.filter((job) => job.status === "QUEUED").length;
  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const succeeded = jobs.filter((job) => job.status === "SUCCEEDED").length;
  const failed = jobs.filter((job) => job.status === "FAILED").length;

  return {
    ok: true,
    total,
    queued,
    running,
    succeeded,
    failed,
    completed: succeeded + failed,
    active: queued + running,
  };
}

type RefreshPhase = "idle" | "queuing" | "refreshing" | "done";

type RefreshProgressStatus = {
  completed: number;
  total: number;
} | null;

export function calculateRefreshProgress({
  phase,
  status,
}: {
  phase: RefreshPhase;
  status: RefreshProgressStatus;
}) {
  if (phase === "idle") return 0;
  if (phase === "queuing") return 5;
  if (phase === "done") return 100;
  if (!status) return 5;

  const total = Math.max(status.total, 1);
  return Math.min(Math.round((status.completed / total) * 100), 100);
}

// isReturnedRefreshJobNew was removed in favour of a simpler check:
// BullMQ 5.x returns undefined on jobId collision, so a truthy job
// always carries the submitted payload.

import { JobTrigger } from "@prisma/client";

export type QueueRefreshTrigger = "manual" | "auto" | "import";

export function jobTriggerToQueueTrigger(trigger: JobTrigger): QueueRefreshTrigger {
  if (trigger === JobTrigger.AUTO) return "auto";
  if (trigger === JobTrigger.IMPORT) return "import";
  return "manual";
}

export function queueTriggerToJobTrigger(trigger: QueueRefreshTrigger): JobTrigger {
  if (trigger === "auto") return JobTrigger.AUTO;
  if (trigger === "import") return JobTrigger.IMPORT;
  return JobTrigger.MANUAL;
}

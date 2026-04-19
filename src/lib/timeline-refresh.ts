export type TimelineRefreshDelta = {
  newCount: number;
  jumpTargetId: string | null;
};

export function computeTimelineRefreshDelta(
  beforeIds: string[],
  afterIds: string[],
): TimelineRefreshDelta {
  const beforeIdsSet = new Set(beforeIds);
  const newIds: string[] = [];

  for (const id of afterIds) {
    if (beforeIdsSet.has(id)) {
      break;
    }

    newIds.push(id);
  }

  return {
    newCount: newIds.length,
    jumpTargetId: newIds.at(-1) ?? null,
  };
}

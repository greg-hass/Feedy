export type TimelinePage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function buildTimelinePage<TItem extends { uniqueKey: string }>(
  records: TItem[],
  pageSize: number,
): TimelinePage<TItem> {
  const items = records.slice(0, pageSize);
  const hasMore = records.length > pageSize;

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.uniqueKey ?? null : null,
    hasMore,
  };
}

export function flattenTimelinePages<TItem>(
  pages: Array<{ items: TItem[] }> | undefined,
) {
  return pages?.flatMap((page) => page.items) ?? [];
}

export function shouldLoadNextTimelinePage({
  hasMore,
  isBottomVisible,
  isFetchingNextPage,
}: {
  hasMore: boolean;
  isBottomVisible: boolean;
  isFetchingNextPage: boolean;
}) {
  return hasMore && isBottomVisible && !isFetchingNextPage;
}

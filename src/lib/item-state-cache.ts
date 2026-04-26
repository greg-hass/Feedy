import type { QueryClient, QueryKey, InfiniteData } from "@tanstack/react-query";

import type { ItemRecord } from "@/types/app";

type ItemStatePatch = {
  read?: boolean;
  bookmarked?: boolean;
};

function applyPatch(item: ItemRecord, patch: ItemStatePatch) {
  return {
    ...item,
    read: patch.read ?? item.read,
    bookmarked: patch.bookmarked ?? item.bookmarked,
  };
}

function isSavedItemsQuery(queryKey: QueryKey) {
  return Array.isArray(queryKey) && queryKey[0] === "items" && queryKey[1] === "saved";
}

function isTimelineItemsQuery(queryKey: QueryKey) {
  return Array.isArray(queryKey) && queryKey[0] === "items" && queryKey[1] === "timeline";
}

function isInfiniteData(data: unknown): data is InfiniteData<{ items: ItemRecord[] }> {
  return (
    typeof data === "object" &&
    data !== null &&
    "pages" in data &&
    Array.isArray((data as { pages: unknown }).pages)
  );
}

export function updateItemStateCaches(
  queryClient: QueryClient,
  itemId: string,
  patch: ItemStatePatch,
  options?: {
    skipTimelineReadPatch?: boolean;
  },
) {
  for (const [queryKey, current] of queryClient.getQueriesData({
    queryKey: ["items"],
  })) {
    if (!current) {
      continue;
    }

    if (options?.skipTimelineReadPatch && typeof patch.read === "boolean" && isTimelineItemsQuery(queryKey)) {
      continue;
    }

    let next;

    if (isInfiniteData(current)) {
      // Timeline uses useInfiniteQuery — data is InfiniteData<{ items: ItemRecord[] }>
      next = {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items
            .map((entry) => (entry.id === itemId ? applyPatch(entry, patch) : entry))
            .filter((entry) => !(patch.bookmarked === false && isSavedItemsQuery(queryKey) && entry.id === itemId)),
        })),
      };
    } else if (Array.isArray(current)) {
      // Saved, feed, and folder queries return flat ItemRecord[]
      next = current
        .map((entry) => (entry.id === itemId ? applyPatch(entry, patch) : entry))
        .filter((entry) => !(patch.bookmarked === false && isSavedItemsQuery(queryKey) && entry.id === itemId));
    } else {
      continue;
    }

    queryClient.setQueryData(queryKey, next);
  }
}

export function updateReaderStateCache(
  queryClient: QueryClient,
  itemId: string,
  patch: ItemStatePatch,
) {
  queryClient.setQueryData<ItemRecord>(["reader", itemId], (current) =>
    current ? applyPatch(current, patch) : current,
  );
}

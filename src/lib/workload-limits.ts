export const MAX_OPML_IMPORT_BYTES = 1024 * 1024;
export const MAX_OPML_IMPORT_FEEDS = 500;
export const MAX_JSON_EXPORT_ITEMS = 25_000;
export const MAX_MANUAL_REFRESH_FEEDS = 500;
export const MAX_FEED_ITEMS_PER_REFRESH = 1_000;
export const REFRESH_ENQUEUE_BATCH_SIZE = 10;
export const REMOTE_PROBE_BATCH_SIZE = 5;

export function assertWithinLimit(count: number, maximum: number, label: string) {
  if (count > maximum) {
    throw new Error(`${label} exceeds the maximum allowed count of ${maximum}.`);
  }
}

export async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Batch size must be a positive integer.");
  }

  const results: R[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    results.push(...await Promise.all(items.slice(start, start + batchSize).map(mapper)));
  }

  return results;
}

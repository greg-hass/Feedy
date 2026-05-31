import { FeedSourceType, Prisma, JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndParseFeedConditionally, validateFeedUrl } from "@/lib/feed/parse";
import { extractReadableContent } from "@/lib/feed/reader";
import { logPerf } from "@/lib/perf";
import { enqueueIconFetch } from "@/lib/queue";
import { queueSingleFeedRefresh } from "@/lib/refresh-orchestration";
import type { FeedValidationResult, ParsedFeedItem } from "@/lib/feed/types";
import { evaluateFeedMuteRules, normalizeFeedMuteRules } from "@/lib/feed/mute-rules";
import { assertOwnedFolder } from "@/lib/ownership";
import {
  assertWithinLimit,
  MAX_FEED_ITEMS_PER_REFRESH,
} from "@/lib/workload-limits";

const REFRESH_UPSERT_BATCH_SIZE = 50;

async function createValidatedFeedForUser(
  userId: string,
  input: {
    sourceUrl: string;
    folderId?: string | null;
    label?: string | null;
    refreshIntervalMinutes?: number | null;
  },
  validated: FeedValidationResult,
  options?: {
    queueInitialRefresh?: boolean;
    queueInitialIconFetch?: boolean;
  },
) {
  if (input.folderId) {
    await assertOwnedFolder(prisma, userId, input.folderId);
  }

  const existingFeed = await prisma.feed.findFirst({
    where: {
      userId,
      OR: [
        { sourceUrl: validated.feedUrl },
        ...(validated.siteUrl ? [{ siteUrl: validated.siteUrl }] : []),
      ],
    },
    select: {
      id: true,
      title: true,
      label: true,
      sourceUrl: true,
      siteUrl: true,
    },
  });

  if (existingFeed) {
    if (validated.siteUrl && existingFeed.siteUrl === validated.siteUrl && shouldRepairLegacySourceUrl(existingFeed.sourceUrl, validated.feedUrl)) {
      await prisma.feed.update({
        where: { id: existingFeed.id },
        data: {
          sourceUrl: validated.feedUrl,
          title: validated.title,
          description: validated.description,
          iconHintUrl: validated.iconUrl,
          sourceType: validated.sourceType,
        },
      });
    }
    throw new Error(`Feed already exists in your library as ${existingFeed.label || existingFeed.title}.`);
  }

  let feed;
  try {
    feed = await prisma.feed.create({
      data: {
        userId,
        folderId: input.folderId || null,
        title: validated.title,
        label: input.label || null,
        description: validated.description,
        sourceUrl: validated.feedUrl,
        siteUrl: validated.siteUrl,
        iconHintUrl: validated.iconUrl,
        sourceType: validated.sourceType,
        refreshIntervalMinutes: input.refreshIntervalMinutes || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Feed already exists in your library.");
    }
    throw error;
  }

  if (options?.queueInitialRefresh !== false) {
    await queueSingleFeedRefresh(userId, feed.id, JobTrigger.MANUAL);
  }

  if (options?.queueInitialIconFetch !== false) {
    await enqueueIconFetch({ feedId: feed.id });
  }

  return feed;
}

function shouldRepairLegacySourceUrl(currentSourceUrl: string, validatedFeedUrl: string) {
  if (currentSourceUrl === validatedFeedUrl) {
    return false;
  }

  return (
    currentSourceUrl.includes("pubsubhubbub.appspot.com") ||
    currentSourceUrl.includes("feedburner.com") ||
    currentSourceUrl.includes("feeds.feedproxy.google.com")
  );
}

export async function createFeedForUser(
  userId: string,
  input: {
    sourceUrl: string;
    folderId?: string | null;
    label?: string | null;
    refreshIntervalMinutes?: number | null;
  },
) {
  const validated = await validateFeedUrl(input.sourceUrl);
  return createValidatedFeedForUser(userId, input, validated);
}

export { createValidatedFeedForUser };

export async function upsertFeedItemsInBatches(
  client: Pick<typeof prisma, "$transaction">,
  items: Array<Parameters<typeof prisma.item.upsert>[0]>,
) {
  const upserts: Array<{ id: string }> = [];

  for (let index = 0; index < items.length; index += REFRESH_UPSERT_BATCH_SIZE) {
    const batch = items.slice(index, index + REFRESH_UPSERT_BATCH_SIZE);
    const batchResults = await client.$transaction(
      batch.map((operation) => prisma.item.upsert(operation)),
    );
    upserts.push(...batchResults);
  }

  return upserts;
}

function evaluateRefreshItems(
  muteRules: ReturnType<typeof normalizeFeedMuteRules>,
  items: ParsedFeedItem[],
) {
  return items.map((item) => ({
    item,
    evaluation: evaluateFeedMuteRules(muteRules, item),
  }));
}

async function finalizeNotModifiedRefresh(input: {
  feed: { id: string };
  refreshJob: { id: string; metadata: Prisma.JsonValue | null } | null;
  logId: string;
  trigger: JobTrigger;
  freshAt: Date;
  result: { etag: string | null; lastModified: string | null };
}) {
  await prisma.$transaction(async (tx) => {
    await tx.feed.update({
      where: { id: input.feed.id },
      data: {
        etag: input.result.etag,
        lastModified: input.result.lastModified,
        lastRefreshedAt: input.freshAt,
        lastSuccessfulRefreshAt: input.freshAt,
        lastError: null,
        healthStatus: "HEALTHY",
      },
    });

    if (input.refreshJob) {
      await tx.refreshJob.update({
        where: { id: input.refreshJob.id },
        data: {
          status: JobStatus.SUCCEEDED,
          completedAt: input.freshAt,
          metadata: {
            ...(input.refreshJob.metadata && typeof input.refreshJob.metadata === "object" ? input.refreshJob.metadata : {}),
            trigger: input.trigger,
            processedItems: 0,
            newItems: 0,
            notModified: true,
          },
        },
      });
    }

    await tx.refreshLog.update({
      where: { id: input.logId },
      data: {
        status: JobStatus.SUCCEEDED,
        finishedAt: input.freshAt,
        newItems: 0,
        metadata: { trigger: input.trigger, notModified: true },
      },
    });
  });
}

async function finalizeSuccessfulRefresh(input: {
  feed: { id: string; userId: string };
  refreshJob: { id: string; metadata: Prisma.JsonValue | null } | null;
  logId: string;
  trigger: JobTrigger;
  freshAt: Date;
  result: {
      feed: {
        title: string;
        description: string | null;
        siteUrl: string | null;
        iconUrl: string | null;
        sourceType: FeedSourceType;
      };
    etag: string | null;
    lastModified: string | null;
    items: ParsedFeedItem[];
  };
  upserts: Array<{ id: string }>;
  newItemsCount: number;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.feed.update({
      where: { id: input.feed.id },
      data: {
        title: input.result.feed.title,
        description: input.result.feed.description,
        siteUrl: input.result.feed.siteUrl,
        iconHintUrl: input.result.feed.iconUrl,
        sourceType: input.result.feed.sourceType,
        etag: input.result.etag,
        lastModified: input.result.lastModified,
        lastRefreshedAt: input.freshAt,
        lastSuccessfulRefreshAt: input.freshAt,
        lastError: null,
        healthStatus: "HEALTHY",
      },
    });

    if (input.refreshJob) {
      await tx.refreshJob.update({
        where: { id: input.refreshJob.id },
        data: {
          status: JobStatus.SUCCEEDED,
          completedAt: input.freshAt,
          metadata: {
            ...(input.refreshJob.metadata && typeof input.refreshJob.metadata === "object" ? input.refreshJob.metadata : {}),
            trigger: input.trigger,
            processedItems: input.upserts.length,
            newItems: input.newItemsCount,
          },
        },
      });
    }

    await tx.refreshLog.update({
      where: { id: input.logId },
      data: {
        status: JobStatus.SUCCEEDED,
        finishedAt: input.freshAt,
        newItems: input.newItemsCount,
        metadata: { trigger: input.trigger },
      },
    });
  });
}

async function recordFailedRefresh(input: {
  feedId: string;
  refreshJob: { id: string } | null;
  logId: string;
  message: string;
}) {
  const failureAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.feed.update({
      where: { id: input.feedId },
      data: {
        lastFailureAt: failureAt,
        lastError: input.message,
        healthStatus: "ERROR",
      },
    });

    await tx.refreshLog.update({
      where: { id: input.logId },
      data: {
        status: JobStatus.FAILED,
        finishedAt: failureAt,
        errorMessage: input.message,
      },
    });

    if (input.refreshJob) {
      await tx.refreshJob.update({
        where: { id: input.refreshJob.id },
        data: {
          status: JobStatus.FAILED,
          completedAt: failureAt,
          errorMessage: input.message,
        },
      });
    }
  });
}

export async function refreshFeed(feedId: string, trigger: JobTrigger, refreshJobId?: string) {
  const refreshStartedAt = performance.now();
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) {
    throw new Error("Feed not found");
  }

  const refreshJob = refreshJobId
    ? await prisma.refreshJob.findUnique({ where: { id: refreshJobId } })
    : await prisma.refreshJob.findFirst({
        where: {
          feedId,
          status: JobStatus.QUEUED,
        },
        orderBy: {
          requestedAt: "desc",
        },
      });

  if (refreshJob) {
    await prisma.refreshJob.update({
      where: { id: refreshJob.id },
      data: {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  const log = await prisma.refreshLog.create({
    data: {
      feedId,
      status: JobStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  try {
    const muteRules = normalizeFeedMuteRules(feed.muteRules);
    const parseStartedAt = performance.now();
    const result = await fetchAndParseFeedConditionally(feed.sourceUrl, feed.id, {
      etag: feed.etag,
      lastModified: feed.lastModified,
    });
    const parseDurationMs = performance.now() - parseStartedAt;
    const freshAt = new Date();

    if (result.notModified) {
      const finalizeStartedAt = performance.now();

      await finalizeNotModifiedRefresh({
        feed,
        refreshJob: refreshJob
          ? { id: refreshJob.id, metadata: refreshJob.metadata }
          : null,
        logId: log.id,
        trigger,
        freshAt,
        result,
      });

      logPerf(
        "worker.refreshFeed",
        performance.now() - refreshStartedAt,
        {
          feedId,
          trigger,
          itemCount: 0,
          newItems: 0,
          notModified: true,
          parseMs: Math.round(parseDurationMs),
          finalizeMs: Math.round(performance.now() - finalizeStartedAt),
        },
        false,
      );

      return 0;
    }
    assertWithinLimit(result.items.length, MAX_FEED_ITEMS_PER_REFRESH, "Feed items");

    const dedupeLookupStartedAt = performance.now();
    const existingKeys = new Set(
      (
        await prisma.item.findMany({
          where: {
            uniqueKey: {
              in: result.items.map((item) => item.uniqueKey),
            },
          },
          select: { uniqueKey: true },
        })
      ).map((item) => item.uniqueKey),
    );
    const dedupeLookupDurationMs = performance.now() - dedupeLookupStartedAt;
    const upsertStartedAt = performance.now();
    const evaluatedItems = evaluateRefreshItems(muteRules, result.items);

    const operations = evaluatedItems.map(({ item, evaluation }) => ({
      where: { uniqueKey: item.uniqueKey },
      update: {
        title: item.title,
        summary: item.summary,
        contentHtml: item.contentHtml,
        author: item.author,
        canonicalUrl: item.canonicalUrl,
        commentsUrl: item.commentsUrl,
        mediaUrl: item.mediaUrl,
        youtubeVideoId: item.youtubeVideoId,
        youtubeIsShort: item.youtubeIsShort ?? false,
        youtubeShortCheckedAt: item.youtubeVideoId ? null : undefined,
        redditPermalink: item.redditPermalink,
        mutedByRule: evaluation.muteFromTimeline,
        publishedAt: item.publishedAt ?? undefined,
        fetchedAt: new Date(),
      },
      create: {
        feedId: feed.id,
        uniqueKey: item.uniqueKey,
        guid: item.guid,
        externalId: item.externalId,
        title: item.title,
        summary: item.summary,
        contentHtml: item.contentHtml,
        author: item.author,
        canonicalUrl: item.canonicalUrl,
        commentsUrl: item.commentsUrl,
        mediaUrl: item.mediaUrl,
        youtubeVideoId: item.youtubeVideoId,
        youtubeIsShort: item.youtubeIsShort ?? false,
        youtubeShortCheckedAt: item.youtubeVideoId ? null : undefined,
        redditPermalink: item.redditPermalink,
        mutedByRule: evaluation.muteFromTimeline,
        publishedAt: item.publishedAt ?? undefined,
      },
    }) satisfies Parameters<typeof prisma.item.upsert>[0]);

    const upserts = await upsertFeedItemsInBatches(prisma, operations);
    const autoMarkReadIds = upserts
      .filter((upsert, index) => evaluatedItems[index]?.evaluation.autoMarkRead)
      .map((upsert) => ({ userId: feed.userId, itemId: upsert.id }));

    if (autoMarkReadIds.length > 0) {
      await prisma.readState.createMany({
        data: autoMarkReadIds,
        skipDuplicates: true,
      });
    }
    const upsertDurationMs = performance.now() - upsertStartedAt;
    const newItemsCount = result.items.filter((item) => !existingKeys.has(item.uniqueKey)).length;

    const finalizeStartedAt = performance.now();
    await finalizeSuccessfulRefresh({
      feed,
      refreshJob: refreshJob
        ? { id: refreshJob.id, metadata: refreshJob.metadata }
        : null,
      logId: log.id,
      trigger,
      freshAt,
      result,
      upserts,
      newItemsCount,
    });
    const finalizeDurationMs = performance.now() - finalizeStartedAt;

    await enqueueIconFetch({ feedId: feed.id }).catch(() => null);

    logPerf(
      "worker.refreshFeed",
      performance.now() - refreshStartedAt,
      {
        feedId,
        trigger,
        itemCount: result.items.length,
        newItems: newItemsCount,
        parseMs: Math.round(parseDurationMs),
        dedupeMs: Math.round(dedupeLookupDurationMs),
        upsertMs: Math.round(upsertDurationMs),
        finalizeMs: Math.round(finalizeDurationMs),
      },
      false,
    );

    return newItemsCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error";
    await recordFailedRefresh({
      feedId: feed.id,
      refreshJob: refreshJob ? { id: refreshJob.id } : null,
      logId: log.id,
      message,
    });
    logPerf(
      "worker.refreshFeed",
      performance.now() - refreshStartedAt,
      {
        feedId,
        trigger,
        failed: true,
        error: message,
      },
      true,
    );
    throw error;
  }
}

export async function ensureReaderContent(itemId: string) {
  const startedAt = performance.now();
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      canonicalUrl: true,
      readabilityHtml: true,
      summary: true,
    },
  });
  if (!item?.canonicalUrl) {
    return item;
  }

  const updated = await ensureReaderContentForLoadedItem(item, startedAt);
  return updated ?? item;
}

export async function ensureReaderContentForLoadedItem(
  item: {
    id: string;
    canonicalUrl: string | null;
    readabilityHtml: string | null;
    summary: string | null;
  },
  startedAt = performance.now(),
) {
  if (!item.canonicalUrl || item.readabilityHtml) {
    return null;
  }

  const readable = await extractReadableContent(item.canonicalUrl).catch(() => null);
  if (!readable) {
    return null;
  }

  const updated = await prisma.item.update({
    where: { id: item.id },
    data: {
      readabilityHtml: readable.content,
      summary: item.summary || readable.excerpt,
    },
  });

  logPerf(
    "worker.readerExtract",
    performance.now() - startedAt,
    { itemId: item.id, cached: false },
    false,
  );

  return {
    readabilityHtml: updated.readabilityHtml,
    summary: updated.summary,
  };
}

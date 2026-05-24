import { Prisma, JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndParseFeedConditionally, validateFeedUrl } from "@/lib/feed/parse";
import { extractReadableContent } from "@/lib/feed/reader";
import { logPerf } from "@/lib/perf";
import { enqueueFeedRefresh, enqueueIconFetch } from "@/lib/queue";
import type { FeedValidationResult } from "@/lib/feed/types";
import { evaluateFeedMuteRules, normalizeFeedMuteRules } from "@/lib/feed/mute-rules";
import { probeYouTubeShort } from "@/lib/feed/youtube";
import { assertOwnedFolder } from "@/lib/ownership";

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
    const refreshJob = await prisma.refreshJob.create({
      data: {
        userId,
        feedId: feed.id,
        trigger: JobTrigger.MANUAL,
        status: JobStatus.QUEUED,
      },
    });
    const refresh = await enqueueFeedRefresh({
      feedId: feed.id,
      trigger: "manual",
      refreshJobId: refreshJob.id,
    });
    if (!refresh.enqueued) {
      await prisma.refreshJob.delete({ where: { id: refreshJob.id } }).catch(() => null);
    }
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

      await prisma.feed.update({
        where: { id: feed.id },
        data: {
          etag: result.etag,
          lastModified: result.lastModified,
          lastRefreshedAt: freshAt,
          lastSuccessfulRefreshAt: freshAt,
          lastError: null,
          healthStatus: "HEALTHY",
        },
      });

      if (refreshJob) {
        await prisma.refreshJob.update({
          where: { id: refreshJob.id },
          data: {
            status: JobStatus.SUCCEEDED,
            completedAt: freshAt,
            metadata: {
              ...(refreshJob.metadata && typeof refreshJob.metadata === "object" ? refreshJob.metadata : {}),
              trigger,
              processedItems: 0,
              newItems: 0,
              notModified: true,
            },
          },
        });
      }

      await prisma.refreshLog.update({
        where: { id: log.id },
        data: {
          status: JobStatus.SUCCEEDED,
          finishedAt: freshAt,
          newItems: 0,
          metadata: { trigger, notModified: true },
        },
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
    const evaluatedItems = result.items.map((item) => {
      const evaluation = evaluateFeedMuteRules(muteRules, item);
      return {
        item,
        evaluation,
      };
    });

    const youtubeShortFlags = new Map<string, boolean>();
    await Promise.all(
      evaluatedItems.map(async ({ item }) => {
        if (!item.youtubeVideoId) {
          return;
        }

        youtubeShortFlags.set(item.youtubeVideoId, await probeYouTubeShort(item.youtubeVideoId));
      }),
    );

    const operations = evaluatedItems.map(({ item, evaluation }) =>
      prisma.item.upsert({
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
          youtubeIsShort: youtubeShortFlags.get(item.youtubeVideoId || "") ?? false,
          youtubeShortCheckedAt: item.youtubeVideoId ? new Date() : null,
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
          youtubeIsShort: youtubeShortFlags.get(item.youtubeVideoId || "") ?? false,
          youtubeShortCheckedAt: item.youtubeVideoId ? new Date() : null,
          redditPermalink: item.redditPermalink,
          mutedByRule: evaluation.muteFromTimeline,
          publishedAt: item.publishedAt ?? undefined,
        },
      }),
    );

    const upserts = await prisma.$transaction(operations);
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
    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        title: result.feed.title,
        description: result.feed.description,
        siteUrl: result.feed.siteUrl,
        iconHintUrl: result.feed.iconUrl,
        sourceType: result.feed.sourceType,
        etag: result.etag,
        lastModified: result.lastModified,
        lastRefreshedAt: freshAt,
        lastSuccessfulRefreshAt: freshAt,
        lastError: null,
        healthStatus: "HEALTHY",
      },
    });

    if (refreshJob) {
      await prisma.refreshJob.update({
        where: { id: refreshJob.id },
        data: {
          status: JobStatus.SUCCEEDED,
          completedAt: freshAt,
          metadata: {
            ...(refreshJob.metadata && typeof refreshJob.metadata === "object" ? refreshJob.metadata : {}),
            trigger,
            processedItems: upserts.length,
            newItems: newItemsCount,
          },
        },
      });
    }

    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: JobStatus.SUCCEEDED,
        finishedAt: freshAt,
        newItems: newItemsCount,
        metadata: { trigger },
      },
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
    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        lastFailureAt: new Date(),
        lastError: message,
        healthStatus: "ERROR",
      },
    });
    await prisma.refreshLog.update({
      where: { id: log.id },
      data: {
        status: JobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    if (refreshJob) {
      await prisma.refreshJob.update({
        where: { id: refreshJob.id },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });
    }
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
  const item = await prisma.item.findUnique({ where: { id: itemId } });
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

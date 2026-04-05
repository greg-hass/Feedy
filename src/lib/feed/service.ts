import { JobStatus, JobTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchAndParseFeed, validateFeedUrl } from "@/lib/feed/parse";
import { extractReadableContent } from "@/lib/feed/reader";
import { enqueueFeedRefresh, enqueueIconFetch } from "@/lib/queue";

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
  const feed = await prisma.feed.create({
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

  await prisma.refreshJob.create({
    data: {
      userId,
      feedId: feed.id,
      trigger: JobTrigger.MANUAL,
      status: JobStatus.QUEUED,
    },
  });

  await enqueueFeedRefresh({ feedId: feed.id, trigger: "manual" });
  await enqueueIconFetch({ feedId: feed.id });

  return feed;
}

export async function refreshFeed(feedId: string, trigger: JobTrigger) {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) {
    throw new Error("Feed not found");
  }

  const refreshJob = await prisma.refreshJob.findFirst({
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
    const result = await fetchAndParseFeed(feed.sourceUrl, feed.id);
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
    const operations = result.items.map((item) =>
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
          redditPermalink: item.redditPermalink,
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
          redditPermalink: item.redditPermalink,
          publishedAt: item.publishedAt ?? undefined,
        },
      }),
    );

    const upserts = await prisma.$transaction(operations);
    const newItemsCount = result.items.filter((item) => !existingKeys.has(item.uniqueKey)).length;
    const freshAt = new Date();

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
          metadata: { trigger, processedItems: upserts.length, newItems: newItemsCount },
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
    throw error;
  }
}

export async function ensureReaderContent(itemId: string) {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item?.canonicalUrl) {
    return item;
  }

  if (item.readabilityHtml) {
    return item;
  }

  const readable = await extractReadableContent(item.canonicalUrl).catch(() => null);
  if (!readable) {
    return item;
  }

  return prisma.item.update({
    where: { id: item.id },
    data: {
      readabilityHtml: readable.content,
      summary: item.summary || readable.excerpt,
    },
  });
}

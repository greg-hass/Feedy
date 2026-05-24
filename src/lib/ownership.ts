import { prisma } from "@/lib/db";

type OwnershipClient = Pick<typeof prisma, "feed" | "folder" | "item">;

export async function assertOwnedFeed(client: OwnershipClient, userId: string, feedId: string) {
  const feed = await client.feed.findFirst({
    where: { id: feedId, userId },
    select: { id: true },
  });

  if (!feed) {
    throw new Error("Feed not found");
  }

  return feed;
}

export async function assertOwnedFolder(client: OwnershipClient, userId: string, folderId: string) {
  const folder = await client.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });

  if (!folder) {
    throw new Error("Folder not found");
  }

  return folder;
}

export async function assertOwnedItem(client: OwnershipClient, userId: string, itemId: string) {
  const item = await client.item.findFirst({
    where: {
      id: itemId,
      feed: { userId },
    },
    select: { id: true },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  return item;
}

import { prisma } from "@/lib/db";

type MarkReadClient = Pick<typeof prisma, "readState" | "$transaction">;

export async function markItemsRead(
	client: MarkReadClient,
	userId: string,
	itemIds: string[],
) {
  if (itemIds.length === 0) {
    return 0;
  }

  const now = new Date();
  const existing =
    "findMany" in client.readState
      ? await client.readState.findMany({
          where: {
            userId,
            itemId: { in: itemIds },
          },
          select: { itemId: true },
        })
      : [];

  const existingIds = new Set(existing.map((row) => row.itemId));
  const newItemIds = itemIds.filter((itemId) => !existingIds.has(itemId));

  await client.$transaction([
    client.readState.createMany({
      data: newItemIds.map((itemId) => ({
        userId,
        itemId,
        lastReadAt: now,
      })),
      skipDuplicates: true,
    }),
    client.readState.updateMany({
      where: {
        userId,
        itemId: {
          in: [...existingIds],
        },
      },
      data: {
        lastReadAt: now,
      },
    }),
  ]);

  return newItemIds.length;
}

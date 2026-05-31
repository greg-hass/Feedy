import { prisma } from "@/lib/db";

type MarkReadClient = Pick<typeof prisma, "readState" | "$transaction">;

export async function markItemsRead(client: MarkReadClient, userId: string, itemIds: string[]) {
  if (itemIds.length === 0) {
    return;
  }

  const now = new Date();
  await client.$transaction([
    client.readState.createMany({
      data: itemIds.map((itemId) => ({
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
          in: itemIds,
        },
      },
      data: {
        lastReadAt: now,
      },
    }),
  ]);
}

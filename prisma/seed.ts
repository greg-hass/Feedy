import { PrismaClient } from "@prisma/client";

import { syncSingleUserFromEnv } from "@/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const user = await syncSingleUserFromEnv(prisma);

  console.log(`Seeded user ${user.username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";

import { repairSingleUserDatabase } from "@/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const user = await repairSingleUserDatabase(prisma);

  console.log(`Repaired single-user database for ${user.username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { hashSync } from "bcryptjs";

import { PrismaClient, ThemePreference } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.APP_USERNAME ?? "admin";
  const password = process.env.APP_PASSWORD ?? "change-me";
  const passwordHash = hashSync(password, 12);

  const existing = await prisma.user.findFirst({
    include: { settings: true },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          username,
          passwordHash,
          settings: existing.settings
            ? {
                update: {},
              }
            : {
                create: {
                  theme: ThemePreference.SYSTEM,
                },
              },
        },
      })
    : await prisma.user.create({
        data: {
          username,
          passwordHash,
          settings: {
            create: {
              theme: ThemePreference.SYSTEM,
            },
          },
        },
      });

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

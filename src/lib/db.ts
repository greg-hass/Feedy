import { PrismaClient } from "@prisma/client";

declare global {
  var __feedyPrisma: PrismaClient | undefined;
}

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/feedy?schema=public";

export const prisma =
  global.__feedyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__feedyPrisma = prisma;
}

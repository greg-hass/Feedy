import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireApiUser() {
  const session = await getSession();
  if (!session?.userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      settings: true,
    },
  });
}

export async function assertApiUser() {
  const user = await requireApiUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export async function parseJson<T>(request: Request, schema: z.ZodSchema<T>) {
  const json = await request.json();
  return schema.parse(json);
}

export async function parseQuery<T>(
  input: URLSearchParams,
  schema: z.ZodSchema<T>,
) {
  return schema.parse(Object.fromEntries(input.entries()));
}

export async function assertServerUser() {
  return requireUser();
}

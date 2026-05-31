import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export class ApiAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function isApiAuthError(error: unknown): error is ApiAuthError {
  return error instanceof ApiAuthError;
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiErrorFrom(error: unknown, fallbackMessage: string, status = 400) {
  if (isApiAuthError(error)) {
    return apiError(error.message, 401);
  }

  return apiError(error instanceof Error ? error.message : fallbackMessage, status);
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
    throw new ApiAuthError();
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
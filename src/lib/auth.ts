import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AccentPreference, ThemePreference } from "@prisma/client";

const SESSION_COOKIE = "feedy_session";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

type SessionPayload = {
  userId: string;
  username: string;
};

export async function ensureSingleUser() {
  const existing = await prisma.user.findFirst({
    include: {
      settings: true,
    },
  });
  const passwordHash = await hash(env.APP_PASSWORD, 12);

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        username: env.APP_USERNAME,
        passwordHash,
        settings: existing.settings
          ? {
              update: {
                refreshIntervalMinutes:
                  existing.settings.refreshIntervalMinutes || env.REFRESH_DEFAULT_INTERVAL_MINUTES,
                itemRetentionDays: existing.settings.itemRetentionDays || 90,
              },
            }
          : {
              create: {
                theme: ThemePreference.SYSTEM,
                accentColor: AccentPreference.EMERALD,
                itemRetentionDays: 90,
                refreshIntervalMinutes: env.REFRESH_DEFAULT_INTERVAL_MINUTES,
              },
            },
      },
      include: {
        settings: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      username: env.APP_USERNAME,
      passwordHash,
      settings: {
        create: {
          theme: ThemePreference.SYSTEM,
          accentColor: AccentPreference.EMERALD,
          itemRetentionDays: 90,
          refreshIntervalMinutes: env.REFRESH_DEFAULT_INTERVAL_MINUTES,
        },
      },
    },
    include: {
      settings: true,
    },
  });
}

async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function createSession(userId: string, username: string) {
  const token = await signSession({ userId, username });
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireUser() {
  await ensureSingleUser();
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  });

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function authenticate(username: string, password: string) {
  const user = await ensureSingleUser();
  if (user.username !== username) {
    return null;
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  await createSession(user.id, user.username);
  return user;
}

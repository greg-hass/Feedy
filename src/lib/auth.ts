import { compare, hash } from "bcryptjs";
import type { Prisma, User, Settings } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AccentPreference, ThemePreference } from "@prisma/client";

// Stable advisory lock id, derived from hashing "feedy-bootstrap" (md5)
// so it won't collide with other projects that might pick 1807239607.
const BOOTSTRAP_LOCK_KEY = 516339264;

const SESSION_COOKIE = "feedy_session";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

type SessionPayload = {
	userId: string;
	username: string;
};

const sessionPayloadSchema = z.object({
	userId: z.string().min(1),
	username: z.string().min(1),
});

export function validateSessionPayload(payload: unknown) {
	const parsed = sessionPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
}

type SingleUserClient = typeof prisma;

type UserWithSettings = Pick<User, "id" | "username" | "createdAt"> & {
	settings: Settings | null;
};

type SingleUserTx = Prisma.TransactionClient;

async function withSingleUserLock<T>(
	client: SingleUserClient,
	task: (tx: SingleUserTx) => Promise<T>,
) {
	return client.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;
		return task(tx);
	});
}

function buildSingleUserSettingsData() {
	return {
		theme: ThemePreference.SYSTEM,
		accentColor: AccentPreference.EMERALD,
		itemRetentionDays: 90,
		hideYouTubeShorts: false,
		refreshIntervalMinutes: env.REFRESH_DEFAULT_INTERVAL_MINUTES,
	};
}

function buildExistingSettingsData(existingSettings: Settings | null) {
	return existingSettings
		? {
				update: {
					refreshIntervalMinutes:
						existingSettings.refreshIntervalMinutes ||
						env.REFRESH_DEFAULT_INTERVAL_MINUTES,
					itemRetentionDays: existingSettings.itemRetentionDays || 90,
					hideYouTubeShorts: existingSettings.hideYouTubeShorts ?? false,
				},
			}
		: {
				create: buildSingleUserSettingsData(),
			};
}

async function writeSingleUserFromEnv(
	tx: SingleUserTx,
	existingUser?: UserWithSettings,
) {
	const passwordHash = await hash(env.APP_PASSWORD, 12);

	if (existingUser) {
		return tx.user.update({
			where: { id: existingUser.id },
			data: {
				username: env.APP_USERNAME,
				passwordHash,
				settings: buildExistingSettingsData(existingUser.settings),
			},
			include: {
				settings: true,
			},
		});
	}

	return tx.user.create({
		data: {
			username: env.APP_USERNAME,
			passwordHash,
			settings: {
				create: buildSingleUserSettingsData(),
			},
		},
		include: {
			settings: true,
		},
	});
}

export async function syncSingleUserFromEnv(client: SingleUserClient = prisma) {
	return withSingleUserLock(client, async (tx) => {
		const userCount = await tx.user.count();
		if (userCount > 1) {
			throw new Error(
				"Feedy is configured for single-user mode, but multiple user records exist.",
			);
		}

		const existing = await tx.user.findFirst({
			orderBy: { createdAt: "asc" },
			include: {
				settings: true,
			},
		});

		return writeSingleUserFromEnv(tx, existing ?? undefined);
	});
}

export async function repairSingleUserDatabase(
	client: SingleUserClient = prisma,
) {
	return withSingleUserLock(client, async (tx) => {
		const users = await tx.user.findMany({
			orderBy: { createdAt: "asc" },
			include: {
				settings: true,
			},
		});

		if (users.length === 0) {
			return writeSingleUserFromEnv(tx);
		}

		const [primaryUser, ...extraUsers] = users;
		if (extraUsers.length > 0) {
			await tx.user.deleteMany({
				where: {
					id: { in: extraUsers.map((user) => user.id) },
				},
			});
		}

		return writeSingleUserFromEnv(tx, primaryUser);
	});
}

export async function loadUserBySessionId(
	client: SingleUserClient,
	userId: string,
) {
	return client.user.findUnique({
		where: { id: userId },
		include: { settings: true },
	});
}

export async function loadPrimaryUser(client: SingleUserClient = prisma) {
	return client.user.findFirst({
		orderBy: { createdAt: "asc" },
		include: { settings: true },
	});
}

export async function loadUserForAuthentication(
	client: SingleUserClient = prisma,
) {
	return client.user.findFirst({
		orderBy: { createdAt: "asc" },
		include: { settings: true },
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
		return validateSessionPayload(payload);
	} catch {
		return null;
	}
}

export async function requireUser() {
	const session = await getSession();
	if (!session?.userId) {
		redirect("/login");
	}

	const user = await loadUserBySessionId(prisma, session.userId);

	if (!user) {
		redirect("/login");
	}

	return user;
}

export async function authenticate(
	username: string,
	password: string,
	client: SingleUserClient = prisma,
	createSessionFn: typeof createSession = createSession,
) {
	const normalizedUsername = username.trim().toLowerCase();
	const user = await client.user.findFirst({
		where: {
			username: {
				equals: normalizedUsername,
				mode: "insensitive",
			},
		},
		include: { settings: true },
	});
	if (!user) {
		return null;
	}

	const valid = await compare(password, user.passwordHash);
	if (!valid) {
		return null;
	}

	await createSessionFn(user.id, user.username);
	return user;
}

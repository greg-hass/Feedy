import { NextResponse } from "next/server";

import { apiError, apiErrorFrom, assertApiUser } from "@/lib/api";
import { ImportExportStatus, ImportExportType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { invalidateNavigationCache } from "@/lib/navigation-data";
import { parseOpml } from "@/lib/feed/opml";
import { normalizeRedditFeed } from "@/lib/feed/discover-reddit";
import { validateFeedUrl } from "@/lib/feed/parse";
import { createValidatedFeedForUser } from "@/lib/feed/service";
import { createFixedWindowRateLimiter } from "@/lib/rate-limit";
import {
	assertWithinLimit,
	mapInBatches,
	MAX_OPML_IMPORT_BYTES,
	MAX_OPML_IMPORT_FEEDS,
	REMOTE_PROBE_BATCH_SIZE,
} from "@/lib/workload-limits";

const rateLimiter = createFixedWindowRateLimiter();

type OpmlNode = {
	title: string;
	text: string;
	xmlUrl?: string;
	children?: OpmlNode[];
};

type ImportSummary = {
	imported: number;
	duplicates: number;
	failed: number;
	foldersCreated: number;
	errors: Array<{ title: string; sourceUrl?: string; error: string }>;
};

async function importNodes(
	userId: string,
	nodes: OpmlNode[],
	onProgress?: (processed: number, total: number) => void,
) {
	const summary: ImportSummary = {
		imported: 0,
		duplicates: 0,
		failed: 0,
		foldersCreated: 0,
		errors: [],
	};
	const folderCache = new Map<string, string>();
	const feedEntries: Array<{ entry: OpmlNode; folderPath: string[] }> = [];

	async function getOrCreateFolderId(pathParts: string[]) {
		if (!pathParts.length) {
			return null;
		}

		const title = pathParts.join(" / ");
		const cached = folderCache.get(title);
		if (cached) {
			return cached;
		}

		const existing = await prisma.folder.findFirst({
			where: { userId, title },
			select: { id: true },
		});
		if (existing) {
			folderCache.set(title, existing.id);
			return existing.id;
		}

		const maxPosition = await prisma.folder.aggregate({
			where: { userId },
			_max: { position: true },
		});

		const folder = await prisma.folder.create({
			data: {
				userId,
				title,
				position: (maxPosition._max.position ?? -1) + 1,
			},
		});
		folderCache.set(title, folder.id);
		summary.foldersCreated += 1;
		return folder.id;
	}

	async function walk(entries: OpmlNode[], folderPath: string[] = []) {
		for (const entry of entries) {
			const name = entry.title || entry.text || "Untitled";
			const nextPath = entry.children?.length
				? [...folderPath, name]
				: folderPath;

			if (entry.xmlUrl) {
				feedEntries.push({ entry, folderPath });
			}

			if (entry.children?.length) {
				await walk(entry.children, nextPath);
			}
		}
	}

	await walk(nodes);
	assertWithinLimit(
		feedEntries.length,
		MAX_OPML_IMPORT_FEEDS,
		"OPML subscriptions",
	);

	let processed = 0;
	await mapInBatches(
		feedEntries,
		REMOTE_PROBE_BATCH_SIZE,
		async ({ entry, folderPath }) => {
			try {
				const reddit = normalizeRedditFeed(entry.xmlUrl!);
				const validated = reddit
					? {
							title: reddit.title,
							description: reddit.description,
							siteUrl: reddit.siteUrl,
							feedUrl: reddit.feedUrl,
							iconUrl: reddit.favicon,
							sourceType: reddit.sourceType,
						}
					: await validateFeedUrl(entry.xmlUrl!);
				const existing = await prisma.feed.findFirst({
					where: {
						userId,
						OR: [
							{ sourceUrl: entry.xmlUrl! },
							{ sourceUrl: validated.feedUrl },
						],
					},
					select: { id: true },
				});

				if (existing) {
					summary.duplicates += 1;
					return;
				}

				await createValidatedFeedForUser(
					userId,
					{
						sourceUrl: entry.xmlUrl!,
						folderId: await getOrCreateFolderId(folderPath),
						label: entry.title,
					},
					validated,
					{
						queueInitialRefresh: false,
						queueInitialIconFetch: false,
					},
				);
				summary.imported += 1;
			} catch (error) {
				if (
					error instanceof Prisma.PrismaClientKnownRequestError &&
					error.code === "P2002"
				) {
					summary.duplicates += 1;
				} else {
					const message =
						error instanceof Error ? error.message : "Unknown import error";
					summary.failed += 1;
					summary.errors.push({
						title: entry.title || entry.text || "Untitled",
						sourceUrl: entry.xmlUrl,
						error: message,
					});
				}
			}
			processed += 1;
			onProgress?.(processed, feedEntries.length);
		},
	);

	return summary;
}

export async function POST(request: Request) {
	let recordId: string | null = null;

	try {
		const user = await assertApiUser();
		const importAttempt = await rateLimiter.check(`import:opml:${user.id}`, {
			limit: 3,
			windowSeconds: 15 * 60,
		});
		if (!importAttempt.allowed) {
			const response = apiError("Too many OPML imports", 429);
			response.headers.set(
				"Retry-After",
				String(importAttempt.retryAfterSeconds),
			);
			return response;
		}
		const form = await request.formData();
		const file = form.get("file");
		if (!(file instanceof File)) {
			return apiError("File is required");
		}
		if (file.size > MAX_OPML_IMPORT_BYTES) {
			return apiError("OPML file exceeds the 1 MB upload limit.", 413);
		}

		const xml = await file.text();
		const nodes = parseOpml(xml);

		const record = await prisma.importExportRecord.create({
			data: {
				userId: user.id,
				type: ImportExportType.OPML_IMPORT,
				status: ImportExportStatus.RUNNING,
				filename: file.name,
			},
		});
		recordId = record.id;

		// Persist coarse progress so the client can poll a percentage while the
		// synchronous import runs. Writes are throttled and advisory: a dropped
		// update only delays the displayed number, never the import itself.
		let lastProgressWrite = 0;
		const onProgress = (processed: number, total: number) => {
			const now = Date.now();
			if (processed < total && now - lastProgressWrite < 750) return;
			lastProgressWrite = now;
			void prisma.importExportRecord
				.update({
					where: { id: record.id },
					data: {
						summary: {
							progress: { processed, total },
						},
					},
				})
				.catch(() => null);
		};

		const summary = await importNodes(user.id, nodes, onProgress);
		await prisma.importExportRecord.update({
			where: { id: record.id },
			data: {
				status: ImportExportStatus.SUCCEEDED,
				completedAt: new Date(),
				summary,
			},
		});

		invalidateNavigationCache(user.id);
		return NextResponse.json({ ok: true, ...summary });
	} catch (error) {
		if (recordId) {
			await prisma.importExportRecord
				.update({
					where: { id: recordId },
					data: {
						status: ImportExportStatus.FAILED,
						completedAt: new Date(),
						summary: { error: "Import failed" },
					},
				})
				.catch(() => null);
		}

		return apiErrorFrom(error, "Could not import OPML");
	}
}

export async function GET() {
	try {
		const user = await assertApiUser();
		const record = await prisma.importExportRecord.findFirst({
			where: { userId: user.id, type: ImportExportType.OPML_IMPORT },
			orderBy: { createdAt: "desc" },
			select: { status: true, summary: true },
		});
		if (!record) {
			return NextResponse.json({ status: "none", progress: null });
		}

		const summaryObject =
			record.summary &&
			typeof record.summary === "object" &&
			!Array.isArray(record.summary)
				? (record.summary as Record<string, unknown>)
				: null;
		const progressRaw = summaryObject?.progress as
			| { processed?: unknown; total?: unknown }
			| undefined;
		const progress =
			record.status === ImportExportStatus.RUNNING &&
			typeof progressRaw?.processed === "number" &&
			typeof progressRaw?.total === "number" &&
			progressRaw.total > 0
				? {
						processed: progressRaw.processed,
						total: progressRaw.total,
					}
				: null;

		return NextResponse.json({ status: record.status, progress });
	} catch (error) {
		return apiErrorFrom(error, "Could not read import status");
	}
}

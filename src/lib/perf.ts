import { env } from "@/lib/env";

type PerfMeta = Record<string, string | number | boolean | null | undefined>;

function now() {
	return performance.now();
}

function serializeMeta(meta?: PerfMeta) {
	if (!meta) {
		return "";
	}

	const entries = Object.entries(meta).filter(
		([, value]) => value !== undefined,
	);
	if (!entries.length) {
		return "";
	}

	return ` ${entries
		.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
		.join(" ")}`;
}

export function logPerf(
	name: string,
	durationMs: number,
	meta?: PerfMeta,
	force = false,
) {
	if (env.PERF_LOGGING !== "true" && !force) {
		return;
	}

	if (!force && durationMs < env.PERF_SLOW_MS) {
		return;
	}

	console.info(
		`[perf] ${name} durationMs=${Math.round(durationMs)}${serializeMeta(meta)}`,
	);
}

export async function measurePerf<T>(
	name: string,
	fn: () => Promise<T>,
	meta?: PerfMeta,
	options?: {
		force?: boolean;
	},
) {
	const startedAt = now();

	try {
		const result = await fn();
		logPerf(name, now() - startedAt, meta, options?.force ?? false);
		return result;
	} catch (error) {
		logPerf(
			name,
			now() - startedAt,
			{
				...meta,
				failed: true,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			true,
		);
		throw error;
	}
}

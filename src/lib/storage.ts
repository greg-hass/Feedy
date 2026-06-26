import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { env } from "@/lib/env";

export function ensureDataDirs() {
	const base = env.DATA_DIR;
	const dirs = [base, join(base, "icons"), join(base, "exports")];

	for (const dir of dirs) {
		mkdirSync(dir, { recursive: true });
	}
}

export function iconPath(filename: string) {
	ensureDataDirs();
	return join(env.DATA_DIR, "icons", filename);
}

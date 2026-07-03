import { NextResponse } from "next/server";

import { checkRuntimeDependencies } from "@/lib/dependency-preflight";

export async function GET() {
	try {
		const checks = await checkRuntimeDependencies();
		return NextResponse.json({ ok: true, checks }, { status: 200 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Dependencies unavailable.";
		return NextResponse.json({ ok: false, error: message }, { status: 503 });
	}
}

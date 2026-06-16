// HTTP status codes that indicate a permanently broken feed.
// Thrown by our own code as "Feed returned {status}" in
// src/lib/feed/parse.ts and src/lib/feed/youtube.ts.
const PERMANENT_HTTP_STATUSES = new Set([401, 403, 404, 410, 422]);

// rss-parser error messages that indicate structurally invalid feed content
// that is unlikely to recover without human intervention.
// Coupled to rss-parser@3.13 — update on library version bumps.
const PERMANENT_PARSER_ERROR_PATTERNS = [
	/Feed not recognized as RSS 1 or 2\./i,
	/Unexpected close tag/i,
	/Invalid character in entity name/i,
];

/**
 * Determine whether a refresh error is permanent (feed is structurally broken
 * or returns a permanent HTTP failure status). Permanent errors are marked
 * Unrecoverable so BullMQ does not retry them.
 */
export function isPermanentRefreshError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);

	// HTTP status errors — format controlled by our own throw sites.
	const httpMatch = message.match(/Feed returned (\d{3})/);
	if (httpMatch && PERMANENT_HTTP_STATUSES.has(Number(httpMatch[1]))) {
		return true;
	}

	// Parser structural errors — coupled to rss-parser internals.
	return PERMANENT_PARSER_ERROR_PATTERNS.some((pattern) =>
		pattern.test(message),
	);
}

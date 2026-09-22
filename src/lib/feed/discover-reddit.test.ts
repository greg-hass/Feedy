import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeRedditFeed } from "@/lib/feed/discover-reddit";

test("normalizes Reddit subscriptions without fetching them", () => {
	const feed = normalizeRedditFeed("https://www.reddit.com/r/apple/new.rss");
	assert.equal(feed?.feedUrl, "https://www.reddit.com/r/apple/.rss");
	assert.equal(feed?.sourceType, "REDDIT_RSS");
	assert.equal(
		normalizeRedditFeed("https://www.reddit.com/r/GeminiCLI.rss")?.feedUrl,
		"https://www.reddit.com/r/GeminiCLI/.rss",
	);
});

test("does not treat lookalike or non-HTTP hosts as Reddit", () => {
	assert.equal(normalizeRedditFeed("https://reddit.com.evil.example/r/apple.rss"), null);
	assert.equal(normalizeRedditFeed("file://www.reddit.com/r/apple.rss"), null);
});

type ReaderContentInput = {
	readabilityHtml?: string | null;
	contentHtml?: string | null;
	canonicalUrl?: string | null;
	redditPermalink?: string | null;
	feed: {
		sourceType: string;
	};
};

function isRedditUrl(url: string | null | undefined) {
	if (!url) {
		return false;
	}

	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname === "reddit.com" || hostname.endsWith(".reddit.com");
	} catch {
		return false;
	}
}

export function isExternalRedditArticle(input: ReaderContentInput) {
	return Boolean(
		input.feed.sourceType === "REDDIT_RSS" &&
			input.redditPermalink &&
			input.canonicalUrl &&
			!isRedditUrl(input.canonicalUrl),
	);
}

export function shouldFetchReadableContent(
	input: ReaderContentInput & { canonicalUrl: string | null },
	options?: { allowRedditExternalArticles?: boolean },
) {
	if (!input.canonicalUrl || input.readabilityHtml) {
		return false;
	}

	if (input.feed.sourceType !== "REDDIT_RSS") {
		return true;
	}

	return Boolean(
		options?.allowRedditExternalArticles && isExternalRedditArticle(input),
	);
}

export function selectReaderHtml(input: ReaderContentInput) {
	if (isExternalRedditArticle(input) && input.readabilityHtml) {
		return input.readabilityHtml;
	}

	if (input.feed.sourceType === "REDDIT_RSS") {
		return input.contentHtml || input.readabilityHtml || null;
	}

	return input.readabilityHtml || input.contentHtml || null;
}

/**
 * Returns true when we're showing sub-optimal content (raw RSS HTML)
 * and a background Readability extraction could improve things.
 * Used by the reader page to decide whether to poll for a refresh.
 */
export function shouldRefetchReaderContent(input: ReaderContentInput) {
	if (isExternalRedditArticle(input) && !input.readabilityHtml) {
		return true;
	}

	return !selectReaderHtml(input);
}

export function shouldRenderReaderLeadMedia(
	input: ReaderContentInput & {
		mediaUrl: string | null;
		youtubeVideoId: string | null;
	},
) {
	if (!input.mediaUrl || input.youtubeVideoId) {
		return false;
	}

	const readerHtml = selectReaderHtml(input);
	if (
		input.feed.sourceType === "REDDIT_RSS" &&
		readerHtml &&
		/<img\b/i.test(readerHtml)
	) {
		return false;
	}

	return true;
}

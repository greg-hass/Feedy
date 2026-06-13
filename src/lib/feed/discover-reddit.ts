export function normalizeRedditFeed(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("reddit.com")) {
    return null;
  }

  const subredditMatch = parsed.pathname.match(/\/r\/([^/]+)/);
  const subreddit = subredditMatch?.[1] ?? null;
  const feedPath = subreddit ? `/r/${subreddit}/.rss` : parsed.pathname.endsWith(".rss") ? parsed.pathname : `${parsed.pathname.replace(/\/$/, "")}.rss`;
  return {
    title: subreddit ? `r/${subreddit}` : "Reddit RSS",
    description: "Reddit RSS feed",
    siteName: "Reddit",
    favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
    feedUrl: new URL(feedPath, `${parsed.origin}/`).toString(),
    siteUrl: subreddit ? `https://www.reddit.com/r/${subreddit}/` : "https://www.reddit.com",
    sourceType: "REDDIT_RSS" as const,
  };
}

export function extractRedditSubreddit(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/r\/([^/?#]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

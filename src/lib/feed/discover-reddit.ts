export function normalizeRedditFeed(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("reddit.com")) {
    return null;
  }

  const subredditMatch = parsed.pathname.match(/\/r\/([^/]+)/);
  return {
    title: subredditMatch ? `r/${subredditMatch[1]}` : "Reddit RSS",
    description: "Reddit RSS feed",
    siteName: "Reddit",
    favicon: "https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-180x180.png",
    feedUrl: parsed.pathname.endsWith(".rss")
      ? parsed.toString()
      : `${parsed.toString().replace(/\/$/, "")}.rss`,
    siteUrl: subredditMatch ? `https://www.reddit.com/r/${subredditMatch[1]}/` : "https://www.reddit.com",
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


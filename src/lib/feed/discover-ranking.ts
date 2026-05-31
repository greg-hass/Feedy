import type { DiscoveryResult } from "@/lib/feed/discover-types";
import {
  compactDiscoveryKeyword,
  normalizeDiscoveryKeyword,
  normalizeYoutubeIdentity,
  youtubeNoisePenalty,
} from "@/lib/feed/discover-utils";
import { youtubeCanonicalKey } from "@/lib/feed/discover-youtube";

export function rankResults(results: DiscoveryResult[], keyword: string) {
  const q = normalizeDiscoveryKeyword(keyword);
  return [...results].sort((a, b) => score(b, q) - score(a, q));
}

function score(result: DiscoveryResult, keyword: string) {
  const normalizedKeyword = compactDiscoveryKeyword(keyword);
  const keywordTokens = normalizeDiscoveryKeyword(keyword).split(" ").filter(Boolean);
  const haystack = compactDiscoveryKeyword(
    `${result.title} ${result.siteName || ""} ${result.description || ""} ${result.feedUrl} ${result.siteUrl || ""}`,
  );
  const normalizedTitle = normalizeYoutubeIdentity(result.title);

  let value = 0;
  if (normalizedKeyword && haystack.includes(normalizedKeyword)) value += 10;
  if (keywordTokens.length > 0 && keywordTokens.every((token) => haystack.includes(token))) value += 5;
  if (keywordTokens.length > 0 && result.title.toLowerCase().includes(keywordTokens[0])) value += 2;
  if (normalizedKeyword && compactDiscoveryKeyword(result.title) === normalizedKeyword) value += 10;
  if (normalizedKeyword && compactDiscoveryKeyword(result.siteName || "") === normalizedKeyword) value += 6;
  if (result.sourceType === "YOUTUBE_RSS") value += 4;
  if (result.sourceType === "REDDIT_RSS") value += 3;
  if (result.feedUrl.includes("/feed") || result.feedUrl.includes("rss")) value += 2;
  if (result.siteUrl?.includes("/@")) value += 3;
  if (result.siteUrl?.includes("/channel/")) value += 2;
  if (result.siteUrl?.includes("/r/")) value += 2;
  if (result.sourceType === "YOUTUBE_RSS") {
    if (normalizedKeyword && normalizedTitle === normalizedKeyword) value += 18;
    if (keywordTokens.length > 0 && keywordTokens.every((token) => normalizedTitle.includes(token))) value += 10;
    value -= youtubeNoisePenalty(result, [
      "admin",
      "fandom",
      "fan",
      "fans",
      "clips",
      "highlights",
      "moments",
      "shorts",
      "tv",
      "live",
      "podcast",
      "news",
      "updates",
      "archive",
      "edits",
    ]);
  }
  return value;
}

export function dedupeRankedResults(results: DiscoveryResult[], keyword: string) {
  const ranked = rankResults(results, keyword);
  const deduped = new Map<string, DiscoveryResult>();
  const finalResults: DiscoveryResult[] = [];

  for (const result of ranked) {
    const normalizedResult = {
      ...result,
      feedUrl: normalizeDiscoveryFeedUrl(result.feedUrl),
    };

    const keys = [normalizedResult.feedUrl];
    if (result.sourceType === "YOUTUBE_RSS") {
      keys.push(youtubeCanonicalKey(result));
      const normalizedTitle = normalizeYoutubeIdentity(result.title);
      if (normalizedTitle) {
        keys.push(`yt:title:${normalizedTitle}`);
      }
    }

    if (keys.some((key) => deduped.has(key))) {
      continue;
    }

    finalResults.push(normalizedResult);
    for (const key of keys) {
      deduped.set(key, normalizedResult);
    }
  }

  return finalResults;
}

export function normalizeDiscoveryFeedUrl(feedUrl: string) {
  try {
    const parsed = new URL(feedUrl);
    if (parsed.hostname.includes("youtube.com") && parsed.pathname === "/feeds/videos.xml") {
      parsed.protocol = "https:";
      return parsed.toString();
    }

    if (parsed.hostname.includes("reddit.com") && !parsed.pathname.endsWith(".rss")) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}.rss`;
      parsed.protocol = "https:";
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return feedUrl;
  }
}

export function balanceAllSourceResults(results: DiscoveryResult[]) {
  const finalResults: DiscoveryResult[] = [];
  const seen = new Set<string>();
  const preferredSourceOrder: DiscoveryResult["sourceType"][] = ["RSS", "REDDIT_RSS", "YOUTUBE_RSS"];

  for (const sourceType of preferredSourceOrder) {
    const match = results.find((result) => result.sourceType === sourceType);
    if (!match) {
      continue;
    }

    const key = normalizeDiscoveryFeedUrl(match.feedUrl);
    if (seen.has(key)) {
      continue;
    }

    finalResults.push(match);
    seen.add(key);
  }

  for (const result of results) {
    const key = normalizeDiscoveryFeedUrl(result.feedUrl);
    if (seen.has(key)) {
      continue;
    }

    finalResults.push(result);
    seen.add(key);
  }

  return finalResults;
}


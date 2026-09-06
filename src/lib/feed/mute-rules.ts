import type { ParsedFeedItem } from "@/lib/feed/types";

export type FeedMuteRules = {
  titlePatterns: string[];
  authorPatterns: string[];
  hideFromTimeline: boolean;
  autoMarkRead: boolean;
};

const emptyRules: FeedMuteRules = {
  titlePatterns: [],
  authorPatterns: [],
  hideFromTimeline: false,
  autoMarkRead: false,
};

function normalizePatterns(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((pattern) => (typeof pattern === "string" ? pattern.trim() : ""))
    .filter(Boolean);
}

export function normalizeFeedMuteRules(value: unknown): FeedMuteRules {
  if (!value || typeof value !== "object") {
    return emptyRules;
  }

  const input = value as Record<string, unknown>;
  return {
    titlePatterns: normalizePatterns(input.titlePatterns),
    authorPatterns: normalizePatterns(input.authorPatterns),
    hideFromTimeline: Boolean(input.hideFromTimeline),
    autoMarkRead: Boolean(input.autoMarkRead),
  };
}

function containsPattern(value: string | null | undefined, patterns: string[]) {
  if (!value || patterns.length === 0) {
    return false;
  }

  const haystack = value.toLocaleLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern.toLocaleLowerCase()));
}

export function evaluateFeedMuteRules(rules: FeedMuteRules, item: ParsedFeedItem) {
  const titleMatch = containsPattern(item.title, rules.titlePatterns);
  const authorMatch = containsPattern(item.author, rules.authorPatterns);
  const matched = titleMatch || authorMatch;

  return {
    matched,
    muteFromTimeline: matched && rules.hideFromTimeline,
    autoMarkRead: matched && rules.autoMarkRead,
  };
}

import type { DiscoveryResult } from "@/lib/feed/discover-types";

export const YOUTUBE_CHANNEL_SEARCH_FILTER = "EgIQAg==";

export function normalizeDiscoveryKeyword(keyword: string) {
  return keyword
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[@'".,!?()[\]{}:;|/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactDiscoveryKeyword(keyword: string) {
  return normalizeDiscoveryKeyword(keyword).replace(/\s+/g, "");
}

export function buildDiscoverySearchQueries(keyword: string, maxQueries = 5) {
  const normalized = normalizeDiscoveryKeyword(keyword);
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const queries = new Set<string>();
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) {
      queries.add(trimmed);
    }
  };

  add(keyword);
  add(normalized);
  add(compactDiscoveryKeyword(keyword));

  if (tokens.length > 0) {
    add(tokens[0]);
  }

  if (tokens.length > 1) {
    add(tokens.join(" "));
    add(tokens.join(""));
    add(`${tokens[0]}${tokens.slice(1).map((token) => token[0]).join("")}`);
    add(tokens.map((token) => token[0]).join(""));
  }

  return Array.from(queries).slice(0, maxQueries);
}

export function normalizeYoutubeIdentity(value: string) {
  return compactDiscoveryKeyword(value)
    .replace(/official|channel|youtube/g, "")
    .replace(/\d+/g, "")
    .trim();
}

export function youtubeNoisePenalty(result: DiscoveryResult, noiseTerms: string[]) {
  const haystack = normalizeDiscoveryKeyword(
    `${result.title} ${result.description || ""} ${result.siteUrl || ""}`,
  );

  return noiseTerms.reduce((penalty, term) => {
    return haystack.includes(term) ? penalty + 12 : penalty;
  }, 0);
}

export function buildYoutubeSearchQueries(keyword: string) {
  const baseQueries = buildDiscoverySearchQueries(keyword, 4);
  const prioritized: string[] = [];
  const seen = new Set<string>();
  const normalized = normalizeDiscoveryKeyword(keyword);
  const tokens = normalized.split(" ").filter(Boolean);
  const add = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    prioritized.push(trimmed);
  };

  if (tokens.length > 1) {
    const first = tokens[0]!;
    const last = tokens[tokens.length - 1]!;
    const lastInitial = last[0];
    const firstPlusInitial = `${first}${lastInitial}`;
    const separatedInitial = `${first} ${lastInitial}`;

    add(firstPlusInitial);
    add(`@${firstPlusInitial}`);
    add(compactDiscoveryKeyword(keyword));
    add(keyword);
    add(separatedInitial);
    add(`${keyword} channel`);
    add(`${separatedInitial} channel`);
  } else {
    add(compactDiscoveryKeyword(keyword));
    add(keyword);
    add(`${keyword} channel`);
  }

  for (const query of baseQueries) {
    add(query);
    add(`${query} channel`);
  }

  return prioritized.slice(0, 6);
}

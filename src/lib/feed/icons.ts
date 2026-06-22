import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname } from "node:path";

import * as cheerio from "cheerio";

import { prisma } from "@/lib/db";
import { fetchWithTimeout } from "@/lib/http";
import { iconPath } from "@/lib/storage";

const BROWSER_LIKE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

function enhanceIconCandidate(candidate: string, isYouTube: boolean) {
	try {
		const url = new URL(candidate);

		if (isYouTube && /yt3\.(ggpht|googleusercontent)\.com/.test(url.hostname)) {
			url.searchParams.delete("s");
			const path = url.pathname.replace(/=s\d+(-[a-z0-9-]+)?$/i, "");
			url.pathname = path;
			return `${url.toString().split("=")[0]}=s512-c-k-c0x00ffffff-no-rj`;
		}

		if (url.hostname.includes("wp.com") || url.hostname.includes("gravatar.com")) {
			url.searchParams.delete("fit");
			url.searchParams.set("w", "256");
			url.searchParams.set("h", "256");
			return url.toString();
		}

		// Reddit subreddit avatars come from styles.redditmedia.com with
		// width/height query params. Bump them to 256 for crisp rendering.
		if (url.hostname.includes("styles.redditmedia.com")) {
			url.searchParams.set("width", "256");
			url.searchParams.set("height", "256");
			url.searchParams.delete("frame");
			return url.toString();
		}

		if (url.searchParams.has("sz")) {
			url.searchParams.set("sz", "256");
		}

		// Bump common CDN size params to 256 when present at a smaller value.
		for (const key of ["w", "width", "W", "Width"]) {
			const value = Number(url.searchParams.get(key));
			if (Number.isFinite(value) && value > 0 && value < 256) {
				url.searchParams.set(key, "256");
			}
		}
		for (const key of ["h", "height", "H", "Height"]) {
			const value = Number(url.searchParams.get(key));
			if (Number.isFinite(value) && value > 0 && value < 256) {
				url.searchParams.set(key, "256");
			}
		}

		return url.toString();
	} catch {
    return candidate;
  }
}

function inferIconCandidates(siteUrl?: string | null, hint?: string | null) {
  const candidates = new Set<string>();
  if (hint) {
    candidates.add(hint);
  }
  if (siteUrl) {
    try {
      const url = new URL(siteUrl);
      candidates.add(new URL("/favicon.ico", url).toString());
    } catch {
      return [...candidates];
    }
  }
  return [...candidates];
}

async function discoverPageIcons(siteUrl?: string | null) {
	if (!siteUrl) {
		return [];
	}

	try {
		const response = await fetchWithTimeout(
			siteUrl,
			siteUrl.includes("youtube.com") ? { headers: BROWSER_LIKE_HEADERS } : {},
			10_000,
		);
		if (!response.ok) {
			return [];
		}

		const html = await response.text();
		const $ = cheerio.load(html);
		const appleTouch = $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')
			.map((_, element) => $(element).attr("href"))
			.get()
			.filter(Boolean)
			.map((href) => new URL(href!, siteUrl).toString());
		const regularIcons = $('link[rel="icon"], link[rel="shortcut icon"]')
			.map((_, element) => $(element).attr("href"))
			.get()
			.filter(Boolean)
			.map((href) => new URL(href!, siteUrl).toString());

		// Prefer apple-touch-icon first — typically 180×180 and high-res by design.
		// Plain favicon links are usually 16/32px and look blurry when scaled up.
		const candidates = [...appleTouch, ...regularIcons];
		const ogImage = $('meta[property="og:image"]').attr("content");
		if (ogImage) {
			candidates.push(new URL(ogImage, siteUrl).toString());
		}

		return [...new Set(candidates)];
	} catch {
		return [];
	}
}

async function discoverYouTubeChannelAvatar(siteUrl?: string | null) {
	if (!siteUrl || !siteUrl.includes("youtube.com")) {
		return null;
	}

	try {
		const response = await fetchWithTimeout(siteUrl, { headers: BROWSER_LIKE_HEADERS }, 10_000);
		if (!response.ok) {
			return null;
		}

		const html = await response.text();
		const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
		if (ogImage) {
			return ogImage.startsWith("//") ? `https:${ogImage}` : ogImage;
		}

		const avatar = /"avatar":{"thumbnails":\[(.*?)\]}/.exec(html)?.[1];
		const matches = avatar ? [...avatar.matchAll(/"url":"([^"]+)"/g)].map((match) => match[1]) : [];
		const best = matches.at(-1);
		return best?.startsWith("//") ? `https:${best}` : best ?? null;
	} catch {
		return null;
	}
}

async function discoverRedditSubredditIcon(siteUrl?: string | null) {
	if (!siteUrl) {
		return null;
	}
	const match = siteUrl.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)/i);
	if (!match) {
		return null;
	}
	const sub = match[1];

	try {
		const response = await fetchWithTimeout(
			`https://www.reddit.com/r/${sub}/about.json`,
			{
				headers: {
					"User-Agent":
						"Feedy/1.0 (self-hosted RSS reader; contact: feedy@local)",
				},
			},
			8_000,
		);
		if (!response.ok) {
			return null;
		}
		const json = (await response.json()) as {
			data?: {
				community_icon?: string;
				icon_img?: string;
			};
		};
		const data = json.data ?? {};
		// community_icon is the subreddit-set avatar (preferred). icon_img is the
		// user's avatar on user profiles — only useful as a fallback for /user/.
		const raw =
			(data.community_icon && data.community_icon.length > 0
				? data.community_icon
				: data.icon_img) || null;
		if (!raw) {
			return null;
		}
		// Reddit serves these at the resolution specified by width/height query
		// params. Strip them so we get the original asset and let enhanceIconCandidate
		// re-add the size we want.
		return raw.split("?")[0];
	} catch {
		return null;
	}
}

async function buildIconCandidates(siteUrl?: string | null, hint?: string | null) {
	const youtubeAvatar = await discoverYouTubeChannelAvatar(siteUrl);
	const redditIcon = await discoverRedditSubredditIcon(siteUrl);
	const pageIcons = await discoverPageIcons(siteUrl);
	const fallbackIcons = inferIconCandidates(siteUrl, hint);
	const isYouTube = Boolean(siteUrl?.includes("youtube.com"));

	const candidates = new Set<string>();

	// Source-specific avatars go FIRST so the platform's generic favicon
	// (reddit.com/favicon.ico, youtube.com/favicon.ico) never wins by default.
	if (redditIcon) {
		candidates.add(enhanceIconCandidate(redditIcon, false));
	}
	if (youtubeAvatar) {
		candidates.add(youtubeAvatar);
	}

	for (const icon of pageIcons) {
		candidates.add(enhanceIconCandidate(icon, isYouTube));
	}

	for (const icon of fallbackIcons) {
		if (isYouTube && icon.includes("youtube.com/favicon")) {
			continue;
		}
		candidates.add(enhanceIconCandidate(icon, isYouTube));
	}

	if (isYouTube && !youtubeAvatar) {
		candidates.add("https://www.youtube.com/s/desktop/fe376c4d/img/logos/favicon_144x144.png");
	}

	return [...candidates];
}

export async function fetchAndCacheIcon(feedId: string) {
  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { icon: true },
  });

  if (!feed) {
    return null;
  }

  for (const candidate of await buildIconCandidates(feed.siteUrl, feed.iconHintUrl)) {
    try {
      const response = await fetchWithTimeout(candidate, {}, 10_000);
      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) {
        continue;
      }

      const ext = extname(new URL(candidate).pathname) || ".ico";
      const filename = `${createHash("sha1").update(`${feedId}:${candidate}`).digest("hex")}${ext}`;
      const filePath = iconPath(filename);
      await writeFile(filePath, bytes);

      return prisma.feedIcon.upsert({
        where: { feedId },
        update: {
          sourceUrl: candidate,
          mimeType: contentType,
          storagePath: filePath,
          fetchedAt: new Date(),
        },
        create: {
          feedId,
          sourceUrl: candidate,
          mimeType: contentType,
          storagePath: filePath,
        },
      });
    } catch {
      continue;
    }
  }

  return null;
}

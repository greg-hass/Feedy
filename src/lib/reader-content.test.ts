import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isExternalRedditArticle,
  selectReaderHtml,
  shouldFetchReadableContent,
  shouldRenderReaderLeadMedia,
} from "@/lib/reader-content";

describe("reader content policy", () => {
  it("uses Reddit RSS content without fetching readability content", () => {
    const input = {
      canonicalUrl: "https://www.reddit.com/r/ios/comments/example/post/",
      readabilityHtml: null,
      contentHtml: "<p>submitted by reddit user</p>",
      feed: { sourceType: "REDDIT_RSS" },
    };

    assert.equal(shouldFetchReadableContent(input), false);
    assert.equal(selectReaderHtml(input), "<p>submitted by reddit user</p>");
  });

  it("allows background readability extraction for Reddit posts that link to external articles", () => {
    const input = {
      canonicalUrl: "https://example.com/review",
      redditPermalink: "https://www.reddit.com/r/gadgets/comments/example/review/",
      readabilityHtml: null,
      contentHtml: "<p>Reddit discussion preview</p>",
      feed: { sourceType: "REDDIT_RSS" },
    };

    assert.equal(isExternalRedditArticle(input), true);
    assert.equal(shouldFetchReadableContent(input), false);
    assert.equal(shouldFetchReadableContent(input, { allowRedditExternalArticles: true }), true);
  });

  it("prefers cached readability for external Reddit article posts", () => {
    assert.equal(
      selectReaderHtml({
        canonicalUrl: "https://example.com/review",
        redditPermalink: "https://www.reddit.com/r/gadgets/comments/example/review/",
        readabilityHtml: "<article>Readable article</article>",
        contentHtml: "<p>Reddit discussion preview</p>",
        feed: { sourceType: "REDDIT_RSS" },
      }),
      "<article>Readable article</article>",
    );
  });

  it("still fetches readability content for non-Reddit articles without cached readability HTML", () => {
    assert.equal(
      shouldFetchReadableContent({
        canonicalUrl: "https://example.com/article",
        readabilityHtml: null,
        contentHtml: "<p>Feed excerpt</p>",
        feed: { sourceType: "RSS" },
      }),
      true,
    );
  });

  it("does not render a Reddit lead image when the RSS body already contains an image", () => {
    assert.equal(
      shouldRenderReaderLeadMedia({
        mediaUrl: "https://preview.redd.it/example.jpg?width=1080",
        youtubeVideoId: null,
        readabilityHtml: null,
        contentHtml: "<p><img src=\"https://preview.redd.it/example.jpg?width=640\"></p>",
        feed: { sourceType: "REDDIT_RSS" },
      }),
      false,
    );
  });

  it("renders normal article lead media when body has no duplicate image", () => {
    assert.equal(
      shouldRenderReaderLeadMedia({
        mediaUrl: "https://example.com/image.jpg",
        youtubeVideoId: null,
        readabilityHtml: null,
        contentHtml: "<p>Article body</p>",
        feed: { sourceType: "RSS" },
      }),
      true,
    );
  });
});

import sanitizeHtml from "sanitize-html";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { fetchWithTimeout } from "@/lib/http";

export async function extractReadableContent(url: string) {
  const response = await fetchWithTimeout(url, {}, 15_000);
  if (!response.ok) {
    throw new Error(`Reader fetch failed with ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article?.content) {
    return null;
  }

  return {
    title: article.title,
    excerpt: article.excerpt,
    content: sanitizeHtml(article.content, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        a: ["href", "name", "target", "rel"],
        img: ["src", "alt", "title", "width", "height"],
      },
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", {
          target: "_blank",
          rel: "noopener noreferrer",
        }),
      },
    }),
  };
}

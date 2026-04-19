import sanitizeHtml from "sanitize-html";

const readerSanitizeOptions: sanitizeHtml.IOptions = {
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
};

export function sanitizeReaderHtml(html: string | null | undefined) {
  if (!html) {
    return "";
  }

  return sanitizeHtml(html, readerSanitizeOptions);
}

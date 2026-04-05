import * as cheerio from "cheerio";

type OutlineNode = {
  text: string;
  title: string;
  xmlUrl?: string;
  htmlUrl?: string;
  children?: OutlineNode[];
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildOpml(outlines: OutlineNode[]) {
  const renderNode = (node: OutlineNode): string => {
    if (node.children?.length) {
      return `<outline text="${escapeXml(node.text)}" title="${escapeXml(node.title)}">${node.children
        .map(renderNode)
        .join("")}</outline>`;
    }

    return `<outline text="${escapeXml(node.text)}" title="${escapeXml(node.title)}" type="rss" xmlUrl="${escapeXml(
      node.xmlUrl ?? "",
    )}" htmlUrl="${escapeXml(node.htmlUrl ?? "")}" />`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feedy Export</title>
  </head>
  <body>${outlines.map(renderNode).join("")}</body>
</opml>`;
}

export function parseOpml(xml: string) {
  const $ = cheerio.load(xml, { xmlMode: true });

  const parseNode = (element: unknown): OutlineNode => {
    const node = $(element as never);
    const children = node
      .children("outline")
      .map((_, child) => parseNode(child))
      .get();

    return {
      text: node.attr("text") || node.attr("title") || "Untitled",
      title: node.attr("title") || node.attr("text") || "Untitled",
      xmlUrl: node.attr("xmlUrl"),
      htmlUrl: node.attr("htmlUrl"),
      children: children.length ? children : undefined,
    };
  };

  return $("body > outline")
    .map((_, element) => parseNode(element))
    .get();
}

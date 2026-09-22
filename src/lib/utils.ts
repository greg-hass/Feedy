import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(date: Date | string | null | undefined) {
  if (!date) {
    return "Never";
  }

  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

function fromCodePointSafe(code: number) {
  return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function decodeOnce(value: string) {
  return value
    .replace(
      /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;/g,
      (entity) => ENTITY_MAP[entity] ?? entity,
    )
    .replace(/&#(\d+);/g, (_m, code) =>
      fromCodePointSafe(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) =>
      fromCodePointSafe(Number.parseInt(code, 16)),
    );
}

export function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  // A second pass handles double-encoded content (e.g. `&amp;#8217;`).
  const once = decodeOnce(value);
  const twice = decodeOnce(once);
  return twice;
}

/**
 * Compact label for the navigation unread badge. Capped so the badge keeps a
 * stable width inside the nav pill; callers should not render it when the
 * count is zero.
 */
export function formatUnreadBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return "0";
  }
  return count > 99 ? "99+" : String(count);
}

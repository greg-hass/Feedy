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

export function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;/g,
    (entity) => ENTITY_MAP[entity] ?? entity,
  );
}

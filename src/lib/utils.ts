import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(date: Date | string | null | undefined) {
  if (!date) {
    return "Never";
  }

  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

export function absoluteUrl(path: string) {
  return new URL(path, process.env.APP_URL).toString();
}

export function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

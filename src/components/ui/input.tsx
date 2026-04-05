"use client";

import { cn } from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-2xl border border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_82%,black_18%)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[color-mix(in_srgb,var(--text-secondary)_78%,transparent)] focus:border-[var(--accent)] focus:bg-[color-mix(in_srgb,var(--surface-muted)_90%,black_10%)]",
        props.className,
      )}
    />
  );
}

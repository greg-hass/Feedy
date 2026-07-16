"use client";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-xl border border-subtle transition duration-200 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--surface)] text-secondary hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]",
        active: "border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]",
        accent: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.22)]",
        ghost: "border-transparent bg-transparent text-secondary hover:bg-[var(--surface-muted)]",
      },
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants>;

export function IconButton({ className, variant, size, ...props }: IconButtonProps) {
  return <button className={cn("icon-button", iconButtonVariants({ variant, size }), className)} {...props} />;
}

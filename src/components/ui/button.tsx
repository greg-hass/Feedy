"use client";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl font-semibold transition duration-200 disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "accent-bg text-white shadow-lg shadow-emerald-950/15",
        secondary: "surface border border-subtle text-[var(--text-primary)]",
        ghost: "bg-transparent text-[var(--text-primary)]",
        danger: "bg-[var(--danger)] text-white",
      },
      size: {
        sm: "rounded-xl px-3 py-2 text-xs",
        md: "rounded-2xl px-4 py-3 text-sm",
        lg: "rounded-[18px] px-6 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

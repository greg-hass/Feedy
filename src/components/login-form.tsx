"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole, AlertCircle, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function getErrorMessage(errorCode: string | undefined): { message: string; countdown?: number } | null {
  if (errorCode === "invalid") {
    return { message: "Those credentials were rejected." };
  }
  if (errorCode === "failed") {
    return { message: "Login failed. Try again." };
  }
  if (errorCode === "rate_limited") {
    return { message: "Too many attempts. Please wait a few minutes." };
  }
  return null;
}

export function LoginForm({ errorCode }: { errorCode?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const error = getErrorMessage(errorCode);

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--accent)]">
          <LockKeyhole className="size-4.5" />
        </div>
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Sign in
          </h1>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            Use the credentials configured for this instance.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)] animate-in slide-in-from-top-1 fade-in duration-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : null}

      <form
        className="mt-7 space-y-5"
        action="/api/auth/login"
        method="post"
      >
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            Username
          </span>
          <Input
            name="username"
            placeholder="Username"
            className="h-14 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 text-base"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            Password
          </span>
          <div className="relative">
            <Input
              name="password"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="h-14 rounded-2xl border-[var(--border)] bg-[var(--surface-strong)] px-4 pr-12 text-base"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        <Button
          type="submit"
          size="lg"
          className="mt-2 h-14 w-full rounded-2xl transition-transform duration-200 active:scale-[0.985]"
        >
          Open Feedy
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </form>
    </>
  );
}

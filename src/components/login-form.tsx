"use client";

import { useState, useCallback } from "react";
import { ArrowRight, LockKeyhole, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const error = getErrorMessage(errorCode);

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    setHasAttempted(true);
  }, []);

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          <LockKeyhole className="size-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)]">Sign in</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Use the credentials configured in your{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 py-0.5 text-xs">.env</code>
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)] animate-in slide-in-from-top-1 fade-in duration-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : null}

      {/* Form */}
      <form
        className="mt-6 space-y-4"
        action="/api/auth/login"
        method="post"
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
      >
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">
            Username
          </span>
          <Input
            name="username"
            placeholder="Username"
            className="h-14 rounded-2xl px-4 text-base"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            autoFocus={!hasAttempted}
            disabled={isSubmitting}
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">
            Password
          </span>
          <div className="relative">
            <Input
              name="password"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="h-14 rounded-2xl px-4 pr-12 text-base"
              autoComplete="current-password"
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
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
          className="mt-2 h-14 w-full transition-transform duration-200 active:scale-[0.985]"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Open Feedy
              <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </form>
    </>
  );
}

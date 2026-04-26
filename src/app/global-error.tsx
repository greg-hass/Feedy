"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <main className="flex min-h-screen items-center justify-center px-5">
          <div className="w-full max-w-md rounded-[28px] border border-subtle bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Feedy</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Something went wrong</h1>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              We hit an unexpected problem while loading the app. Your data is safe, and you can try again.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-contrast)]"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

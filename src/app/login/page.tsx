import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-10">
        <section className="w-full rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="size-11 rounded-2xl" aria-hidden />
              <div>
                <p className="text-sm font-semibold tracking-[0.14em] text-[var(--text-primary)] uppercase">
                  Feedy
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Private, self-hosted feed reader
                </p>
              </div>
            </div>
            <div className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Self-hosted
            </div>
          </div>

          <LoginForm errorCode={errorCode} />
        </section>
      </div>
    </main>
  );
}

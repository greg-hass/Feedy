import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(var(--accent-rgb), 0.12), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 110%, rgba(var(--accent-rgb), 0.08), transparent)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-sm px-6 py-12 screen-enter">
        {/* Brand header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-[22px] bg-[var(--surface)] shadow-[0_4px_24px_rgba(0,0,0,0.08)] ring-1 ring-[var(--border)]">
            <img src="/icon-192.png" alt="" className="size-10 rounded-xl" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            Feedy
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-secondary)]">
            Private, self-hosted feed reader
          </p>
        </div>

        <LoginForm errorCode={errorCode} />
      </div>
    </main>
  );
}

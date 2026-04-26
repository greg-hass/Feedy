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
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden">
        {/* Hero Section */}
        <section className="relative flex min-h-[45svh] flex-col justify-between px-6 pb-8 pt-6">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_8%,var(--app-bg)_92%)_0%,var(--app-bg)_100%)]" />
          <div className="absolute inset-0 opacity-95">
            <div className="absolute right-[-14%] top-[6%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(var(--accent-rgb),0.35)_0%,_rgba(var(--accent-rgb),0.06)_42%,_transparent_72%)] blur-3xl" />
            <div className="absolute left-[-20%] top-[42%] h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(var(--accent-rgb),0.22)_0%,_transparent_66%)] blur-3xl" />
            <div className="absolute right-[8%] top-[18%] h-[36%] w-[58%] rounded-[40px] border border-[var(--accent)]/8 bg-[linear-gradient(155deg,rgba(var(--accent-rgb),0.05),rgba(var(--accent-rgb),0.01))]" />
            <div className="absolute right-[16%] top-[24%] h-[2px] w-[38%] bg-[var(--accent)]/15" />
            <div className="absolute right-[16%] top-[30%] h-[2px] w-[30%] bg-[var(--accent)]/10" />
            <div className="absolute right-[16%] top-[36%] h-[2px] w-[24%] bg-[var(--accent)]/6" />
          </div>

          {/* Header with App Icon */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/icon-192.png"
                alt=""
                className="size-10 rounded-2xl"
                aria-hidden
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-secondary)]">Feedy</p>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Private mobile feed reader</p>
              </div>
            </div>
            <div className="rounded-full border border-[var(--accent)]/15 bg-[var(--accent-dim)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
              Self-hosted
            </div>
          </div>

          {/* Headline */}
          <div className="relative max-w-[14ch]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]/60">Mobile PWA</p>
            <h1 className="mt-4 text-[3.2rem] font-semibold leading-[0.95] tracking-[-0.06em]">
              Read in
              <br />
              focus.
            </h1>
            <p className="mt-4 max-w-[26ch] text-base leading-7 text-[var(--text-secondary)]">
              One calm place for RSS, Reddit RSS, and YouTube RSS on your home screen.
            </p>
          </div>

          {/* Feature pills */}
          <div className="relative flex items-center gap-5 text-sm text-[var(--text-secondary)]">
            <span>RSS</span>
            <span className="h-1 w-1 rounded-full bg-[var(--accent)]/70" />
            <span>Reddit RSS</span>
            <span className="h-1 w-1 rounded-full bg-[var(--accent)]/70" />
            <span>YouTube RSS</span>
          </div>
        </section>

        {/* Form Section */}
        <section className="relative -mt-7 flex-1 rounded-t-[28px] border-t border-[var(--border)] bg-[var(--surface)] px-6 pb-8 pt-6 shadow-[0_-8px_32px_rgba(0,0,0,0.06)]">
          <LoginForm errorCode={errorCode} />
        </section>
      </div>
    </main>
  );
}

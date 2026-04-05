import { ArrowRight, LockKeyhole, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error;
  const error =
    errorCode === "invalid"
      ? "Those credentials were rejected."
      : errorCode === "failed"
        ? "Login failed. Try again."
        : null;

  return (
    <main className="min-h-screen bg-[#050d0b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden">
        <section className="relative flex min-h-[57svh] flex-col justify-between px-6 pb-8 pt-6">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#07110f_0%,#091412_50%,#0d1715_100%)]" />
          <div className="absolute inset-0 opacity-95">
            <div className="absolute right-[-14%] top-[6%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(25,195,125,0.42)_0%,_rgba(25,195,125,0.08)_42%,_transparent_72%)] blur-3xl" />
            <div className="absolute left-[-20%] top-[42%] h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(10,84,58,0.36)_0%,_transparent_66%)] blur-3xl" />
            <div className="absolute right-[8%] top-[18%] h-[36%] w-[58%] rounded-[40px] border border-white/8 bg-[linear-gradient(155deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))]" />
            <div className="absolute right-[16%] top-[24%] h-[2px] w-[38%] bg-emerald-200/20" />
            <div className="absolute right-[16%] top-[30%] h-[2px] w-[30%] bg-emerald-100/12" />
            <div className="absolute right-[16%] top-[36%] h-[2px] w-[24%] bg-emerald-100/8" />
          </div>

          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">Feedy</p>
              <p className="mt-2 text-sm text-white/58">Private mobile feed reader</p>
            </div>
            <div className="rounded-full border border-emerald-400/15 bg-emerald-500/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-300/90">
              Self-hosted
            </div>
          </div>

          <div className="relative max-w-[12ch]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/50">Mobile PWA</p>
            <h1 className="mt-4 text-[3.8rem] font-semibold leading-[0.86] tracking-[-0.08em]">
              Read in
              <br />
              focus.
            </h1>
            <p className="mt-4 max-w-[24ch] text-base leading-7 text-white/64">
              One calm place for RSS, Reddit RSS, and YouTube RSS on your home screen.
            </p>
          </div>

          <div className="relative flex items-center gap-5 text-sm text-white/60">
            <span>RSS</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300/70" />
            <span>Reddit RSS</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300/70" />
            <span>YouTube RSS</span>
          </div>
        </section>

        <section className="relative -mt-7 flex-1 rounded-t-[34px] border-t border-white/6 bg-[linear-gradient(180deg,#f3f7f5_0%,#e7efe9_100%)] px-6 pb-8 pt-6 text-[#0d1715]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-[#0f7a55]">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <p className="text-base font-semibold">Sign in</p>
              <p className="text-sm text-[#66756d]">Use the credentials configured in your <code className="rounded bg-black/5 px-1 py-0.5 text-xs">.env</code></p>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-[18px] bg-red-100 border border-red-300 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" action="/api/auth/login" method="post">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#6d746d]">
                Username
              </span>
              <Input
                name="username"
                defaultValue="admin"
                placeholder="Username"
                className="h-14 rounded-[18px] border-black/8 bg-white px-4 text-base text-[#101618] placeholder:text-[#7c837d]"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#6d746d]">
                Password
              </span>
              <Input
                name="password"
                placeholder="Password"
                type="password"
                className="h-14 rounded-[18px] border-black/8 bg-white px-4 text-base text-[#101618] placeholder:text-[#7c837d]"
                autoComplete="current-password"
              />
            </label>

            <Button
              type="submit"
              className="mt-2 h-14 w-full rounded-[18px] text-base transition-transform duration-200 active:scale-[0.985]"
            >
              Open Feedy
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

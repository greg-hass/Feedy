"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setServerError(null);
    setIsSubmitting(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      window.location.href = "/app/unread";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      if (message === "Failed to fetch" || message.includes("NetworkError")) {
        setServerError(
          "Cannot reach the server. Make sure Docker is running and the containers are healthy.",
        );
      } else if (message === "Invalid credentials") {
        setError("Wrong username or password. Check your .env file.");
      } else {
        setServerError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#091014] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden">
        <section className="relative flex min-h-[56svh] flex-col justify-between px-6 pb-8 pt-6">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b1317_0%,#0c1618_48%,#101718_100%)]" />
          <div className="absolute inset-0 opacity-90">
            <div className="absolute right-[-12%] top-[10%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(44,128,110,0.55)_0%,_rgba(44,128,110,0.1)_42%,_transparent_72%)] blur-2xl" />
            <div className="absolute left-[-18%] top-[36%] h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(214,176,114,0.22)_0%,_transparent_66%)] blur-3xl" />
            <div className="absolute right-[10%] top-[18%] h-[34%] w-[56%] rounded-[40px] border border-white/8 bg-[linear-gradient(155deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))]" />
            <div className="absolute right-[18%] top-[24%] h-[2px] w-[34%] bg-white/14" />
            <div className="absolute right-[18%] top-[30%] h-[2px] w-[28%] bg-white/10" />
            <div className="absolute right-[18%] top-[36%] h-[2px] w-[22%] bg-white/8" />
          </div>

          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/44">Feedy</p>
              <p className="mt-2 text-sm text-white/62">Personal feed reader</p>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#d8be92]">
              Self-hosted
            </div>
          </div>

          <div className="relative max-w-[11ch]">
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Mobile PWA</p>
            <h1 className="mt-4 text-[3.7rem] font-semibold leading-[0.88] tracking-[-0.07em]">
              Quiet feeds.
            </h1>
            <p className="mt-4 max-w-[23ch] text-base leading-7 text-white/66">
              Read RSS, Reddit RSS, and YouTube RSS in one place without the usual chaos.
            </p>
          </div>

          <div className="relative flex items-center gap-5 text-sm text-white/64">
            <span>RSS</span>
            <span className="h-1 w-1 rounded-full bg-[#d8be92]" />
            <span>Reddit RSS</span>
            <span className="h-1 w-1 rounded-full bg-[#d8be92]" />
            <span>YouTube RSS</span>
          </div>
        </section>

        <section className="relative -mt-7 flex-1 rounded-t-[34px] bg-[#f2ebde] px-6 pb-8 pt-6 text-[#101618]">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[#dce8df] text-[#17624f]">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <p className="text-base font-semibold">Sign in</p>
              <p className="text-sm text-[#6c756d]">Use the credentials in your <code className="rounded bg-black/5 px-1 py-0.5 text-xs">.env</code></p>
            </div>
          </div>

          {serverError && (
            <div className="mt-4 flex items-start gap-3 rounded-[18px] bg-[#f3d8d4] px-4 py-3 text-sm text-[#8c2c31]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Server error</p>
                <p className="mt-1 text-[#8c2c31]/80">{serverError}</p>
              </div>
            </div>
          )}

          <form className="mt-6" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#6d746d]">
                Username
              </span>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                className="h-14 rounded-[18px] border-black/8 bg-white px-4 text-base text-[#101618] placeholder:text-[#7c837d]"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.22em] text-[#6d746d]">
                Password
              </span>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                className="h-14 rounded-[18px] border-black/8 bg-white px-4 text-base text-[#101618] placeholder:text-[#7c837d]"
              />
            </label>

            <Button
              type="submit"
              className="mt-5 h-14 w-full rounded-[18px] bg-[#187e66] text-base text-white shadow-none transition-transform duration-200 active:scale-[0.985]"
              disabled={isSubmitting || !username.trim() || !password}
            >
              {isSubmitting ? "Signing in..." : "Open Feedy"}
              <ArrowRight className="ml-2 size-4" />
            </Button>

            <div className="mt-4 min-h-12">
              {error ? (
                <div className="rounded-[18px] bg-[#f3d8d4] px-4 py-3 text-sm text-[#8c2c31]">
                  {error}
                </div>
              ) : (
                <p className="text-sm leading-6 text-[#6c756d]">
                  Default: admin / clio766028
                </p>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

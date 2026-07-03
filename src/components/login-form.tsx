"use client";

import { useState } from "react";
import { ArrowRight, AlertCircle, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function getErrorMessage(
	errorCode: string | undefined,
): { message: string; countdown?: number } | null {
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
			{/* Error banner */}
			{error ? (
				<div
					role="alert"
					className="mb-6 flex items-start gap-2.5 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3.5 text-sm text-[var(--danger)] animate-in slide-in-from-top-1 fade-in duration-200"
				>
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{error.message}</span>
				</div>
			) : null}

			<form className="space-y-4" action="/api/auth/login" method="post">
				{/* Username field */}
				<div className="space-y-1.5">
					<label
						htmlFor="username"
						className="block text-[13px] font-medium text-[var(--text-secondary)]"
					>
						Username
					</label>
					<Input
						id="username"
						name="username"
						placeholder="Enter your username"
						className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface)] px-4 text-base shadow-sm"
						autoCapitalize="none"
						autoCorrect="off"
						autoComplete="username"
						autoFocus
						required
					/>
				</div>

				{/* Password field */}
				<div className="space-y-1.5">
					<label
						htmlFor="password"
						className="block text-[13px] font-medium text-[var(--text-secondary)]"
					>
						Password
					</label>
					<div className="relative">
						<Input
							id="password"
							name="password"
							placeholder="Enter your password"
							type={showPassword ? "text" : "password"}
							className="h-12 rounded-2xl border-[var(--border)] bg-[var(--surface)] px-4 pr-12 text-base shadow-sm"
							autoComplete="current-password"
							required
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
							aria-label={showPassword ? "Hide password" : "Show password"}
						>
							{showPassword ? (
								<EyeOff className="size-4" />
							) : (
								<Eye className="size-4" />
							)}
						</button>
					</div>
				</div>

				{/* Submit button */}
				<Button
					type="submit"
					size="lg"
					className="mt-2 h-12 w-full rounded-2xl text-base transition-transform duration-200 active:scale-[0.985]"
				>
					Sign in
					<ArrowRight className="ml-2 size-4" />
				</Button>
			</form>

			{/* Footer note */}
			<p className="mt-6 text-center text-[13px] text-[var(--text-tertiary)]">
				Use the credentials configured for this instance.
			</p>
		</>
	);
}

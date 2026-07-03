"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/* ---------- Helpers (exported for unit testing) ---------- */

export function isEscapeKey(event: { key: string }): boolean {
	return event.key === "Escape";
}

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

export function findFirstFocusable(
	container: HTMLElement | null,
): HTMLElement | null {
	if (!container) return null;
	return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

function findFocusableElements(container: HTMLElement | null): HTMLElement[] {
	if (!container) return [];
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	);
}

/* ---------- Default classes (match existing sheets) ---------- */

const DEFAULT_BACKDROP =
	"fixed inset-0 z-50 flex items-end justify-center bg-[var(--text-primary)]/40 px-3 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-8";

const DEFAULT_PANEL =
	"max-h-[min(78vh,720px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-subtle bg-[var(--surface)] p-4 pb-[calc(env(safe-area-inset-bottom)+18px)] shadow-[0_-18px_48px_rgba(0,0,0,0.34)]";

/* ---------- Sheet primitive ---------- */

export function Sheet({
	title,
	subtitle,
	onClose,
	children,
	className,
	panelClassName,
	showHandle = true,
}: {
	title: string;
	subtitle?: React.ReactNode;
	onClose: () => void;
	children?: React.ReactNode;
	className?: string;
	panelClassName?: string;
	showHandle?: boolean;
}) {
	const panelRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const previouslyFocused = useRef<HTMLElement | null>(null);

	useEffect(() => {
		previouslyFocused.current = document.activeElement as HTMLElement;

		// Focus the first interactive control on mount
		const first = findFirstFocusable(panelRef.current);
		first?.focus();

		const handleKeyDown = (event: KeyboardEvent) => {
			if (isEscapeKey(event)) {
				event.stopPropagation();
				onClose();
				return;
			}

			// Focus trap: keep Tab within the sheet
			if (event.key === "Tab") {
				const focusables = findFocusableElements(panelRef.current);
				if (focusables.length === 0) return;

				const firstEl = focusables[0];
				const lastEl = focusables[focusables.length - 1];

				if (event.shiftKey) {
					if (document.activeElement === firstEl) {
						event.preventDefault();
						lastEl.focus();
					}
				} else {
					if (document.activeElement === lastEl) {
						event.preventDefault();
						firstEl.focus();
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
			previouslyFocused.current?.focus();
		};
	}, [onClose]);

	return (
		<div className={className ?? DEFAULT_BACKDROP} onClick={onClose}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className={panelClassName ?? DEFAULT_PANEL}
				onClick={(e) => e.stopPropagation()}
			>
				{showHandle ? (
					<div className="mb-3 flex justify-center">
						<div className="h-1.5 w-11 rounded-full bg-[var(--surface-muted)]" />
					</div>
				) : null}

				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<h3 id={titleId} className="text-[15px] font-semibold">
							{title}
						</h3>
						{subtitle ? (
							<p className="mt-1 text-xs text-secondary">{subtitle}</p>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label={`Close ${title}`}
						className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-subtle bg-[var(--surface)] text-secondary transition duration-200 hover:bg-[var(--surface-muted)]"
					>
						<X className="size-5" />
					</button>
				</div>

				<div className="mt-3">{children}</div>
			</div>
		</div>
	);
}

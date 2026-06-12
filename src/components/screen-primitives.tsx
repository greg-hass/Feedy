"use client";

export function SectionLabel({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]/80">
        {eyebrow}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em]">{title}</h2>
        {meta ? <p className="text-[11px] text-secondary">{meta}</p> : null}
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  columns,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ key: T; label: string }>;
  columns?: string;
}) {
  return (
    <div className={`grid gap-1 rounded-[20px] bg-[var(--surface-strong)] p-1 ${columns ?? `grid-cols-${options.length}`}`}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_10px_22px_rgba(var(--accent-rgb),0.18)]"
                : "text-secondary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

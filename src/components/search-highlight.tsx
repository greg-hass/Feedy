export function SearchHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const trimmed = query.trim();

  if (!trimmed) {
    return <>{text}</>;
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark
            key={`${part}-${index}`}
            className="rounded-[0.25em] bg-[var(--accent-dim)] px-0.5 text-[inherit]"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

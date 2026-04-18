import type { AccentColor } from "@/lib/theme";

const ICON_64_DATA_URL =
  "data:image/jpeg;base64,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";

const ACCENT_HEX_BY_KEY: Record<AccentColor, string> = {
  EMERALD: "#34d399",
  TEAL: "#14b8a6",
  CYAN: "#06b6d4",
  BLUE: "#1da1f2",
  INDIGO: "#6366f1",
  VIOLET: "#a855f7",
  PINK: "#f43f5e",
  ROSE: "#fb7185",
  ORANGE: "#ff7a18",
  AMBER: "#fbbf24",
  LIME: "#84cc16",
  SLATE: "#718096",
};

export function PwaIconArtwork({
  accent,
  size,
}: {
  accent: AccentColor;
  size: number;
}) {
  const accentHex = ACCENT_HEX_BY_KEY[accent] ?? ACCENT_HEX_BY_KEY.EMERALD;
  const maskId = `feedy-icon-mask-${accent.toLowerCase()}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <image
            href={ICON_64_DATA_URL}
            x="0"
            y="0"
            width="64"
            height="64"
            preserveAspectRatio="none"
          />
        </mask>
      </defs>
      <rect width="64" height="64" fill={accentHex} mask={`url(#${maskId})`} />
    </svg>
  );
}

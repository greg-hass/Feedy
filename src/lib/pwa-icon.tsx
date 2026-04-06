import type { AccentColor } from "@/lib/theme";

const EMERALD = "#10b981";
const EMERALD_HIGHLIGHT = "#34d399";
const TILE = "#171717";
const TILE_EDGE = "rgba(255,255,255,0.06)";

export function PwaIconArtwork({
  accent: _accent,
  size,
}: {
  accent: AccentColor;
  size: number;
}) {
  const shadow = "rgba(0,0,0,0.34)";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="14" y="14" width="228" height="228" rx="52" fill={TILE} />
        <rect
          x="14"
          y="14"
          width="228"
          height="228"
          rx="52"
          stroke={TILE_EDGE}
          strokeWidth="2"
        />
        <rect
          x="14"
          y="14"
          width="228"
          height="228"
          rx="52"
          fill="url(#tileShade)"
        />
        <g filter="url(#shadow)">
          <path
            d="M74 76C118 76 154 112 154 156"
            stroke={EMERALD}
            strokeWidth="18"
            strokeLinecap="butt"
          />
          <path
            d="M74 115C96 115 115 134 115 156"
            stroke={EMERALD}
            strokeWidth="18"
            strokeLinecap="butt"
          />
          <circle cx="88" cy="168" r="14" fill={EMERALD} />
        </g>
        <g opacity="0.18">
          <path
            d="M74 76C118 76 154 112 154 156"
            stroke={EMERALD_HIGHLIGHT}
            strokeWidth="3"
            strokeLinecap="butt"
          />
          <path
            d="M74 115C96 115 115 134 115 156"
            stroke={EMERALD_HIGHLIGHT}
            strokeWidth="3"
            strokeLinecap="butt"
          />
          <circle cx="88" cy="168" r="14" stroke={EMERALD_HIGHLIGHT} strokeWidth="2.5" />
        </g>
        <defs>
          <linearGradient id="tileShade" x1="30" y1="24" x2="222" y2="232" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(255,255,255,0.05)" />
            <stop offset="0.4" stopColor="rgba(255,255,255,0.01)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.08)" />
          </linearGradient>
          <filter id="shadow" x="56" y="62" width="120" height="132" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor={shadow} />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

export const accentKeys = [
  "EMERALD",
  "BLUE",
  "INDIGO",
  "VIOLET",
  "PINK",
  "ORANGE",
  "AMBER",
  "LIME",
  "CYAN",
  "TEAL",
  "SLATE",
] as const;

export const accentOptions = [
  { key: "EMERALD", label: "Emerald", hex: "#34d399" },
  { key: "BLUE", label: "Blue", hex: "#1da1f2" },
  { key: "INDIGO", label: "Indigo", hex: "#6366f1" },
  { key: "VIOLET", label: "Violet", hex: "#a855f7" },
  { key: "PINK", label: "Pink", hex: "#f43f5e" },
  { key: "ORANGE", label: "Orange", hex: "#ff7a18" },
  { key: "AMBER", label: "Amber", hex: "#fbbf24" },
  { key: "LIME", label: "Lime", hex: "#84cc16" },
  { key: "CYAN", label: "Cyan", hex: "#06b6d4" },
  { key: "TEAL", label: "Teal", hex: "#14b8a6" },
  { key: "SLATE", label: "Slate", hex: "#718096" },
] as const;

export type AccentColor = (typeof accentKeys)[number];

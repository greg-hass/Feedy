export const accentKeys = [
  "EMERALD",
  "TEAL",
  "CYAN",
  "BLUE",
  "INDIGO",
  "VIOLET",
  "PINK",
  "ROSE",
  "ORANGE",
  "AMBER",
  "LIME",
  "SLATE",
] as const;

export const accentOptions = [
  { key: "EMERALD", label: "Emerald", hex: "#34d399" },
  { key: "TEAL", label: "Teal", hex: "#14b8a6" },
  { key: "CYAN", label: "Cyan", hex: "#06b6d4" },
  { key: "BLUE", label: "Blue", hex: "#1da1f2" },
  { key: "INDIGO", label: "Indigo", hex: "#6366f1" },
  { key: "VIOLET", label: "Violet", hex: "#a855f7" },
  { key: "PINK", label: "Pink", hex: "#f43f5e" },
  { key: "ROSE", label: "Rose", hex: "#fb7185" },
  { key: "ORANGE", label: "Orange", hex: "#ff7a18" },
  { key: "AMBER", label: "Amber", hex: "#fbbf24" },
  { key: "LIME", label: "Lime", hex: "#84cc16" },
  { key: "SLATE", label: "Slate", hex: "#718096" },
] as const;

export type AccentColor = (typeof accentKeys)[number];

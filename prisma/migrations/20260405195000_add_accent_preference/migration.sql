CREATE TYPE "AccentPreference" AS ENUM (
  'EMERALD',
  'BLUE',
  'INDIGO',
  'VIOLET',
  'PINK',
  'ORANGE',
  'AMBER',
  'LIME',
  'CYAN',
  'TEAL',
  'SLATE'
);

ALTER TABLE "Settings"
ADD COLUMN "accentColor" "AccentPreference" NOT NULL DEFAULT 'EMERALD';

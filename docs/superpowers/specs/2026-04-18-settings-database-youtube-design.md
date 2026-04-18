# Feedy Settings, Storage, and Playback Surface Design

## Goal

Give Settings a useful database/status section, add safe cleanup controls for stored articles, keep YouTube playback alive when switching tabs or backgrounding the app, and stop YouTube bookmarks from drawing an extra overlay badge on thumbnails.

## Scope

In scope:
- Database/storage visibility in Settings.
- Safe purge actions that never delete bookmarked items.
- YouTube playback persistence across bottom-tab switches and app backgrounding.
- Removing the bookmark overlay badge from YouTube thumbnails/video cards.

Out of scope:
- Changing how feeds are parsed or ingested.
- Deleting bookmarked items in any purge mode.
- Reworking the general reader layout again.

## Current State

Settings already has theme, refresh cadence, device, retention, and import/export cards in [`src/components/screens.tsx`](/Users/greg/Projects/Feedy/src/components/screens.tsx).

The app already stores user settings and item data in Postgres, and the timeline/reader paths already know whether an item is bookmarked, read, or YouTube-backed.

YouTube playback is currently handled by the inline player plus a hidden background player in [`src/components/providers.tsx`](/Users/greg/Projects/Feedy/src/components/providers.tsx), and the card renderer in [`src/components/item-card.tsx`](/Users/greg/Projects/Feedy/src/components/item-card.tsx) still draws a bookmark overlay on bookmarked thumbnails.

## Design

### 1. Settings data panel

Add a new `Database` card to Settings with compact status rows:
- Database size.
- Total feeds stored.
- Total articles stored.
- Retention window in days.
- Oldest stored article age.

The panel should read like a health summary, not an admin console. The user should be able to see at a glance how much data exists and how long it has been accumulating.

Recommended layout:
- A top summary row with the most useful counts.
- A second row that shows retention and the age of the oldest stored article.
- A third row for purge actions.

### 2. Safe purge controls

Provide purge actions that only remove:
- read items
- older than the chosen retention threshold
- not bookmarked

Recommended controls:
- `Purge now` using the current retention setting.
- `Preview purge` showing how many items would be removed before confirmation.
- Optional quick presets for common cleanup windows if they are useful in practice.

Safety rules:
- Bookmarked items are never eligible for deletion.
- Unread items are never eligible for deletion.
- The confirmation copy should state exactly how many items will be deleted.
- If a purge would remove zero items, the UI should say so and avoid a destructive confirmation.

### 3. YouTube playback persistence

Keep the current inline YouTube experience, but make the playback session survive:
- switching bottom tabs inside Feedy
- leaving the visible app shell temporarily
- returning to the source tab

The playback model should be:
- one active YouTube session in shared app state
- the visible card/player owns the user-facing UI
- a hidden background player stays mounted when the user leaves the source tab so audio keeps playing
- when the user returns to the source tab, the inline player should resume from the shared session state instead of restarting

The important rule is that tab switches must not destroy playback. The session should remain active until the user explicitly pauses, closes, or finishes the video.

### 4. YouTube bookmark overlay cleanup

Remove the top-right bookmark overlay badge from YouTube thumbnails and inline YouTube video surfaces.

Keep bookmark functionality itself:
- the bookmark action in the card footer stays
- bookmarked state still persists
- non-YouTube cards can keep their existing thumbnail/bookmark treatment

This rule is visual only. It should not change whether an item is bookmarked or how bookmark state is stored.

## Data and API Shape

Add a dedicated storage/status response rather than overloading the normal settings mutation route.

Suggested API surface:
- `GET /api/settings/storage` for counts, size, age, and retention data.
- `POST /api/settings/purge` for destructive cleanup after confirmation.

The storage response should include:
- `databaseSizeBytes`
- `feedCount`
- `articleCount`
- `bookmarkedArticleCount`
- `readArticleCount`
- `oldestArticlePublishedAt`
- `retentionDays`
- `purgeEligibleCount`

The purge endpoint should accept:
- `retentionDays` or a preset key
- `dryRun` for preview counts

The server should calculate the deletion set with the bookmark exclusion enforced centrally, not in the client.

## UX Rules

- Settings should stay visually consistent with the existing rounded card style.
- Database metrics should fit on mobile without horizontal scrolling.
- Purge actions should be clearly separated from passive status metrics.
- Destructive actions need a confirmation step with a concrete item count.
- YouTube playback should feel continuous when moving between tabs, not like a new page load.

## Verification

- Typecheck the touched files.
- Run ESLint on the touched components and routes.
- Smoke test Settings on mobile width.
- Verify a YouTube video keeps playing audio when switching tabs.
- Verify returning to the original tab restores the same inline player state.
- Verify bookmarked YouTube items no longer show the overlay badge.

## Non-Goals

- No bookmarked-item purge path.
- No new feed ingest behavior.
- No changes to article ranking or search.
- No reader chrome redesign beyond what is required to support these features.

# YouTube Thumbnail Quality Design

## Goal

Display the best available YouTube thumbnail in Feedy, matching the quality-first fallback behavior used by `youtube-subscriptions`, while showing portrait thumbnails for videos already identified as Shorts.

## Current Problem

Feedy generates `maxresdefault` candidates, but server preview resolution currently tests the thumbnail supplied by the RSS feed first. If that lower-resolution asset is valid, it is persisted and displayed even when a sharper YouTube asset is available. The client fallback list also places that persisted asset before generated candidates and ranks `mqdefault` before larger alternatives.

Feedy already persists `youtubeIsShort`, but that classification is computed in refresh processing after server preview resolution. Trying to select portrait assets during parsing would require additional or reorganized remote probing.

## Design

`src/lib/feed/youtube-thumbnail.ts` becomes the shared thumbnail-candidate policy. For ordinary videos it returns candidates in quality order:

1. `maxresdefault`
2. `hq720`
3. `sddefault`
4. `hqdefault`
5. `mqdefault`
6. `0`
7. `default`

For known Shorts, the policy prepends portrait candidates:

1. `oar2`
2. `maxres2`
3. `hq2`
4. `frame0`

The existing stored/RSS thumbnail is retained as a final distinct compatibility fallback rather than receiving priority over quality candidates.

`src/lib/feed/youtube-preview.ts` resolves stored previews by probing the ordered landscape candidates first, then YouTube metadata-derived URLs and the RSS-provided URL. It continues using response and placeholder checks, so an unavailable or placeholder maximum-resolution asset falls through to the next usable candidate.

`youtubeIsShort` is exposed through item serialization. `src/components/item-card.tsx` uses the shared policy with that flag so known Shorts try portrait candidates on display, while normal YouTube cards try landscape candidates. Short cards use a portrait aspect ratio so the selected portrait artwork is visible rather than cropped into a landscape frame.

## Data Flow

1. YouTube refresh parses an item and resolves the highest usable landscape preview for persisted `mediaUrl`.
2. Existing refresh processing probes the video for Shorts status and persists `youtubeIsShort`.
3. Timeline queries serialize `youtubeIsShort`.
4. Item cards construct candidate URLs from `youtubeVideoId`, `youtubeIsShort`, and `mediaUrl`.
5. Image load failures advance through the ordered candidate list.

## Compatibility And Risk

- No schema migration is required because `youtubeIsShort` already exists in the database.
- Existing non-YouTube media behavior is unchanged.
- Server preview selection remains landscape because Shorts status is not available until later in the current refresh pipeline.
- The extra `hq720` candidate may incur one additional failed image request only when higher-resolution variants are unavailable; it improves image quality when YouTube provides the asset.

## Testing

- Unit test quality ordering for standard YouTube thumbnails.
- Unit test portrait-first ordering for known Shorts and final stored fallback retention.
- Regression test server preview selection: an RSS thumbnail must not win before an available generated maximum-resolution asset.
- Run the complete test, lint, and production build suite.

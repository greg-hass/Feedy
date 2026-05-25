# Reddit Preview Quality And Retention Design

## Goal

Add a 14-day item-retention option in Settings and show higher-resolution Reddit preview images whenever Reddit includes them in its Atom feed payload.

## Current Problem

Settings offers retention choices from 30 days upward, and API validation rejects any shorter value. Reddit Atom entries can contain both a small `media:thumbnail` URL and higher-resolution image links inside the HTML content. Feedy currently persists the small thumbnail, so an approximately 140-pixel image is expanded into a full-width timeline card.

## Design

The retention change is confined to the existing setting: the API accepts a minimum of 14 days and the Settings retention button row exposes `14d` alongside the existing presets. No database migration is needed because the stored value is already an integer and cleanup uses it as a day count.

For Reddit items, feed parsing inspects the already-received entry content for image URLs hosted by Reddit media endpoints (`preview.redd.it`, `i.redd.it`, or `external-preview.redd.it`). It decodes HTML entity escaping, prefers a candidate whose URL advertises a width larger than the RSS thumbnail, and otherwise retains existing enclosure/thumbnail behavior. This deliberately does not issue per-post API requests or rewrite Reddit's signed thumbnail URLs.

## Data Flow

1. A Reddit Atom feed refresh retrieves an entry once through the existing safe outbound request path.
2. The parser reads `media:thumbnail` and searches the entry HTML for eligible Reddit image URLs.
3. When a higher-resolution content candidate exists, it is stored as `mediaUrl`; otherwise the thumbnail remains the fallback.
4. Existing item-card display renders the stored URL without component changes.
5. A user may set retention to 14 days through the existing settings mutation; existing scheduled cleanup observes that value.

## Compatibility And Risk

- Existing saved items are not rewritten until their feed items are refreshed.
- Reddit text-only posts and feeds without a larger content image behave exactly as before.
- Restricting extraction to known Reddit image hosts prevents arbitrary content links from becoming card images.
- Gallery posts display the first suitable large image, matching the existing single-thumbnail card model.

## Testing

- Validate that Settings accepts a 14-day retention value and continues rejecting values below it.
- Parse a Reddit Atom entry containing both 140-pixel thumbnail and 1080-pixel content preview, asserting that the large URL becomes `mediaUrl`.
- Parse a Reddit entry with only a thumbnail, asserting existing fallback behavior.
- Run the full tests, lint, and production build.

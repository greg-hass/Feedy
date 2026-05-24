# Stage 3 Product Polish Design

## Goal

Make the now-hardened application clearer and smoother for everyday users without adding schema changes or new operational dependencies.

## Scope

This pass addresses three remaining user-facing gaps:

1. The import/export screen does not tell users about the newly enforced workload limits, and JSON export failures are hidden behind a plain download link.
2. Eight image render sites still use raw `img` elements, leaving known Next.js image/perceived-load warnings unresolved.
3. The README does not describe readiness checks, limits, or the strengthened publication gate introduced by the reliability work.

## Import And Export Experience

The import/export screen will present limits before work starts: OPML imports accept files up to 1 MB and 500 subscriptions, while application-level JSON exports support libraries containing up to 25,000 articles. The JSON export button will initiate the fetch in the client, show progress, surface the API error text on rejection, and download the response only on success. The Settings shortcut will send users to this managed backup screen instead of beginning an opaque direct download.

Formatting the OPML completion message belongs in a small pure helper so it can be tested independently from the large screen component.

## Image Rendering

Use `next/image` according to source ownership:

- Static local application icons and finite local icon variants use ordinary `Image` optimization with declared dimensions.
- Dynamic app icon responses and arbitrary remote feed/discovery/media URLs use `Image` with `unoptimized`, dimensions or `fill`, and existing lazy-loading/error fallback behavior. This removes layout and lint deficiencies without sending attacker-controlled remote media through Next's optimizer.

No remote host allowlist or image proxy is added in this pass.

## Documentation

Update `README.md` to state:

- `/api/health` checks PostgreSQL and Redis and reports unavailable dependencies.
- OPML, JSON export, refresh, and per-feed processing limits.
- JSON export is portability-oriented; database and app-data volume backups are required for larger/full recovery cases.
- Image publication is gated on tests, lint, Prisma validation, audit, and a production build.

## Testing And Success Criteria

Add unit coverage for the imported/duplicate/failed OPML summary message. Existing UI compilation and lint validate `Image` integration. Final verification runs tests, lint, production build, Prisma validation, dependency audit, Docker Compose configuration validation, and whitespace validation.

Success means JSON backup failures are visible in the UI, limit guidance is stated where users need it, image warnings are removed without expanding SSRF exposure, and operational documentation matches behavior.

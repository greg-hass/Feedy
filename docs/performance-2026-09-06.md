# Refresh performance cuts — 6 September 2026

## Changes

- `src/components/refresh-button.tsx`: stop refetching every loaded timeline page on every refresh-status update and parent render. The caller used a new array for the effect dependency on each render, creating a feedback loop through the timeline query's fetching state. Use a scalar query prefix and refetch once when the batch completes. Stop status polling at completion. Preserve a one-time refetch for zero-queued responses.
- `src/components/unread-screen.tsx`: pass the scalar query prefix.
- `src/components/providers.tsx`: remove the global playback host. Both controlling states were permanently null with no setters, so this host could never play anything. Actual inline YouTube players remain in the item card and reader.
- Delete the now-unused `youtube-playback-session` helpers and their six tests. Add a mounted React Query regression test for render/poll amplification and completion cleanup.

## Controlled Chromium measurement

The browser fixture bundled the actual production refresh hook and React Query with esbuild in production mode. It loaded three pages of 100 articles, used simulated 5 ms responses, started a two-feed batch, observed 600 ms of activity, completed the batch, and observed another 1,800 ms. The before build was captured from the working tree after the earlier code cleanup and before these performance edits.

| Counter | Before | After |
| --- | ---: | ---: |
| Initial page requests | 3 | 3 |
| Page requests added during active batch | 121 | 0 |
| Page requests added across the entire refresh measurement | 484 | 3 |
| Render calls added across the measurement | 163 | 8 |
| State after completion window | done | idle |

This is a 99.4% reduction in timeline page-query calls in this fixture. Exact counts depend on machine speed and response latency. It is evidence of eliminating request amplification, not a production latency or database-throughput benchmark. The old completion timer was repeatedly reset by renders, leaving the controller in `done`; the fixed controller settled to `idle`.

The committed regression test exercises the actual hook with React Query: 20 unrelated renders and an unfinished status update trigger zero timeline reloads; completion triggers one reload and returns to idle. Run it with:

```sh
npx tsx --test src/components/refresh-button.test.tsx
```

## Production bundle measurement

Collect the distinct script URLs in the server-rendered `/login` response, read their production build files, and sum raw bytes and gzip-compressed bytes. Both builds used the same dependencies and configuration.

| Initial login JavaScript | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Raw bytes | 734,686 | 729,628 | 5,058 |
| Gzip bytes | 221,220 | 219,467 | 1,753 |
| Script chunks | 12 | 12 | 0 |

The playback-host cut is a modest bundle saving. The refresh-loop fix is the major performance improvement.

## Verification and limits

- ESLint passed without warnings.
- Full test suite passed: 211 tests.
- Production build passed. Existing icon-route file-tracing and Node `url.parse()` warnings remain.
- Standalone production server started; Chromium rendered the login form. Its unauthenticated `/api/me` request returned the expected 401; no JavaScript exception was observed.
- Docker is unavailable, and the configured LAN deployment was unreachable. No production database benchmarks, authenticated end-to-end session, or Docker service-health validation were performed.
- Manual refresh intentionally publishes timeline changes once the batch completes, while status polling continues to show progress.
- No deployment, dependency, schema, or persistent-data changes.

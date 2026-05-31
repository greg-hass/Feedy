# Troubleshooting

## App will not start

- Check `APP_URL`, `AUTH_SECRET`, `APP_USERNAME`, and `APP_PASSWORD`.
- Public deployments must use HTTPS with `COOKIE_SECURE=true`.
- Startup fails if the database already contains multiple users. Run:

```bash
npm run repair:single-user
```

## Web UI loads but no feeds refresh

- Confirm Redis is reachable.
- Confirm the worker container is running.
- Check `/api/health` for dependency readiness.
- Look for refresh failures in PostgreSQL `RefreshJob` and `RefreshLog`.

## Feed import or refresh is slow

- Large YouTube feeds can still be expensive to parse.
- Navigation performance stats scan recent refresh logs and are refreshed on a poll interval.
- Reader extraction does an outbound fetch only when `readabilityHtml` is missing.

## Discovery returns weak results

- Discovery is keyword-driven and depends on search engine visibility.
- Try a direct feed URL or a source-specific URL such as Reddit `.rss` or YouTube channel/playlist RSS.

## Need to verify the system

Useful checks:

```bash
npm test
npm run lint
npm run build
curl http://localhost:4000/api/health
```


# Deployment and recovery runbook

The application has been built and tested locally. It has not been publicly deployed. Complete the release gates below before inviting users to a public service.

## Release gates still requiring infrastructure or browser access

- Verify desktop/mobile layouts, dark mode, keyboard focus, chart hydration/tooltips, modal workflows, and downloads in real browsers. The browser tool was blocked by URL policy during this build, so HTTP tests are not browser end-to-end certification.
- Configure trusted password-recovery email delivery and verify ownership of email addresses. Recovery token architecture exists, but public email delivery, verification, and reset UI are not activated. Do not advertise working password recovery.
- Provision a domain, valid TLS certificate, production PostgreSQL, restricted runtime credentials, backups, monitoring, and edge abuse controls. Verify production HTTPS through the actual reverse proxy/CDN.
- Run a restore drill against the chosen production backup mechanism. The included local drill verifies synthetic PostgreSQL data and policies, not a provider's backup service.

## Build and deploy

1. Use Node.js 22.18+ and PostgreSQL 18, the versions tested here. Install the committed lockfile with `npm ci` in an isolated build environment.
2. Create a migration role and a separate runtime role. Runtime must not be a superuser, have BYPASSRLS or CREATEROLE, own financial tables, or belong to an owning role. Do not grant it membership in the migration role. Use TLS for remote database connections and private network access where available.
3. Provide `DATABASE_URL`, exact HTTPS `APP_ORIGIN`, and a cryptographically generated `AUTH_SECRET` of at least 32 characters through a secret manager. `DIRECT_URL` is for the migration job, not the running service. Never copy development `.env` files or the local database into an image or public folder.
4. Generate the Prisma client with `npm run db:generate`. Run `npm run db:migrate` as the migration role in a controlled job. Preserve backups before schema changes; migrations are forward-only. Reapply runtime table/schema permissions after restoring without ACLs.
5. Run `npm run check` against dedicated `_test` databases, then `npm run build`. The build process must not run the recurring worker. `npm run start` starts the Node server bound to loopback; expose it through a trusted TLS reverse proxy on the same host, or explicitly configure the bind address for a private container network.
6. Proxy the canonical HTTPS origin without rewriting origin validation. Do not derive session security from untrusted forwarded headers. Preserve CSP and security response headers. Do not cache authenticated pages, API responses, or downloads. Nonce-bearing pages are dynamic and require per-request rendering; static export is unsupported.
7. Poll `GET /api/health` for readiness: 200 with `{ "status": "ok" }`, otherwise generic 503. It validates configuration, runtime protection at first use, and database availability. It exposes no credentials or database exception text. Restart instances after privilege/policy changes to rerun the cached role gate.
8. Enable `RECURRING_WORKER_ENABLED=1` only on a continuously running server. The worker catches up in batches of at most 100 occurrences per user/pass, and occurrence keys prevent duplicate posting across processes. A sleeping/serverless host needs a durable external scheduler; an interval alone cannot promise execution while the host is stopped.

## Security behavior and operational controls

- Per-request random script nonces and `strict-dynamic` replace arbitrary inline script execution. Production excludes `unsafe-eval`; development allows it for framework debugging. Inline **styles** remain allowed because the chart/layout components use style attributes. This is a deliberate compatibility limit, not permission for arbitrary inline scripts.
- Passwords use salted scrypt. Sessions are hashed, revocable, HttpOnly/SameSite=Lax, and use Secure `__Host-` cookies in production. Mutations require the configured origin, authenticated ownership, and strict payloads. JSON request bodies are capped at 16 KiB.
- Authentication has database-backed global and per-identifier limits. Global limits run first to bound per-email row creation. Downloads are capped at ten per user per fifteen minutes. 429 responses include a conservative 900-second Retry-After. Add edge rate limits and request/concurrency limits at the trusted proxy; application limits are not a DDoS defense.
- Fourteen financial tables use FORCE RLS plus owner constraints. The runtime gate rejects unsafe roles and missing RLS/policies. Cross-user read/write isolation is tested directly and through APIs.
- Logs intentionally omit request bodies, cookies, passwords, connection URLs, and financial payloads. Configure infrastructure logs with the same exclusions. Alert on readiness failures, elevated 5xx/429 rates, worker error events, database saturation, and backup failures. Never log reset tokens or query strings containing them.
- Periodically remove expired sessions/reset tokens and obsolete limiter windows using a maintenance job with narrow credentials. Do not delete current windows. Rotate `AUTH_SECRET` deliberately: it invalidates existing session/reset hashes. Rotate database secrets separately.
- JSON exports are portable records, not a tested restore API. CSV exports quote fields and neutralize spreadsheet formula prefixes; formula-like text may display a leading apostrophe. Large exports currently materialize in memory; add streaming/resource limits before supporting very large workspaces.

## Backup and recovery

Keep encrypted backups outside the application host, with access restricted independently of runtime credentials. Select recovery-point, retention, and recovery-time requirements for the deployment, and monitor successful completion rather than only scheduled execution.

The local synthetic test is `node scripts/verify-restore.mjs`. It requires local `TEST_DIRECT_URL` and PostgreSQL utilities (override `PG_BIN` if needed). It creates two randomly named isolated databases, migrates one, inserts synthetic records, runs custom-format `pg_dump`/`pg_restore`, verifies exact money, migration history, and all 14 forced-RLS tables, then removes only its own databases and temporary dump. It never dumps the application database.

For an actual incident: stop writes/worker execution; preserve the failing database and logs; restore an encrypted backup into a new database; provision the separate migration/runtime roles and grants; verify migration history, constraints, RLS, record counts and representative reconciliations; run readiness and authenticated smoke checks through HTTPS; switch the application connection only after verification. Keep the old database until recovery is confirmed. Do not restore an unverified dump over the only copy of live data.

## Local production-mode verification

`scripts/verify-live.mjs` creates and cleans up one exact synthetic account. It checks all core workflows, API boundaries, nonces in rendered HTML, secure-cookie flags when the configured origin is HTTPS, and background posting. It refuses non-loopback origins/transports.

For testing the production Node server behind a simulated local TLS edge, set `APP_ORIGIN=https://127.0.0.1:3000` and `RECURRING_WORKER_ENABLED=1` on `npm run start`. Run the smoke script with that same APP_ORIGIN and `LOCAL_SMOKE_BASE_URL=http://127.0.0.1:3000`. The script supplies the configured Origin and cookies directly. This validates production server behavior over a loopback transport; it **does not** validate a TLS certificate, browser Secure-cookie behavior, or an actual reverse proxy. Keep this override confined to the test command; do not change real production origins to loopback.

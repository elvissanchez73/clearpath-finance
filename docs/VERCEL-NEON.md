# Vercel Hobby + Neon

Production: https://clearpath-finance-mu.vercel.app

Deployed on 2026-09-28 with Node.js 22.x. Production HTTPS checks passed for health/readiness, nonce CSP, secure cookies, registration of two independent accounts, cross-owner denial, persisted balances after logout/login, origin validation, recurring catch-up and authenticated cron. The synthetic accounts were removed afterward. Visual browser QA and email recovery remain outstanding.

Deploy the repository root (the directory containing package.json) as a Next.js project, using Node.js 22.x. Use the repository's actual production branch; this checkout tracks `main`. No Render service or Django rewrite is needed.

## Production environment variables

- `DATABASE_URL`: pooled Neon URL for SQL-created `clearpath_app`, with `connection_limit=3`, `connect_timeout=30`, and `pool_timeout=30`.
- `DIRECT_URL`: on Vercel, set this to the same restricted runtime URL. The deployed website does not run migrations or need owner credentials.
- `AUTH_SECRET`: random secret of at least 32 characters; keep stable across deployments to preserve sessions.
- `CRON_SECRET`: a separate random secret of at least 32 characters. Vercel sends this in the scheduled request's Authorization header.
- `APP_ORIGIN`: exact canonical HTTPS website origin, without a trailing slash. Set it after the project's domain is assigned, then deploy again if necessary.
- `RECURRING_WORKER_ENABLED`: `0`.

Do not expose secrets with NEXT_PUBLIC variables. Do not give preview deployments production database credentials. The build runs Prisma generation and Next.js compilation, never migrations.

Deployment credentials on the setup computer are in ignored `.local/vercel-production.env`; it deliberately omits APP_ORIGIN until the Vercel domain is known. Owner migration credentials are separate in `.local/neon-migrations.env`. Never commit or share these files. Existing local `.env` continues to use the local database.

## Database and migrations

The initial Neon database was bootstrapped with the four committed migration SQL files in a single transaction after the local Prisma schema engine failed to connect. SHA-256 checksums and completion records are stored in `_prisma_migrations`. All 18 application tables were created; 14 financial tables have FORCE ROW LEVEL SECURITY. `clearpath_app` is SQL-created, cannot create roles or bypass RLS, and does not inherit table ownership. It receives DML rights on app tables but not migration history.

The Node PostgreSQL client verified the restricted pooled connection. Local Prisma reported a Windows TLS security-package error; the deployed Linux runtime passed `/api/health` and authenticated read/write checks against Neon.

For later releases, run `npm run db:migrate` in a controlled environment with migration-owner DATABASE_URL and DIRECT_URL. Review changes first and back up existing production data. Grant `clearpath_app` only the required rights on any newly added tables. Do not run local integration tests against production.

## Recurring transactions

`vercel.json` schedules `/api/cron/recurring` once daily at 10:00 UTC. Hobby timing is approximate and quota-limited. The route requires CRON_SECRET, processes at most 100 owners, rotates their ordering daily, and stops starting work after 40 seconds. Each owner has a 15-second share. Large backlogs may need later passes; response fields report failures and incomplete work.

Opening the authenticated workspace also runs owner-only catch-up, then every five minutes while visible. The manual recurring action remains available. Date eligibility uses the account's timezone. Occurrence uniqueness and owner locks prevent duplicate posting when requests overlap. The continuous local worker is disabled automatically on Vercel.

## Verify after deploying

Check `/api/health` returns 200. Register separate accounts for each person and verify login, saving an account/transaction, signing out and back in, and viewing data from another device. Check Vercel cron logs after its first invocation. Set up backups/exports and test recovery. Password recovery email is not yet configured; choose and retain your passwords carefully.

Data lives in Neon independently of the computer. Local development data is not automatically copied. Free hosting remains subject to each provider's quotas and policies; this setup does not enable paid plans.

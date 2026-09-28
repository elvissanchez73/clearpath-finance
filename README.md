# Clearpath — personal finance

A personal finance application being built in the nine phases from the supplied brief. **Phases 1–8 are implemented:** secure private workspaces, accounts, categories, transactions, transfers, calculated balances, searchable history, monthly budgets, savings goals, linked contributions, projections, and a savings roadmap. Recurring schedules, subscriptions, income planning, and a retirement contribution API foundation are also implemented. Interactive analytics and dashboard charts are implemented. Calendar and monthly review are implemented.

Start with [the complete architecture, database design, routes, calculation rules, and phase plan](docs/ARCHITECTURE.md).

## Phase 9 local hardening

- Per-request script nonces with `strict-dynamic`, no production inline-script/eval permission, and dynamic uncached rendering. Inline styles remain permitted for chart/layout compatibility.
- Runtime protection validates all 14 financial tables and rejects privileged roles, owning-role membership, missing forced RLS, and missing policies. `GET /api/health` provides minimal readiness status without exposing errors.
- Global authentication limits now run before per-email limits. Downloads are limited to ten per user per fifteen minutes; 429 responses include retry guidance.
- `node scripts/verify-restore.mjs` verifies synthetic isolated PostgreSQL dump/restore, exact financial rows, migration history, and RLS restoration.
- Full and production dependency audits reported no known vulnerabilities at verification time. This does not guarantee absence of undiscovered vulnerabilities.
- [Deployment and recovery runbook](docs/DEPLOYMENT.md) documents migrations, runtime credentials, TLS, caching, workers, monitoring, backups, and outstanding release gates. No public deployment is claimed.

### Phase 8 features

- `/onboarding`: five resumable steps using the real income, account, category/budget, and goal forms. New registrations open setup; each step is optional. Skip/finish opens Overview, and Settings can revisit setup. No shared demo records are created.
- Settings adds monthly net-income/cash-savings defaults, in-app due-item reminder preferences, and CSV/JSON downloads. Defaults prefill unsaved budget editors without overwriting existing plans or changing roadmap assumptions. Currency remains USD; themes and time zones retain their existing controls. Reminder delivery is in-app only.
- `/retirement`: manually reported current balance; salary and employee/employer percentage assumptions; exact annual/monthly estimates; actual contribution creation, editing, deletion, monthly totals, and year-through-selected-month totals. Employer assumptions default to zero. Contributions never change cash balances or the manually reported retirement balance.
- Retirement settings and entry edits use saved revision checks. The UI sends a stable UUID on contribution creation so retries cannot duplicate the same entry. The contribution POST API accepts optional `requestId` for compatibility; callers should supply one per intended entry.
- `GET /api/export?format=csv&from=YYYY-MM-DD&to=YYYY-MM-DD` downloads all matching owned transactions. Dates are optional. Quoted CSV cells neutralize spreadsheet formula prefixes in user-entered text. `format=json` exports the whole private financial workspace with schema version 1 and exact minor-unit strings; passwords, sessions, reset tokens, and server configuration are excluded. JSON date filters are rejected. Downloads are private/no-store; import/restore is not implemented.
- Mobile navigation has a More menu; forms/lists use shared light/dark/system tokens, loading skeletons, a retryable page error state, keyboard focus styles, and a skip-to-content link. Visual browser QA remains outstanding.
- Upgrade existing installs with `npm run db:generate` and `npm run db:migrate`. Migration `20260928010000_preferences_retirement` adds setup progress, separate budget-savings defaults, and retirement contribution revisions/retry keys. The existing 14 financial tables retain FORCE RLS.

### Phase 7 features

- `/calendar?month=YYYY-MM`: a desktop month grid and mobile day list with expandable payday, bill, subscription, transfer, and savings details. Recorded, scheduled, skipped, and removed entries are distinct. Overdue forecasts are labelled; no item implies that a bank payment has been executed.
- Forecasts use active recurring plans starting at their next due date. They preserve month-end, leap-year, and twice-monthly anchors and jump directly to distant months. They are projections of current settings, not historical plan snapshots. Recorded occurrences suppress duplicate forecasts, even after a transaction is moved or deleted.
- `/review?month=YYYY-MM`: actual income, budgeted/actual spending, cash savings, separate retirement contributions, budget variance, savings rate, net cash flow, largest category, category comparisons, and goal progress through month-end.
- Reviews are automatically generated on opening. Current-month reviews are partial and future reviews are labelled. Historical corrections recalculate past reviews. Goal history uses current opening allocations/targets and linked transfers through the selected month, so it is explicitly reconstructed rather than a frozen statement.
- Category comparisons use recorded expenses, with no assumption that an empty previous month proves zero real-world spending. Missing budgets remain distinct from explicit zero allocations. Scheduled items never enter actual review totals.
- Authenticated `GET /api/calendar?month=YYYY-MM` and `GET /api/review?month=YYYY-MM` reject extra input fields and return owner-scoped private/no-store data. No database migration is required for Phase 7.

### Phase 6 features

- `/analytics` includes spending by category, budget versus actual, income/spending/savings trends, savings rate, net cash flow, current goal progress, and reconstructed account balance history.
- Select 1, 3, or 6 months, 1 year, or all time through a selected month. All time starts at the earliest recorded transaction or saved budget. Ranges longer than ten years use annual chart points; partial years are labelled.
- The account selector affects balance history only. Transfers cancel across all accounts and appear on each individual account's appropriate side. Archived accounts and categories retain their history.
- Interactive series toggles, tooltips, responsive Recharts, exact-data tables, and category links to filtered transactions. The dashboard shows only two compact charts.
- No income produces an undefined savings rate, rather than zero. Missing budget allocations are distinct from explicit zero budgets. The chart shows the ten largest spending categories; the complete category table remains available.
- Account history is reconstructed from current starting balances and recorded transactions, because opening balances have no effective dates. It is not verified historical bank data. Goal progress is current regardless of the chosen historical range. Current-month totals are partial.
- `GET /api/analytics?month=2026-09&range=6&account=...` requires a session. Range accepts `1`, `3`, `6`, `12`, or `all`; account is optional. Unknown input keys are rejected. Results are owner-scoped and private/no-store. No new migration is needed for Phase 6.

### Phase 5 features

- `/recurring`: daily, weekly, biweekly, twice-monthly, monthly, and yearly schedules; manual confirmation or automatic entry creation; skip, edit, deactivate, and protected deletion.
- `/subscriptions`: active subscription monthly/annual equivalents using 365/52/26/24/12/1 occurrences per year. These are estimates, not a count of actual calendar charges.
- `/income`: actual monthly net income, optional recorded gross/deductions, salary assumptions, explicit take-home pay, and recurring income. Gross salary is never assumed to be spendable cash.
- Retirement contributions have a separate authenticated API foundation with employee and employer amounts and monthly/year-to-selected-month totals. Full retirement management UI is planned for Phase 8.
- Upgrade with `npm run db:migrate` and `npm run db:generate`. Migration `20260927020000_recurring_income` adds three protected tables, bringing the total to 14 financial tables with FORCE RLS.

The Node background worker runs once per minute, plus a startup catch-up. It is enabled by default in development. Production requires `RECURRING_WORKER_ENABLED=1` on a continuously running Node server; `0` disables it. Do not enable it for build jobs. A sleeping/serverless host cannot guarantee scheduled runs. Each pass examines at most 100 occurrences per user; later passes continue catch-up. Schedules record ledger entries only, and never initiate bank payments. Reminder mode shows due items in the app; email/push delivery is not implemented.

Occurrence records prevent duplicates even if a generated transaction is deleted. Month-end and leap-year schedules preserve their original calendar anchor. Blocked schedules display an error while other schedules continue.

### Phase 1 foundation

- Next.js 16 / React 19 / strict TypeScript / Tailwind 4.
- PostgreSQL 18 tested locally; Prisma 6.19 with a committed migration.
- Signup, login, logout, salted scrypt passwords, revocable server sessions.
- Server-protected pages and APIs, strict validation, origin checks, auth rate limiting.
- PostgreSQL FORCE RLS for every financial table, composite owner foreign keys, non-bypass runtime role.
- Profile name, light/dark/system appearance, time zone, password change with session revocation.
- Empty private workspace for each new user; no automatic financial seeds.
- Reset token creation/consumption architecture and tests. **Email delivery and reset UI are not activated.**
- Cent-exact finance utilities and real PostgreSQL/API integration tests.

## Folder structure

```text
src/app/                    Next.js pages and API route handlers
src/app/(workspace)/        Protected overview, budget, goals/roadmap, accounts, categories, transactions, settings
src/components/            Auth, navigation, settings, and ledger forms/lists
src/lib/                   Shared validation and pure finance calculations
src/server/                Database, auth, owner-scoped services, HTTP boundary
prisma/schema.prisma       Relational database design
prisma/migrations/         Executable schema + RLS/check/trigger migration
docs/ARCHITECTURE.md        Full nine-phase design
scripts/                   Local development and verification helpers
tests/unit/                Money and validation tests
tests/integration/         Real database and API security tests
```

## Installation

Requirements: Node.js 22.18+ and PostgreSQL 18 (PostgreSQL 16+ should also support the schema, but has not been tested here). Use the committed npm lockfile.

```sh
npm ci
npm run db:generate
```

Never commit `.env`, database files, logs, or credentials. `.gitignore` excludes them. The source archive omits dependencies, generated builds, local credentials, and local database state.

### Local database on this Windows machine

```sh
npm run db:local
npm run db:migrate
npm run dev
```

The helper uses the installed binaries at `C:/Program Files/PostgreSQL/18/bin`; set `PG_BIN` for another installation. It creates a **separate** development cluster at `../../work/clearpath-postgres`, binds only `127.0.0.1:55439`, generates random credentials, and creates `clearpath` plus `clearpath_test`. It does not modify the machine's existing PostgreSQL service or databases. Existing `.env` files are preserved. The local helper uses a superuser only for bootstrap/migration and gives the app a separate non-superuser, non-owner, `NOBYPASSRLS` role.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use exactly this host to match `APP_ORIGIN`. Create your own account in the interface; there are no shared demo login credentials.

Stop the database when finished:

```sh
npm run db:stop
```

### Existing or hosted PostgreSQL

1. Copy `.env.example` to `.env`.
2. Create separate migration and runtime credentials. The runtime role must not own the tables and must have `NOSUPERUSER NOBYPASSRLS`. Do not deploy with the database owner's URL as `DATABASE_URL`.
3. Set `DATABASE_URL` to the runtime role; `DIRECT_URL` to the migration role; set separate test URLs for a database whose name ends in `_test`.
4. Set `AUTH_SECRET` to at least 32 random characters; set `APP_ORIGIN` to the exact browser origin.
5. Run `npm run db:migrate` using the migration connection.
6. Grant the runtime role only the required table privileges and schema usage. Example, substituting your role names:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO clearpath_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clearpath_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM clearpath_app;
ALTER DEFAULT PRIVILEGES FOR ROLE clearpath_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clearpath_app;
```

The application generates string IDs; no sequence privileges are needed. Ensure future tables get the intended runtime grants without granting schema creation or RLS bypass. Rotate secrets in your deployment secret manager. Production PostgreSQL connections must use your provider's TLS configuration.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime connection without table ownership, superuser, or RLS bypass. |
| `DIRECT_URL` | Migration connection; never referenced by application query code. |
| `AUTH_SECRET` | HMAC key for session/reset digests and auth-rate bucket keys. Rotation invalidates existing sessions. |
| `APP_ORIGIN` | Exact origin permitted for mutations. Production requires HTTPS. |
| `TEST_DATABASE_URL` | Non-bypass runtime connection to a dedicated `_test` database. |
| `TEST_DIRECT_URL` | Test fixture/migration connection to that same `_test` database. |
| `PG_BIN` | Optional local helper override for PostgreSQL binary directory. |

No sensitive configuration uses the `NEXT_PUBLIC_` prefix.

## Development, checks, and migrations

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

`npm run check` runs lint, types, units, and integrations. Integration setup applies migrations using `TEST_DIRECT_URL`; it refuses database names not ending in `_test`. It inserts synthetic User A/User B fixtures, attacks the actual route handlers using forged record IDs, checks direct unfiltered queries under RLS, and removes its fixtures. No production database fallback exists.

With the local app running, `node scripts/verify-live.mjs` additionally checks actual HTTP endpoints and server-rendered page content. It only permits a loopback `APP_ORIGIN`, creates a uniquely named synthetic fixture, and cleans it up using `DIRECT_URL`. It does not automate browser interactions.

For a schema change, use `npm run db:dev -- --name descriptive_change`, review the generated SQL, and include RLS/check constraints for new owner-owned tables. Custom SQL is not inferred from the Prisma schema. Never use `prisma db push` as a substitute for migrations: it will not create the required policies and triggers. Never regenerate or edit an already-applied baseline migration. `scripts/create-initial-migration.mjs` documents initial baseline generation, not routine updates.

Money inputs and outputs are strings; stored amounts are bigint cents. See `src/lib/finance.ts` and the architecture document for formulas, date handling, and transfer semantics.

## Production build and deployment considerations

```sh
npm run build
# Set production APP_ORIGIN=https://your-host.example and runtime secrets first.
npm run start
```

Use a Node-capable host with PostgreSQL connectivity, HTTPS reverse proxy, a private database, persistent database backups, and a tested restoration procedure. `npm start` listens on loopback for a local reverse proxy; configure your platform's bind address explicitly if needed. Apply migrations in a controlled release job and verify the runtime role before starting the app. Never ship `.env` files or the local bootstrap credentials.

The application has **not** been publicly deployed. Local hardening includes nonce-based script CSP, runtime role/RLS checks, rate limits, dependency audits, and a synthetic PostgreSQL restore drill. Public release still requires browser end-to-end/visual verification, trusted email delivery and verification/recovery UI, real TLS/proxy validation, edge abuse controls, monitoring, and backup verification on the chosen infrastructure. See docs/DEPLOYMENT.md for the exact runbook and remaining release gates.

Rate-limit records and expired sessions/reset tokens need a scheduled retention task before sustained public use. Keep authentication rate limiting shared across instances. Configure pool limits for your database capacity; do not replace transaction-local RLS with a connection-global setting.

## Current limits and next phase

The overview uses real ledger totals for a selected month. Net account balance is the current balance across all accounts, including archived accounts; it is separate from the selected month's cash flow. Settings currency remains USD only. Bank connections, Excel/JSON import, and external notifications remain future work. CSV/JSON downloads and retirement management are now available. Actual future-dated transactions are rejected; recurring schedules can hold future due dates.

**Phase 9 local hardening is implemented. Public release gates remain; see [Deployment and recovery](docs/DEPLOYMENT.md).**

## Included in Phase 2

- `/accounts`: create/edit manual accounts, opening balances, live calculated balances, archive/restore, and delete unused accounts.
- `/categories`: create/rename categories, choose icons, archive/restore, and delete unused categories.
- `/transactions`: add/edit/delete income, expenses, transfers, and savings transfers. The quick-add dialog remembers the last active expense category from the owner's ledger.
- Search by description, type, account (either side of a transfer), category, date range, and amount; sort and paginate 25 records per page.
- `/dashboard`: current net account balance, monthly income/spending/savings/cash flow/savings rate, recent activity, month selection, and first-account guidance.
- Decimal-string inputs, bigint cents, a single authoritative transfer row, owner-scoped validation, and UUID save-request deduplication. Editing/deleting a transfer recalculates both accounts. Goal assignments follow their transaction amount and cascade on deletion; their UI is included in Phase 4.
- Referenced accounts/categories cannot be deleted. Archive hides them from new entries while preserving history and balances.
- Additional migration `20260927010000_transaction_retry_safety` adds the per-owner retry key. Run `npm run db:migrate` when updating an existing installation.
- Native modal dialogs, labelled controls, keyboard focus styles, mobile layouts, and inherited dark-mode tokens. Phase 2 visual browser verification remains pending because the browser tool's URL policy blocked access in this session.

The ledger API is `GET/POST /api/ledger/{accounts|categories|transactions}` plus `GET/PATCH/DELETE /api/ledger/{resource}/{id}`. POST transactions requires a UUID `requestId`; reuse it only to retry the same payload. All mutations require the configured origin and a valid session. Browser-supplied owner IDs are rejected. API money fields ending in `Minor` are integer strings; form `amount` and `startingBalance` are decimal strings in USD.

## Included in Phase 3

- `/budget?month=YYYY-MM`: select historical/current/future months, create and edit a complete plan, and compare budgeted versus actual income, spending, savings, and remaining cash flow.
- Category allocations show actual expenses, remaining/over-budget amounts, percentage used, and links to that month's expenses. Uncategorized and unbudgeted expenses stay visible and count in totals. Transfers are excluded from spending.
- Remaining to spend = planned net income − actual expenses − planned cash savings. Left to allocate = planned net income − category allocations − planned cash savings. These are labelled separately from actual net cash flow.
- Quick budget editor supports explicit zero limits, removing an allocation by leaving its amount blank, and a Repeat flag. Repeat is a copy-selection preference, not automatic posting or scheduling.
- Copy a previous month's entire plan or only repeating allocations into a month without a plan. Copies income/savings and eligible allocations; skips archived categories; leaves the original plan and all transactions unchanged. Repeat/concurrent copy attempts cannot create duplicate plans or overwrite an existing one.
- Saved revision checks prevent another tab's edits from being overwritten. All budget operations share the owner lock with ledger mutations and retain PostgreSQL RLS protection. Archived allocations remain editable in their original month.
- Overview links to the selected month's budget and shows remaining to spend when a plan exists. On mobile, Categories remains available through Manage categories in Budget while bottom navigation stays at five items.
- No new schema migration was needed for Phase 3; the existing monthly-budget and budget-item tables are used.

Budget endpoints: `GET/PUT /api/budgets/:month`, `POST /api/budgets/:month/copy`. PUT takes `expectedRevision` (`null` for create, otherwise the last GET's `plan.revision`), decimal-string `income`/`savings`, and `items: [{ categoryId, amount, recurring }]`. Copy takes `sourceMonth` and `recurringOnly`. Conflicts return 409, invalid input 400, and unavailable owner-scoped references 404. Plans and items save atomically. Saving a plan never creates, edits, or deletes transactions.

## Included in Phase 4

- `/goals`: create/edit goals with a target, an already-saved opening allocation, planned monthly contribution, optional target date/account/notes, icon, and active/paused/completed status. Paused future goals may omit their target.
- Progress is the opening allocation plus linked savings transfers. The opening allocation does not create cash or change an account balance. It must not duplicate savings transfers also linked to the goal. Spending/withdrawals are not automatically deducted from allocations.
- Add contribution on a goal card opens the savings-transfer form with that goal and its associated destination preselected. Existing transfers can be assigned, reassigned, or unassigned in Transactions. A transfer belongs to at most one goal and always contributes its full amount; split allocation is not implemented.
- Creating a transfer and its contribution is one atomic operation. Edits/deletion/reassignment update progress and goal status in the same transaction without moving money twice. Active funded goals automatically complete; completed goals reopen if progress falls below target. Paused goals stay paused. New assignments require an active goal; existing history remains editable.
- An optional account association must be a savings/HYSA account, and linked transfers must go into it. The account's entire balance is not counted toward the goal. A linked goal cannot be deleted; pause it or remove assignments first. Goal editor revisions prevent stale changes after contributions or other edits.
- Individual estimates use the goal's monthly amount. Required monthly contributions round upward to the nearest cent and count monthly anniversaries through the target date. Contribution dates start one month from today, with month-end clamping. Zero contribution, missing targets, past dates, and estimates beyond year 9999 have explicit unavailable states.
- `/goals/roadmap`: saved shared monthly savings assumption, sequential cumulative estimates, and accessible Move earlier/later controls. Surplus in one goal's completion month flows to the next. Paused/completed goals are excluded from the allocation queue. Individual goal plans and the shared roadmap are separate scenarios; neither posts transactions. No interest/growth is assumed.
- Goal filters and names in transaction history. Mobile bottom navigation includes Goals; Categories and Settings remain available in the workspace links above page content.
- Phase 4 uses the existing goal/contribution tables and `UserSettings.defaultSavingsMinor` for the roadmap assumption; no migration was needed. Owner locks, RLS, owner-scoped foreign keys, type triggers, and single-transfer contribution uniqueness remain enforced.

Goal APIs: `GET/POST /api/goals`, `GET/PUT/DELETE /api/goals/:id`, `PUT /api/goals/order` with all owner goal IDs, and `PUT /api/goals/roadmap` with a decimal-string `monthlyContribution`. Updates require `expectedRevision`. Ledger transaction create/update accepts optional nullable `goalId`; omitted on update preserves the assignment, explicit `null` unassigns. Filtering by `goal` validates that the goal belongs to the session owner. Amounts use decimal strings at input and minor-unit strings at output.

See `docs/VERIFICATION.md` for the actual checks performed on this delivery.

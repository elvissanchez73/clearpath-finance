# Phases 1–9 verification

## Phase 9 local security pass — September 28, 2026

- Full lint, strict TypeScript, and the full test run passed with 59 unit and 135 integration tests. An additional export-limit regression passed in the targeted security rerun, bringing coverage to **195 passing tests (59 unit + 136 integration)**. Final lint and production build passed after the security changes.
- Tests cover production CSP construction, fresh nonces overriding caller-supplied headers, runtime role rejection, readiness, global limiter ordering, per-user download limits, and Retry-After, plus previous financial/authentication/isolation workflows.
- Both production-only and full npm dependency audits reported zero known vulnerabilities at verification time.
- The synthetic pg_dump/pg_restore drill passed: exact cents, migration history, and all 14 forced-RLS tables restored. Temporary databases and the dump were removed; no user database was backed up or overwritten.
- Development live HTTP smoke passed all prior workflows plus readiness and CSP nonce/header-to-HTML matching.
- The production-mode server-start command was rejected by automatic approval policy, so the production-runtime smoke test is **unverified**, despite a passing production build. Browser visual/interaction checks also remain unverified due to the earlier browser URL-security-policy block.

This is not public-deployment certification. Recovery email/verification UI, actual TLS/proxy behavior, edge controls, monitoring, provider backups, and browser end-to-end checks remain release gates in DEPLOYMENT.md.

## Phase 8 continuation — September 28, 2026

- Production build passed compilation, TypeScript, and page generation for all new routes. Final lint passed after live-smoke and test updates.

- Lint and strict TypeScript passed. **55 unit tests and 132 PostgreSQL/API integration tests (187 total)** pass across the full suite plus the corrected targeted rerun. The initial run exposed one test expectation that overlooked ledger note trimming; the assertion was corrected and all 11 Phase 8 integration tests passed on rerun.
- New tests cover spreadsheet formula prefixes/quoting, strict export filters, exact retirement estimates, invalid percentages, resumable/skippable setup, defaults independent of existing budgets/roadmap, stale settings, contribution retry deduplication and mutation revision checks, foreign IDs, future/zero actuals, month/YTD recalculation, private exports excluding credentials, attachment/cache headers, and mutation authorization/origin boundaries.
- Expanded live HTTP smoke passed all five onboarding steps, skip/finish persistence, budget defaults, retirement estimates and actual contribution create/retry/edit/delete, CSV and JSON downloads, prior workflows, background-worker posting, sixteen protected server-rendered pages, logout, and exact synthetic-fixture cleanup.
- The new migration applied successfully to development and test databases. Existing data and RLS policies were retained.
- Visual desktop/mobile, dark-mode contrast, file-download interaction, and keyboard/browser interaction QA remain unverified because of the previous browser URL-security-policy block. HTTP checks validate downloaded content and server-rendered pages, not visual behavior.

## Phase 7 continuation — September 28, 2026

- Production build passed optimized compilation, TypeScript, and page generation including both new pages and API routes. Final lint passed after the live-smoke updates.

- `npm run check` passed lint, strict TypeScript, **50 unit tests and 121 PostgreSQL/API integration tests (171 total)**.
- New unit tests cover month-end/leap anchors, yearly and twice-monthly schedules, projection lower bounds, biweekly alignment, and efficient projection of a 1900 daily plan into December 9999.
- New integration tests cover planned versus actual separation, user isolation, generated-entry deduplication, removed/skipped occurrence markers, moving generated entries to another month, exact budget/prior-month comparisons, missing versus zero budgets, uncategorized spending, separate retirement totals, goal cutoff dates, authentication, strict query validation, and private/no-store responses.
- Live HTTP smoke passed calendar forecast and skipped-entry checks, monthly review expense/budget/retirement totals, both new server-rendered pages, all prior workflows, background-worker posting, logout, and exact fixture cleanup: fourteen protected pages total.
- Visual desktop/mobile and disclosure interaction testing remains unverified because of the earlier browser URL-security-policy block. HTTP tests verify server responses, not visual layout.

## Phase 6 continuation — September 28, 2026

- `npm run build` passed optimized compilation, TypeScript, and page generation including `/analytics` and `/api/analytics`.

- `npm run check` passed lint, strict TypeScript, **46 unit tests and 113 PostgreSQL/API integration tests (159 total)**.
- Analytics coverage includes exact cents, missing months, zero-income gaps, weighted annual savings rates, date limits, leap-month boundaries, dashboard agreement, transfers on both sides, archived/uncategorized data, zero versus missing budgets, all-time bounds, current goal progress, backdated edits/deletions, account privacy, and authenticated private/no-store responses.
- Expanded live HTTP smoke passed analytics totals and account history plus all prior workflows, twelve protected server-rendered pages, the real recurring worker, logout, and fixture cleanup.
- Recharts 3.10.1 and React-matching react-is 19.3.0 installed; npm reported zero vulnerabilities at installation.
- Visual chart rendering, responsive layouts, hover/touch interactions, and keyboard behavior remain unverified because of the previous browser URL-security-policy block. HTTP checks verify server-rendered headings/data, not browser chart hydration.

## Phase 5 continuation — September 27, 2026

- `npm run check` passed lint, strict TypeScript, 42 unit tests, and 103 PostgreSQL/API integration tests: **145 total**.
- `npm run build` passed compilation, TypeScript, and page generation including recurring, subscriptions, income, and retirement foundation APIs.
- New tests cover calendar anchors, leap years, semi-monthly dates, exact subscription/payroll calculations, schedule revisions, duplicate protection, deleted-entry tombstones, catch-up, skipped occurrences, blocked references, linked goal completion, cross-user access, income settings, separate retirement totals, and FORCE RLS across all 14 financial tables.
- The expanded live HTTP smoke passed against the restarted development server: authentication, ledger, budgets, goals, recurring post/retry/skip, salary settings, retirement contribution totals, eleven protected server-rendered pages, and logout. The real timer generated a due transaction without invoking the manual run endpoint. Synthetic fixtures were removed afterward.
- An initial development-server framework 404 cleared after a rebuild and server restart. Production startup rejected local HTTP as designed because HTTPS is required; production build passed, but deployment runtime was not tested over HTTPS.
- Browser visual and interactive desktop/mobile QA remains unverified because of the earlier browser URL-security-policy block. Server-rendered content checks do not replace visual QA.

Worker operation requires a running Node process. Production must opt in with `RECURRING_WORKER_ENABLED=1`. Reminders are in-app only; no bank payment is executed. Retirement currently has an API foundation, with full management UI planned for Phase 8.

## Phase 4 continuation — September 27, 2026

- `npm run check` passed: lint, strict TypeScript, **36 unit tests and 86 PostgreSQL/API integration tests (122 total)**.
- `npm run build` passed optimized compilation, TypeScript, and page generation including both goal pages and all four goal API routes. Final lint passed after the live-test and navigation updates.
- Five new projection/validation unit tests cover exact rounding, zero contribution, funded/paused/missing targets, overdue dates, leap/month-end anniversaries, date-range limits, and sequential surplus carryover excluding paused/completed goals.
- Sixteen new integration tests cover atomic linked transfers and balances, retry deduplication, automatic completion/reopening, reassignment/unassignment with no additional money movement, historical linking, cross-user references and rollback, type and destination restrictions, paused history, opening allocations, stale/concurrent goal editors, protected deletion, private roadmap assumptions/order, current-month contribution totals, and actual route-handler authorization/origin/payload boundaries.
- `node scripts/verify-live.mjs` passed against the running local app: prior ledger/budget workflows, goal creation and transfer linking, completion and deletion reversal, goal filtering, roadmap assumption/order, eight protected server-rendered pages, logout, and synthetic fixture cleanup.
- Visual desktop/mobile interaction testing remains unverified because of the earlier browser URL-security-policy block. No new screenshots or browser interaction claims are made.

No bank transactions are executed. Goal opening allocations and roadmap assumptions are planning records. Split transfer allocations, withdrawal reconciliation, interest/growth modeling, recurring posting, final analytics, and public deployment are outside this phase.

## Phase 3 continuation — September 27, 2026

- `npm run check` passed: lint, strict TypeScript, **31 unit tests and 70 PostgreSQL/API integration tests (101 total)**.
- `npm run build` passed optimized compilation, TypeScript, and page generation, including `/budget` and both budget API routes. Final lint passed after the live-check additions.
- The new 15 integration tests cover private empty plans, exact amounts and zero limits, expenses-only actuals, uncategorized expense drill-down, calendar-month boundaries, foreign references and rollback, stale/concurrent editor rejection, concurrent copy protection, source-month independence, repeating-item selection, archived history, ledger edit/delete recalculation, allocation removal without deleting spending, legacy API revision invalidation, future planning, and actual HTTP-handler session/origin/payload protections.
- The new three unit tests cover planned-versus-actual formulas, year/leap-month date bounds, duplicate categories, invalid amounts, and strict revision/owner inputs.
- `node scripts/verify-live.mjs` passed against the running local app: ledger workflows, budget creation/read, remaining calculations, stale-save rejection, repeating-item copy, and six protected server-rendered pages, followed by logout and fixture cleanup.
- Visual desktop/mobile interaction testing remains unverified because of the browser URL-security-policy block encountered in the prior phase. HTTP page-content tests are not substitutes for visual QA.

No automatic recurring transactions, goal-management interface, analytics charts, or public deployment are included in this phase. Repeating budget items only support explicit copying to another month.

## Phase 2 continuation — September 27, 2026

The implemented scope is accounts, categories, transactions, transfers, search/filtering, and an initial monthly overview. The application remains local and is not a completed nine-phase production product.

Automated checks for this continuation:

- Lint and strict TypeScript passed.
- Unit suite: **28 tests**, covering the existing finance rules plus calendar validation, exact input boundaries, timezone dates, partial-update preservation, and malformed search ranges.
- Real PostgreSQL/API integration suite: **55 tests**, including all existing authentication/isolation checks and 15 ledger tests.
- Optimized Next.js build compiles all new protected pages and API handlers.

Ledger coverage includes transfer balance conservation, edits/deletion reversing both sides, moving an expense between accounts, concurrent retry deduplication, rejection of changed retry payloads, cross-owner source/destination/category references, future-date and transfer validation, archive protection, restricted historical deletion, linked goal contribution consistency/cascade, all filter dimensions, stable pagination, snapshot invalidation, recent-category isolation, and exact large-money serialization. Read, update, and delete attempts against foreign account/category/transaction IDs match nonexistent-ID responses.

The app was started locally and its login route returned HTTP 200. **`node scripts/verify-live.mjs` passed** against the running app: account/category/transaction CRUD, transfer edits and calculated balances, filtered results, five protected server-rendered pages, authentication, and logout. Its exact synthetic fixture was removed afterwards. This is an HTTP smoke test, not a browser interaction test.

**Visual/browser limitation:** browser automation could not bind the existing local preview because the browser tool rejected it under its URL security policy. Phase 2 desktop/mobile screenshots and interactive form checks are therefore not claimed. The earlier screenshots below only document Phase 1. No new financial data was seeded into a real user's account.

## Phase 1 evidence (retained)

Verified locally on September 26, 2026 using Node.js 22.18, PostgreSQL 18.4, Next.js 16.3.6, Prisma 6.19, and Vitest 5.0.2.

## Automated checks

- `npm run lint`: passed, no warnings.
- `npm run typecheck`: passed in strict mode.
- `npm test`: **22 passed**.
- `npm run test:integration`: **40 passed** against real PostgreSQL, using a separate `_test` database and a non-owner runtime role with neither superuser nor RLS-bypass privileges.
- `npm run build`: optimized production compilation, type checking, and page generation passed.
- `npm audit` after dependency fixes: zero reported vulnerabilities; `npm audit --omit=dev` also reports zero. An audit is not a proof of absence of vulnerabilities.

The integration suite exercises actual Next.js route handlers with authenticated requests, not a mocked database or mocked authorization layer. It covers all five requested sensitive record groups: accounts, transactions, budgets, goals, settings. For each it verifies read, update, delete, and list isolation. Foreign IDs and nonexistent IDs produce the same 404 response.

Additional coverage: all eleven financial tables have enabled/forced RLS; direct queries without context return no rows; accidental unfiltered queries remain owner-scoped; writes with a forged owner fail; cross-user account foreign keys fail; pooled transaction context does not leak; real owner updates/deletes succeed; password hashing/salts; session digests, expiration, logout and password-change revocation; single-use/expired/concurrent resets; atomic rate limiting; CSRF origin checks; profile owner injection; oversized request bodies; private cache headers; HttpOnly/SameSite cookies; positive amount and distinct transfer destination checks.

Pure calculation tests cover exact cent parsing, large bigint formatting, account balances, transfer conservation, month boundaries, expense/savings separation, zero-income savings rates, budget remainders, goal progress, completion rounding, and required monthly contributions.

## Browser checks

- Login and signup pages render successfully.
- Synthetic test-account registration redirects to its own empty protected overview.
- Settings navigation works.
- Appearance can be changed using keyboard controls; saving shows a success message and updates the view.
- Desktop overview and settings inspected visually.
- Phone-sized settings inspected at 390 × 844. Document width did not exceed viewport width; fields form a single column and bottom navigation remains accessible.
- Signed the synthetic UI account out after verification; no shared demo credentials are provided.
- Verified the local database can stop and restart with the supplied helper, then rebuilt successfully.

Screenshots are included separately in the delivery outputs. The test account is synthetic and has no financial data.

## Scope of this evidence

This verifies the implemented Phase 1 foundation, not the nine-phase product as a whole. Public deployment, real email delivery, bank integrations, complete financial creation workflows, recurring scheduling, exports, retirement ledgers, and the final analytics/dashboard have not been implemented or tested. No public production readiness claim is made.

On Windows, stop the development server before regenerating Prisma or running the production build: an active Prisma client may lock its engine DLL. Start the preview again after the build.

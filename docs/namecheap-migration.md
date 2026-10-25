# Namecheap migration — staged work

Target: Stellar Plus, cPanel Setup Node.js App, Node 24, private application root
`/home/quizxpmo/quizmint-app`, startup file `server.cjs`.

## Stage 1: Node startup preparation

Added `server.cjs` using Next's custom server API for Passenger, plus explicit
`dev:namecheap`, `build:namecheap`, `start:namecheap` scripts. Startup defaults to
production, uses the application directory, honors PORT for non-Passenger use,
and reports preparation/listen failures without printing private configuration.
Run `npm run test:namecheap-startup` for the launcher checks (no real ports needed).

This stage is NOT a working Namecheap deployment. Existing default scripts still
use Cloudflare. `build:namecheap` cannot produce a usable app until the runtime
imports and services below are converted. No production DNS changes yet.

## Remaining stages

1. Replace Worker environment imports with Node configuration.
2. Convert D1 SQL and migrations to MariaDB, preserving transactions, atomic
   counters, credit reservations, webhook idempotency and concurrent Arena writes.
3. Replace R2 with private filesystem storage; keep ownership and visibility checks.
4. Replace trusted Sites authentication headers with locally verified administrator
   sessions. Map old administrator-owned records explicitly during data migration.
5. Connect email through the Namecheap gateway; retain recovery limits.
6. Install/build/test the converted app locally, then deploy to a staging hostname
   through the Node environment command supplied by cPanel. Test long AI requests
   against host timeouts before choosing shared hosting for production.
7. Obtain production database/image exports when access is restored. Test import
   against a copy and validate counts, ownership, password hashes, wallet balances,
   Stripe identifiers and image references. Don't assume raw D1 SQL imports to MariaDB.
8. Final write freeze, backup, import, HTTPS/DNS cutover and operational checks.

Keep the current database, image storage and deployment available until verified.
Store credentials in cPanel environment variables/private files, never in this guide.
Native creator password hashes should be preserved where compatible; sessions may
need to be invalidated. Never treat incoming oai-authenticated-* headers as identity
on the independently hosted application.

## Stage 2a: MariaDB connection foundation

Added a lazy, bounded mysql2 connection pool, a transaction helper and a read-only
connection checker. The example database/user are both `quizxpmo_quizmint`; no
password is stored in source. This does not yet replace D1 application queries or
create tables: SQLite upserts, RETURNING, FTS and concurrency semantics still need
explicit conversion and integration tests before switching the application database.

Once these files and their dependency lockfile have been deployed to the migration
branch, install dependencies using the agreed package manager, copy
`.env.namecheap.example` to `.env.namecheap`, and fill DB_PASSWORD privately. Use
`chmod 600 .env.namecheap`. In the activated Node environment run
`npm run db:check:namecheap`. This only selects a constant and the selected database
name; it creates or changes no data. The same settings must later be entered into
cPanel's application environment because `server.cjs` does not load this file.

The transaction helper pins work to one connection, commits once, rolls back on
failure and releases the connection. DDL is not rollback-safe in MariaDB and is
not part of this helper's intended use. Never retry ambiguous payment commits.

Run `npm run test:namecheap-db` for connection configuration and transaction lifecycle
checks. A passing mocked test does not verify connectivity to Namecheap; the hosting
checker is the next manual verification after code deployment.

## Stage 2b: empty MariaDB schema

`migrations/mariadb/0001_initial.sql` defines the 19 application tables as InnoDB,
with UTF-8 binary collation, BIGINT counters/timestamps, bounded indexed identifiers
and LONGTEXT quiz/document fields. SQLite FTS5 is replaced with a FULLTEXT index on
public quiz title/subject; the library route still requires a MariaDB query rewrite.
Existing D1 migrations remain untouched for export/import reference.

`npm run db:setup:namecheap` checks that the selected database is empty without
creating tables. `npm run db:setup:namecheap -- --apply` explicitly creates the
application tables plus a checksum/status journal. No accounts, quizzes, credits,
seeds or old local data are imported. A per-database advisory lock serializes setup.
Any preexisting non-journal tables cause refusal. A matching completed journal makes
repeat setup a no-op. Partial setup fails closed; do not blindly delete its journal
or rerun SQL. Inspect the failure and the database first. DDL implicitly commits,
so partial table creation cannot be transactionally rolled back.

`npm run test:namecheap-schema` checks the schema against every existing D1 column,
key/index and foreign key, and verifies preview, refusal, journaling, partial-failure,
checksum and lock behavior. These tests alone do not prove hosting SQL compatibility.

The schema is only one stage. The app must not be started until its queries, runtime,
storage, and authentication have been converted and tested. Existing production
imports will need a separate explicit data conversion process.

## Stage 3a: native account queries

`db/namecheap-accounts.mjs` adds MariaDB-native registration, lookup, session issuance,
expiry, revocation and rate-limit operations. Unique keys resolve registration races.
Session issuance locks the current password state before insertion. Rate limits use
InnoDB row locks and quoted reserved column names; SQLite ON CONFLICT is not used.
The existing application account routes are not wired to this repository yet, since
other runtime dependencies and administrator authentication remain to be migrated.

`npm run db:test-accounts:namecheap` tests the queries on one dedicated database
connection with connection-local temporary copies of creator_users, creator_sessions
and auth_limits. Each copy has a distinct random test name; the check redirects
static repository queries to those names. They contain no real data and disappear
when the connection is destroyed. No permanent
account data changes. Requires CREATE TEMPORARY TABLES permission. This check validates
SQL and sequential behavior, not simultaneous-request load or password-reset flows.

`npm run test:namecheap-accounts` runs local isolated query/transaction contract tests.

## Stage 3b: account route wiring

Account API handlers and shared creator-session/rate-limit helpers now call the
AccountStore interface. The existing Workers environment uses the D1 implementation;
the planned Node environment selects the native MariaDB repository using the internal
QUIZMINT_RUNTIME=namecheap marker. Do not set that marker in the hosted app yet:
the Node runtime bridge and the rest of the application are still being converted.

Password hashing, cookie settings, origin checks, expiry and stale-password checks
are preserved. All features using creator() or throttle() share the selected store.
`npm run test:namecheap-account-routes` checks the MariaDB-selection route path with
an isolated driver fixture; hosting SQL compatibility is covered separately by the
previous temporary-table account check. No real/local user data is uploaded.

Stage 3b validation: the MariaDB-selection account route fixture, existing full API
suite, password-reset regression suite, 19 Namecheap unit/contract checks, and
TypeScript noEmit all passed. Full production startup/build remains pending until
the remaining Cloudflare dependencies are converted.

## Stage 4a: saved quizzes and ordinary student results

Teacher quiz CRUD, creator-owned listing/reporting and untimed student submissions
now use QuizStore. Namecheap selects native MariaDB operations; the existing Workers
store remains available while migration is incomplete. Ownership and answer-hiding
checks remain in the routes. MariaDB list aggregates normalize DECIMAL results to
JSON numbers. Quiz close/delete mutations are ownership-scoped. Deletion uses one
transaction and a quiz row lock. Untimed submissions lock quiz availability and use
a duplicate-key no-op that does not suppress other integrity errors.

`npm run test:namecheap-quiz-routes` checks the MariaDB route selection with an
isolated driver fixture, including hidden answers, grading, replay, ownership,
closed quizzes and rollback of a failed deletion. It does not connect to hosting.
`npm run db:test-quizzes:namecheap` checks native SQL on Namecheap using distinct,
connection-local temporary tables. The public library table is copied with an
empty SELECT rather than LIKE because temporary InnoDB FULLTEXT indexes are not
supported. No permanent quiz, attempt or library records are changed.

Timed/resumable student attempts, public library sharing/search, creator profiles,
password recovery writes, AI/billing/platform/Arena SQL and image storage remain to
be migrated. Do not start the production app or change DNS at this stage.

## Stage 4b: timed and resumable student attempts

The timed-session route now selects a QuizSessionStore. Native MariaDB operations
create/find sessions, conditionally save revisions and finalize attempts under a
transaction. Mutations lock the quiz before updating a session, matching quiz-delete
lock order. Manual saves/finalization use MariaDB's millisecond database clock, while
timeout finalization uses the already saved answers computed by the route. Finalization
inserts results from the winning stored JSON, not a competing caller's payload.

`npm run test:namecheap-timing-routes` runs the existing timing scenarios with the
MariaDB-selection driver fixture; public-library copy checks remain in the original
D1 test until that route is migrated. `npm run test:namecheap-timing` checks clock,
revision, lock order and rollback contracts. Both runtime timing suites and TypeScript
passed locally. These are not a live concurrency/load test on shared hosting.

`npm run db:test-timing:namecheap` exercises the native SQL against distinct temporary
copies of quiz/session/attempt/library tables on one private connection. It tests
start/resume, stale saves, duplicate results, database deadline guards and closure.
Permanent account/quiz/attempt data is unchanged; temporary copies disappear on exit.

Still pending: public library/profile queries, password recovery and direct SMTP,
AI/billing/platform/Arena queries, filesystem image storage, standalone administrator
authentication/runtime bridge, production build, staging verification and DNS cutover.
No production startup or DNS changes until these are complete.

## Stage 4c: public library and private creator profiles

Library/profile routes select LibraryStore. MariaDB uses transactional copying and
publication, native duplicate-key updates, and JSON description/question-count
extraction. Copies compare the locked raw source snapshot before inserting and
incrementing its count in one transaction. Revalidation can add default fields to
legacy snapshots without spuriously rejecting copies. Publication locks the source
quiz and verifies its owner; route consent/ownership/upload exclusions remain.
Profiles remain keyed to the authenticated creator and never control permissions.

Search explicitly lowercases title/subject and binds each token as a substring
condition, requiring every token. This preserves case-insensitive short-word searches
under the schema's binary collation, avoiding FULLTEXT stopword/minimum-token rules.
It broadens the previous prefix matches to substrings and scans candidate public
rows; the existing FULLTEXT index is not used by this path. Revisit indexing for
large public libraries rather than silently changing collation/search semantics.

`npm run test:namecheap-library-routes` covers publication consent, ownership,
case/short searches, copies, timing, rollback, legacy snapshots, unpublishing and
profile validation/isolation with a driver fixture. Native repository contracts are
checked by `npm run test:namecheap-library`.
`npm run db:test-library:namecheap` runs native MariaDB queries against randomly
named temporary schema copies with unique keys retained and unsupported temporary
FULLTEXT indexes omitted. It changes no permanent quiz/profile/library data.

Local route checks, original API suite, original/new timing checks, quiz routes and
TypeScript passed. Hosting SQL verification remains the next manual step.
Still pending: recovery/direct SMTP, AI/billing/platform/Arena queries, private image
storage, administrator authentication/runtime conversion, build/staging and DNS.

## Stage 5: recovery and direct SMTP

Recovery routes now select PasswordResetStore. MariaDB locks the account before the
reset record, checks the database clock after locks, and atomically changes the hash,
consumes the token and revokes all creator sessions. New-link issuance replaces the
previous token; delivery failure invalidates only that token. The original D1 path
is retained until the standalone runtime migration is complete.

Namecheap mode uses Nodemailer directly, with implicit TLS on port 465, certificate
verification enabled, a private fixed sender, disabled file/URL reads, no SMTP debug
logging and bounded timeouts. Mail has branded HTML and a plain-text fallback. The
existing daily allowance uses the native account-store row-lock limiter. SMTP sends
are not automatically retried; a deterministic Message-ID is not a delivery
idempotency guarantee. No standalone mailapi or gateway key is needed by this path.

Configure private SMTP_HOST, SMTP_PORT=465, SMTP_USER, SMTP_PASSWORD,
SMTP_FROM_EMAIL, SMTP_FROM_NAME and trusted APP_URL (HTTPS origin) in cPanel and in
`.env.namecheap` for CLI checks. Don't copy the example over an existing private file.
The mailbox password belongs in private settings only. In dotenv quote passwords
containing #; in cPanel's value field use the raw password without wrapping quotes.

`npm run db:test-recovery:namecheap` checks the native recovery SQL on uniquely named
temporary tables, including rollback of password/token writes when session revocation
fails. It sends no email and changes no permanent application data.
`npm run mail:check:namecheap` connects/authenticates over TLS but sends no message.
`npm run mail:check:namecheap -- --send recipient@example.com` sends one REAL test
email from the Node.js process. Only run the latter for an explicitly chosen recipient.
Verify inbox/spam delivery before deleting the old mailapi deployment or DNS record.

`npm run test:namecheap-reset-routes` runs the complete reset route scenarios with
the native repository fixture and mocked SMTP. Original and native reset tests,
Namecheap test suite and TypeScript passed locally. SMTP has not been tested with
real credentials. No hosted app startup or DNS change yet.

## Stage 6a: AI wallets, reservations and Stripe fulfilment

AI wallet/job and webhook callers now select AiStore. MariaDB uses one InnoDB
transaction with wallet-first row locks for monthly normalization, reservations,
refunds, completed jobs and payment fulfilment. Existing reservation ids cannot
charge again. A running lock must be recovered before another job is reserved.
Refunds cannot exceed the free cap, refund twice, or restore last month's free
questions into this month's allowance. Refunded/ended jobs cannot later complete.

Stripe fulfilment validates the existing route's signature, plan, amount and currency,
then records the checkout session id and grants credits in the same transaction.
Repeated events grant once; a session id associated with another owner fails closed.
Subscription extension uses GREATEST and cancellation remains customer-scoped.
Plans, prices, signatures and Stripe API behavior were not changed.

`npm run test:namecheap-ai` covers native repository scenarios with an isolated driver
fixture, including parallel admission/deduplication and injected payment rollback.
`npm run test:namecheap-billing-routes` checks real route/signature validation and
native-store selection with mocked Stripe responses. `npm run test:namecheap-allowance`
runs the monthly boundary/refill/refund suite through the native store fixture.
These do not issue provider requests or process real charges.

`npm run db:test-ai:namecheap` repeats wallet/payment scenarios using distinctly named
temporary tables on a private hosting connection. It changes no permanent balances,
jobs or payment markers and makes no Stripe/OpenAI calls. The single-connection
hosting check validates SQL/sequential behavior, not concurrent production load.

Still pending: provider cost budgets and queue controls, Arena SQL, private image
storage, administrator authentication and Node runtime bridge, build/staging and DNS.
Direct SMTP delivered a real test message successfully after configuring the hosting
server hostname and publishing SPF/DKIM/DMARC through BasicDNS. Hosted application
variables were saved by the user. Keep mailapi until final app verification.

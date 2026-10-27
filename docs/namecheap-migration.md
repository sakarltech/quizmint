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

## Stage 6b: Platform AI budgets and queue

Platform controls, cost reservations/settlement, AI availability, queue tickets and
health reporting now select a native MariaDB repository in Namecheap mode. Budget
and queue operations each use a dedicated row in platform_settings as an InnoDB
transaction mutex across Node processes. No provider request runs inside a database
transaction. Reservations admit calls only within the configured remaining budget;
settlements update the ledger and monthly counters atomically and only once.
Interrupted calls retain their estimates, including expired reservations from earlier
months. A late response cannot double-charge an expired reservation. These estimates
remain application controls rather than an exact invoice or provider-wide limit.

Queue transactions enforce one active ticket per creator, at most 1,000 waiting
tickets, the configured ready/running capacity, FIFO promotion and owner-scoped
release. Queued tickets renew while polled; ready and running leases have bounded
expiry. The native health dashboard uses UTC daily aggregation and numeric MariaDB
aggregates. Database allocation is estimated from information_schema; Namecheap's
account quota is not assumed to equal the old 10 GB D1 limit. Check cPanel for actual
hosting capacity.

`npm run test:namecheap-platform` checks budget/queue scenarios, rollback and parallel
requests with a serialized isolated driver fixture. `npm run test:namecheap-platform-routes`
checks actual native route selection, admission before provider traffic, mocked
provider failures, pause, queue, admin/origin guards and health reporting without D1.
The current admin guard is still the legacy Sites guard; standalone session-based
administrator authentication and the Node environment bridge remain a later stage.
The original platform suite and TypeScript also pass locally.

`npm run db:test-platform:namecheap` repeats the budget and queue SQL scenarios in
uniquely named temporary tables on one hosting connection. It changes no permanent
settings, spending records or queue entries and sends no provider requests. This
checks MariaDB syntax/transactions sequentially; it is not a concurrent load test.
No new schema or dependencies are needed. No hosted startup or DNS cutover yet.

Remaining: Arena SQL, private image storage, standalone administrator authentication
and Node runtime bridge, production build/staging and DNS, then optional previous
production data import when an export becomes available.

## Stage 7: Arena rooms, players and answers

Arena room listings, creation, state reads, joining, host controls, answers and
room deletion select the native repository in Namecheap mode. Source quiz lookup
uses QuizStore, with the same creator/admin ownership check. Immutable question
snapshots and visual metadata stay in the room even if the source quiz is deleted.

Every native room mutation locks the room first, then accesses its players/answers.
This serializes joins against the 100-entry cap and the host's start, and answers
against pause/reveal/deletion. Host commands recheck owner and version. Deadlines
and room expiry are checked with database time after acquiring the lock; start,
resume and pause timing use that same clock. Duplicate device joins reuse the player,
case-folded names stay unique, and answer retries keep the first stored selection.
Deletion removes answers, then players, then the room in one transaction, preserving
foreign key order. Non-duplicate SQL errors are not hidden by INSERT IGNORE.

Leaderboard sums are normalized to numbers and grouped for MariaDB strict SQL mode.
Scores for the current question remain hidden until reveal. Existing two-second
leaderboard caching, shared ranks, team/individual modes and creator/admin room
separation remain. Image access checks/storage and standalone administrator identity
are still separate pending stages; this does not enable a production Node cutover.

`npm run test:namecheap-arena` exercises repository behavior and parallel requests
with a serialized isolated driver fixture (not a load test).
`npm run test:namecheap-arena-routes` checks native routes, cookies, ownership,
origin guards, reconnects, answer privacy, pause/resume, snapshots, scoring, cap,
expiry and cleanup without D1. The original API suite and TypeScript pass locally.

`npm run db:test-arena:namecheap` checks the native SQL on uniquely named temporary
copies of the three Arena tables. It changes no permanent rooms or results.
Temporary LIKE copies retain columns and indexes, but do not retain foreign keys;
this sequential hosting check is not a concurrent load or foreign-key test. No
schema changes or dependencies are required, and no provider requests are made.

Remaining: private image storage/access queries, standalone administrator identity
and Node runtime bridge, production build/staging and DNS. Previous production
data import remains optional once an export is available.

## Stage 8: Private filesystem images

Namecheap uploads now use QUIZMINT_IMAGE_DIR, a private directory outside the app
checkout and web roots, for example `/home/quizxpmo/quizmint-storage/question-images`.
Create the directory as the hosting account, chmod the storage directories to 700,
and add the absolute path to private `.env.namecheap` and the cPanel Node environment.
Never put it under public_html, www, public, htdocs or the application checkout.
No web-server alias or public directory should expose it.

Each image is a single .qmi file with bounded JSON metadata followed by its original
raster bytes. Files are mode 600. Writes publish a complete, synced file atomically
without replacing existing ids; read/head reject symlinks and invalid records. Ids
are restricted to 32 lowercase hexadecimal characters. Head reads only the metadata;
the viewing route checks authorization before loading image bytes. The 600 KB limit,
PNG/JPG/WebP signature checks and required quiz alt text stay unchanged. Filesystem
errors are not sent to upload clients as server paths. A process crash during upload
can leave an unreferenced `.tmp` file; backups and occasional storage review remain
hosting operations, not an automatic garbage-collection promise.

Creator draft ownership, active quiz visibility and current-question Arena image
access use native stores; future Arena visuals stay private. Deletion checks native
MariaDB JSON_SEARCH restricted to question image.id fields. Closed quizzes and live
Arena snapshots still protect their images. Expired snapshots stop pinning them.
As before, verification/reference checks and blob deletion are separate operations;
this stage does not introduce transactional synchronization between filesystem
objects and concurrent saves/copies. Avoid automatic cleanup of live uploads.

`npm run test:namecheap-images` checks file permissions, atomic collision handling,
traversal, symlinks and corrupt files in disposable OS temporary directories.
`npm run test:namecheap-image-routes` exercises uploads, ownership, limits, saved
quiz protection, current/future Arena access and deletion with real filesystem
storage and isolated native database fixtures. It uses neither D1 nor R2. The local
fixture adapts the JSON_SEARCH query for SQLite; the hosting check below validates
actual MariaDB syntax. Original API tests and TypeScript pass locally.

`npm run images:check:namecheap` checks the configured directory by creating,
reading and deleting one random probe image, then checks reference queries using
uniquely named temporary copies of quizzes and arena_rooms. Permanent images and
application data are unchanged. No schema changes or dependencies are needed.
Back up this private directory alongside MariaDB; Git does not contain uploads.
Existing R2 images are not automatically copied. Any later production data import
must also transfer the referenced image objects and their ownership metadata.

Remaining: standalone administrator identity and the Node environment bridge,
production build/staging and DNS. Do not switch DNS or enable native runtime until
those stages pass.

## Stage 9: Standalone Node runtime and administrator sessions

The standard Next webpack build replaces `cloudflare:workers` with the private
Node environment module. It reads process.env at request time, forces native-store
selection and exposes no D1/R2 bindings. The original Vinext path remains separate.
Namecheap build/dev commands explicitly choose webpack; one static generation worker
reduces build concurrency on shared hosting. No private settings go in nextConfig.env.
`npm run build:namecheap` produces `.next`, not the old Workers deployment output.

The Node startup file requires a valid public HTTPS APP_URL when launched directly.
The CLI start command reads `.env.namecheap`; cPanel's direct server.cjs startup uses
its own saved environment variables. Keep both settings consistent. DB, SMTP, image
path, provider keys and trusted public origin must be available to the cPanel process.
A successful build does not prove the cPanel application has those settings.

Native admin rights require a current, unexpired MariaDB login session whose account
id equals private QUIZMINT_ADMIN_USER_ID. A public registration email is not an admin
grant; QUIZ_TEACHER_EMAIL and ChatGPT headers grant nothing in native mode. Admin UI
redirects to `/login?next=admin` or `admin-health`. The login page allows only explicit
internal destinations. Admin AI wallets, image ownership and Arena rooms use the
verified `admin:<account-id>` actor, separate from that account's creator actor.
Session revocation/password reset/expiry removes access until the next valid login.

Server startup strips inbound oai-, cf- and x-quizmint- headers and sets the internal
client IP from the socket peer. Forwarded host/protocol cannot select application
origin; CSRF checks use APP_URL in native mode. Proxy trust defaults OFF. On Passenger,
this may group users under the local proxy's IP until its behavior is verified.
Only set QUIZMINT_TRUST_PROXY=loopback after confirming that local Apache appends or
overwrites X-Forwarded-For. Then the last valid appended address is used, only when
the socket peer is loopback. Public next-start or a different launcher would bypass
this request normalization; cPanel must launch server.cjs. CLI dev is local-only.

Administrator provisioning is a separate explicit step after hosting checks:
1. Set a new private QUIZMINT_ADMIN_EMAIL and QUIZMINT_ADMIN_PASSWORD (12–128 chars)
   in `.env.namecheap`. Never paste the password into chat or a shell command.
2. `npm run admin:setup:namecheap` previews readiness without writing.
3. `npm run admin:setup:namecheap -- --apply` creates a NEW account and prints its id.
   It never promotes/updates an existing email; choose a new controlled email if an
   account already exists. The password is hashed identically to normal login.
4. Copy the printed QUIZMINT_ADMIN_USER_ID to private `.env.namecheap` and cPanel's
   Node environment. Remove QUIZMINT_ADMIN_PASSWORD after success. No bootstrap
   session is issued. Sign in through `/login` with the provisioned credentials.
These commands create one permanent account only when explicitly applied.

`npm run test:namecheap-runtime` uses an isolated database fixture, the actual Node
environment bridge and real password/session code. It checks dry-run provisioning,
password login, pinned roles, forged-header rejection, creator/admin isolation,
revocation/expiry, origin rules and launcher sanitization. It changes no hosting data.
The native platform/timing fixtures now use pinned admin sessions. The Arena parallel
answer fixture accepts either valid first writer, rather than assuming async request
order guarantees the winning answer.

The full local production build passed. `npm run test:namecheap-built` starts the
compiled app on a temporary loopback-only port 3197 and checks public pages, local
login redirects, anonymous API denial, spoofed-header denial and origin checks. It
sets dummy database settings and sends no provider requests. Run with no process
already using that port. This is an HTTP smoke check, not an authenticated end-to-end
production workflow or a Passenger/TLS/load test. Original API/platform suites and
native route suites passed locally as well.

Next: hosting runtime/build verification, admin provisioning, cPanel environment
and Passenger restart on a staging hostname, real authenticated workflows and mail,
then DNS/certificate cutover. Previous production export/image import is still
separate; keep old hosting available until migration verification is complete.

### Passenger startup follow-up

The first staging request returned 503 after direct Node smoke tests passed. The
launcher incorrectly started only when require.main matched server.cjs. Passenger's
node-loader requires the configured startup file and exposes global.PhusionPassenger,
so that condition skipped startup. The launcher now starts for either direct Node
execution or Passenger loading, while ordinary library imports remain inert. A VM
regression check simulates both require paths and verifies exactly one listen call.
The runtime/request/startup suite passes (six node:test checks plus session checks).
This changes server.cjs only at runtime; pull and restart the cPanel app without
rebuilding .next. Confirm staging HTTP behavior; inspect hosting logs if 503 persists.

### Isolated staging startup diagnostic

Staging still returned 503 after the require-loader correction, with empty app and
cPanel error logs. The generated staging .htaccess points to the expected app root,
Node 24 executable and server.cjs; APP_URL also matches staging. `passenger-check.cjs`
is a temporary minimal HTTP entry point to distinguish a Passenger/hosting failure
from Next/application initialization. It loads no private settings or database and
returns only `QuizMint staging startup check: OK`. It records non-secret load/listen
markers in `.sites-runtime/passenger-check.log` (mode 600). Set it as the staging
startup file, restart and inspect the response/log. Restore server.cjs after the
check; this is not the application deployment entry point. Syntax checked locally.

The isolated passenger-check entry point returned OK on staging, confirming the
Node/Passenger route can serve HTTP. The real launcher now writes private boot
checkpoints to `.sites-runtime/server-startup.log` covering entry, public-origin
validation, Next creation/preparation and socket listening. Failures include only
an error code and stack frames, not message/environment/request data. Ordinary
module imports remain inert and the Passenger regression verifies checkpoint order.
Pull, restore server.cjs, restart, request staging and inspect this checkpoint log.

The successful hosting probe reports `passenger:false`; this supervisor requires
the startup file without exposing global.PhusionPassenger. The previous guard still
skipped boot, explaining the missing real-launcher checkpoint file. server.cjs is
now an unconditional deployment entry point. Importable/testable start logic lives
in lib/namecheap-server.cjs and never auto-starts on import. The loader regression
now requires server.cjs with and without that global and verifies full startup in
both cases. Runtime/startup checks and the real compiled-app HTTP smoke check pass.
Pull and restart with server.cjs; no .next rebuild is needed for this launcher change.

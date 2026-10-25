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

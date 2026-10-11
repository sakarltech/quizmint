# QuizMint operations

Open `/admin/health` with the configured ChatGPT administrator account. The API checks the same administrator identity; creator sessions cannot read or update controls.

## Defaults and spending

- Application AI budget: **USD 50 per UTC calendar month**.
- Alert: **80%**, including estimated in-flight reservations; shown in the admin health dashboard, which refreshes every minute while open. No email messages are sent.
- Quiz generation capacity: **4 simultaneous generations**, adjustable to 1–16.
- Minty: **240 AI calls per 15 minutes across the site**, adjustable to 1–5,000. A configured `MINTY_GLOBAL_LIMIT` environment variable takes precedence. Local guide responses continue when capped, paused or budget-limited.
- Admin AI has no question-credit charge, but all provider requests are subject to the application budget.

The meter covers QuizMint generation, section summaries, transcription, diagrams and Minty. GPT-4.1 mini is rated at USD 0.40/million input tokens and USD 1.60/million output tokens; Whisper at USD 0.006/minute. Other text models fail closed until their cost rates are implemented. Costs exclude tax, exchange rates, hosting, Stripe charges and uses of the key elsewhere.

Database transactions reserve estimated spending before calling the provider. Actual reported token/duration usage settles the reservation. Failed, timed-out or abandoned calls retain conservative estimates because provider charges may still have occurred. For PDF requests the input reservation uses the model context limit. Transcription reserves USD 1; unusual recordings that exceed the supported ten-minute duration can incur a larger actual charge before the provider reports their length. An estimate therefore does **not** replace an OpenAI project hard spend limit.

Set an account/project hard spending limit in OpenAI's billing controls separately, after confirming the key's project and other workloads. Existing provider charges before this deployment are not backfilled. The default applies on the first use of this deployment; it does not rewrite the OpenAI billing account.

New purchases pause when AI is paused or the tracked budget is exhausted. Existing billing portal access, subscription records, purchased credits, manual quizzes and saved results remain available. An operator can raise the budget or resume AI through the protected dashboard. Payment and network failures are not automatically retried; an incomplete source summary can receive one validation retry within the budget.

## Queue behaviour

Capacity tickets persist in D1 and are ordered by creation time and ID. Waiting clients poll their own ticket every four seconds; source files are uploaded only after a slot is available. Credits are allocated when generation begins. A queued ticket expires after 90 seconds without polling; a ready ticket expires after two minutes without starting; a running ticket expires after eight minutes. Expired generation reservations use the existing credit recovery mechanism.

This is a capacity queue driven by the creator's open page, **not** an independent background worker. Creators must keep the page open while queued/processing. Completed drafts are retained and can be restored. The queue is limited to 1,000 waiting tickets and one active ticket per creator. A dedicated durable job worker would be required for guaranteed processing after the browser closes.

## Data and public content

Creator/admin quiz lists fetch 25 rows per page; results fetch 100 rows per page. The CSV button exports the current result page. Stable timestamp/ID ordering prevents ambiguity when timestamps match. Owner/creation and quiz/result indexes bound common queries; public titles and subjects use FTS5 search with escaped word-prefix terms.

No existing quiz is automatically published. Owners explicitly confirm public distribution of questions, answers, explanations and diagrams. Public copies contain no student submissions or account details. Uploaded-image quizzes are excluded from public sharing until an image-copying workflow is provided. Creators can unpublish; admins can moderate by unpublishing, but cannot publish a creator's private quiz without that creator. Independent copies already saved are retained, as disclosed during sharing and in the terms.

Arena continues to use polling and a 100-participant room cap. A bounded, two-second per-isolate leaderboard cache deduplicates repeated reads; room transitions, joins and player removal invalidate local entries. Poll timing includes jitter. This reduces database work but does not implement global WebSocket fan-out.

## Validation and scale

Run `node tests/platform-controls.mjs`, `node tests/api.mjs`, `node tests/help.mjs` and `node tests/monthly-allowance.mjs` for regression checks. `node tests/scale-benchmark.mjs` seeds a local in-memory database with 100,000 creators, 100,000 quizzes and 250,000 attempts, then validates indexed paginated query plans and measures 100 runs. All data is synthetic and stays outside production.

Measured local query timings on the implementation run: p50 0.061 ms; p95 0.096 ms; maximum 0.242 ms. These results are a local SQL benchmark, not a hosted load test, login benchmark, end-to-end latency measurement or certification of 100,000 concurrent users. Hosted/browser viewport testing remains outstanding because the managed browser-control capability is unavailable.

Before a large launch, confirm Sites traffic/compute allowances and the 10 GB database limit, provider quotas, storage growth, backup/restore procedures and real-world concurrent traffic. Monitor the separately recorded failure counts and conservative cost estimates. The dashboard reads D1 database size from query metadata when available and alerts at 80% of 10 GB; it displays unavailable when the runtime does not report size. Audio currently uses Whisper; plan its documented migration before its scheduled API retirement on 26 February 2027.

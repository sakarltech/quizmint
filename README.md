# QuizMint

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)


## Quiz access

- `/admin`: OpenAI sign-in only, restricted server-side to the configured `QUIZ_TEACHER_EMAIL`. The administrator can manage all quizzes; existing quizzes remain available here.
- `/login`: creator registration and sign-in with email and password (minimum 12 characters). Creator dashboards at `/teacher` only expose that creator's quizzes and results.
- `/q/:id`: no student account or OpenAI sign-in; email is required and stored alongside the score. Emails are self-reported, not verified.
- Passwords are salted and hashed with PBKDF2 SHA-256 with 100,000 iterations. Session tokens are random, stored hashed, and delivered in Secure, HttpOnly, SameSite cookies, expire after seven days and are revoked on sign-out. Login and registration attempts are rate limited by IP and email.
- Password recovery and email verification are not part of this change.
- Run `node tests/api.mjs` and `node node_modules/typescript/bin/tsc --noEmit` to check authorization, ownership, account sessions, rate limits and quiz scoring.

## AI question studio and billing

Creators and the OpenAI-authenticated administrator have separate server-side wallets.
The first 20 successfully generated questions are a lifetime free allowance. One credit
covers a complete question, correct answer and explanation. Manual questions are free.
Successful generation uses credits even when a quiz is not published. Failed jobs return
their reservation; timed-out jobs recover on the next generation request after 4 minutes.
Retrying the same successful request ID returns the saved result without a second charge.
The latest AI draft can be restored from the editor. Source uploads are not persisted;
generated drafts are stored in D1. AI provider retention policies apply separately.

Inputs: topic, pasted text, PDF (including scans via the vision-capable model), DOCX,
PPTX, TXT, Markdown, CSV, HTML and JSON. Legacy/other formats can be pasted as text.
Audio/video use the speech transcription endpoint (MP3, MP4 with audio, M4A, WAV,
WebM, MPEG, MPGA, OGG). Silent videos and visual scene analysis are unsupported.
Limits: 8 MB per upload, 400,000 characters of extracted text, 10 minutes of media,
50 questions/request and 15 requests/15 minutes per account. Very large or complex
PDFs may fail. DOCX/PPTX decompression is bounded to 20 MB and 1,000 entries.

### Enable AI and payments

Use OpenAI Developers to provision an API key, then configure OPENAI_API_KEY as a
Sites secret. Optional OPENAI_QUIZ_MODEL defaults to gpt-4.1-mini. Configure
STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as Sites secrets, then redeploy.
Use Stripe test credentials first and test all workflows before enabling live credentials.
Configure an HTTPS webhook at /api/ai/webhook on the Site origin for:
- checkout.session.completed (credit packs)
- invoice.paid (initial and renewed subscriptions)
- customer.subscription.deleted (subscription termination)
Enable Stripe's customer billing portal so customers can cancel and manage payment methods.
The success redirect never grants an entitlement; only a verified, idempotent webhook does.
Payments remain disabled until both AI and payment secrets are configured.

Launch prices (GBP): 50 credits £2.99; 200 £7.99; 500 £14.99; unlimited monthly £10.99.
Prices are generated server-side; client amounts are ignored. The stated total is inclusive
of any tax the business owes: tax registration/accounting must be configured with the
merchant before live launch. This implementation does not add automatic tax on top.
Subscription cancellation retains access to the paid period end; purchased credits do
not expire or disappear on cancellation. Unlimited is individual teaching use, subject
to disclosed upload, rate and no-resale restrictions; there is no monthly question cap.
Pack refunds/disputes need merchant review and corresponding wallet adjustments before
refunds are issued. Email verification and stronger free-trial abuse controls should be
added before broad commercial marketing; the existing email/password sign-up does not
verify mailbox ownership. Monitor generation failures and provider cost per account,
and reconcile Stripe entitlements during operational incident recovery.

Administrator AI generation is free and never consumes trial or purchased credits. Creator accounts retain their 20-question lifetime trial, followed by paid credits or the £10.99 monthly plan.

Long text, Word documents and PowerPoint decks are split at paragraph boundaries into roughly 20,000-character sections. Four bounded workers extract learning notes from every section before generating the requested quiz across those notes. Nothing is silently truncated. Short sources and PDFs use the direct generation path. Questions are validated and duplicate prompts rejected; any failed section or generation refunds the original question reservation. Long-source processing may take several minutes; files are not persisted.

Section summaries target a concise length, but valid notes up to 16,000 characters are retained without truncation. Incomplete, malformed or empty structured summaries retry once within the shared processing deadline. Persistent failures identify the section and refund the whole reservation; diagnostics log status and lengths only, never source content.

Optional question visuals: creators and administrators can upload PNG/JPG/WebP diagrams or pictures per question, add required alternative text and an optional caption, preview, or remove them. The browser strips metadata and resizes to 1400 pixels (600 KB maximum stored image). Source files up to 10 MB / 25 megapixels are accepted by the editor. R2 binding BUCKET stores images; D1 question JSON stores only the image ID and text. Uploads require account ownership and same-origin requests. Draft images require owner authentication; student image requests must reference an active quiz that actually includes the image. SVG, animated images and external image URLs are excluded. Removing a draft image deletes its object; images referenced by saved quizzes cannot be removed through the draft endpoint. Abandoned uploads remain in storage and need periodic operational cleanup. Images do not consume AI question credits. Existing quizzes work without visuals.

AI diagrams: opt in during quiz generation, or use Generate with AI on an individual question. Supported visuals are counting groups, geometric shapes, fraction strips, bar charts and sequential flows. OpenAI generates a validated structured specification, rendered through trusted React/SVG components; no raw AI HTML/SVG or external image URL is executed. Diagrams are stored in question JSON and included in student questions and feedback. Diagram generation can return null for unsuitable questions. Automatic diagrams are bundled with question generation; standalone requests require remaining free allowance, credits or an active subscription (admin exempt), consume no additional question credits, and are limited to 15 requests per 15 minutes. Creators review, regenerate, rename, edit accessibility text or remove visuals before publishing. Detailed illustrations, maps and anatomy require image uploads.

Admin/creator AI isolation: creator requests resolve only the email/password session, even when an administrator ChatGPT session is present in the same browser. Admin UI explicitly requests admin=1 and the server independently verifies the configured administrator identity; an unprivileged caller cannot enable admin mode. This separation covers balances, generation, diagrams, saved drafts and billing. Only administrators have free unlimited AI; creator unlimited access requires the paid monthly subscription. Creator profiles are private, session-owned D1 records, with name, teaching role, organisation, subjects, learner group, country and bio. Registration opens profile setup, and existing creators can access My profile from the dashboard. Profile fields never control identity, permissions or allowances.

## QuizMint Arena

Arena adds host-led online, onsite and hybrid competitions at `/arena`. Creators use their email/password account; admins enter from `/arena?admin=1`. Both have access to their own Arena rooms, and creator requests never inherit an admin browser session. Choose a saved quiz, individual or shared-device team mode, and a 10–300 second question timer. Library cards include **Host live**. A room captures an immutable quiz snapshot and is available for seven days.

Players use `/arena/CODE`, a guest nickname/team name and a browser-generated 256-bit device token (stored locally; only its SHA-256 digest is stored server-side). No email or account is required. One shared device represents a whole team. Joining closes once play starts; the original browser token reconnects to the same entry and answers. Loss of local storage or changing devices cannot recover a guest identity. Public names and scores are visible to anyone with the room code. The code is a shareable invitation, not a private-event identity verification mechanism.

`/arena/CODE/host` provides lobby moderation, start, pause, resume, reveal, next, early finish, player link, projector link and final CSV export. `/arena/CODE/screen` provides a spectator/projector view with fullscreen controls. Accuracy scoring awards 1,000 points per correct answer; ties share a rank. Scores for a round are held until reveal to avoid giving away answers. The server authoritatively validates host ownership, optimistic room version, question index, phase and deadline. Atomic conditional answer writes and composite primary keys prevent late-answer races and double scoring. Pause preserves remaining server time. The first submitted answer is final.

Rooms are capped at 100 player/team entries and room creation at 20 per organiser per 15 minutes. Updates use short polling (3 seconds during rounds, 6 in the lobby) with bounded retry backoff, no overlapping automatic polls, hidden-tab suspension and no polling after completion. Onsite play requires internet; offline events, cross-device guest recovery, automatic bracket tournaments, speed scoring and money/prizes are outside this initial release. A 100-entry functional cap is not a load-tested concurrent-event SLA; monitor Worker latency/error rates and D1 usage before promoting large concurrent events. A future persistent connection architecture can reduce polling costs as usage grows.

Question images are served only for the current Arena question and remain protected against deletion while an unexpired room references them. Existing student attempts and AI billing are unchanged. Arena results live separately from ordinary quiz attempts. The latest 50 rooms (including expired rooms) are listed for their organiser; deletion removes the room, guest entries and answers transactionally. Expiry closes public access but does not automatically purge stored records; apply an operational retention/cleanup policy if required.

`node tests/api.mjs` covers Arena permissions/CSRF, creator/admin separation, guest tokens and unique names, immutable snapshots and image visibility, deadline enforcement, pause/resume, optimistic host controls, duplicate/concurrent answers, scoring and shared ranks, team mode, entry cap, expiry and deletion, alongside existing quiz/AI/profile regression checks.

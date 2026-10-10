# Minty — QuizMint platform guide

Minty is free platform help, separate from paid question generation. A floating chat panel is available across the navigation and creator pages; `/help` contains the complete browsable guide. It is hidden on quiz-taking and Arena player/projector pages. Logo assets are unchanged.

`lib/help-knowledge.ts` is the public, maintained source of truth. Update it when features change; prices are derived from `lib/ai-plans.ts`. The server supplies this guide to the existing OpenAI Responses integration, requests structured output, validates destination IDs, and returns only fixed internal navigation links. It never reads private quizzes, student submissions, profiles, wallet balances or Stripe records, and performs no user-account actions. Responses are AI guidance, not a guarantee of accuracy.

The existing `OPENAI_API_KEY` is reused server-side. Optional `OPENAI_HELP_MODEL` overrides the existing quiz model; the default is the same configured quiz model or `gpt-4.1-mini`. Requests use `store:false`, a 20-second timeout and 700 maximum output tokens. This does not disable all provider retention. Messages and up to six recent messages are sent to the provider. Chat lives in tab memory, with a clear button, and is discarded on reload. Logs record provider status/request ID, never chat content or credentials.

Limits: 1,000 characters per question, 16 KB request body, 12 messages per network per fixed 15-minute window, and a shared cap of 60 AI calls per fixed 15-minute window. `MINTY_GLOBAL_LIMIT` may set the shared cap to 1–120. Rate counters use the existing D1 `auth_limits` table and hashed keys. Shared networks can reach the network cap; `/help` remains available. Provider failure, missing credentials or shared cap exhaustion fall back to ranked guide entries with an explicit guide label. These are best-effort support controls, not protection against a large distributed abuse attack; higher traffic may require dedicated edge controls. No new migrations or dependencies are needed.

Validation: `node tests/help.mjs`, existing API suite, TypeScript and production build. Managed browser QA unavailable in this session.

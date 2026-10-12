# Creator password recovery

Creators use **Forgot your password?** on `/login`, then `/forgot-password`. Email links open `/reset-password` with a token in the URL fragment; the client removes it from the address bar and submits it in a POST body. The recovery pages discourage indexing and use a no-referrer policy. Minty is hidden on those pages.

## Activate email delivery

The site needs a Resend sending API key and a verified sender domain. No email provider was configured during implementation, and the Stripe Projects CLI is unavailable in this environment; email provisioning and real delivery testing have not been completed.

1. Verify the QuizMint sending domain in Resend using the DNS records Resend supplies. A dedicated subdomain such as `mail.quizmint.co.uk` can keep email-provider DNS separate from existing mailbox settings.
2. Create a sending-only API key scoped to that verified domain.
3. Add `RESEND_API_KEY` as a **secret** in Sites settings.
4. Add `EMAIL_FROM`, for example `QuizMint <no-reply@mail.quizmint.co.uk>`, as an environment variable matching the verified domain. Do not paste credentials into chat or commit them.
5. Verify recovery using a registered creator address you control. Check the link, password change and change-notification delivery in both inbox and spam folders.

The request endpoint advertises unavailable status and refuses to issue links until the key and sender are configured. The configured flag does not prove DNS verification or delivery; Resend credentials and sender permissions must work in real testing. Existing creator accounts and ChatGPT admin authentication are unchanged.

## Security and limits

- Token: 32 cryptographically random bytes; only its SHA-256 digest is stored.
- Expiry: 30 minutes; one current token per creator. New requests replace older links.
- Reset requests: 10 per network address per 15 minutes, 3 per account email per 15 minutes, with generic accepted replies for existing and unknown accounts.
- Completion attempts: 20 per network address per 15 minutes; passwords must be 12–128 characters and confirmed twice.
- Transactions compare the original password hash and claim the single-use token atomically. Successful reset revokes all creator sessions and clears the browser cookie. It preserves quizzes, results, profile, credits and subscriptions. Users sign in normally afterwards.
- Resend delivery runs through the Worker execution context with a 15-second request timeout, so provider latency does not reveal account existence through the request response. Known and unknown addresses use the same database operations. Delivery failure invalidates that specific token and records a generic log without recipient, token or provider response.
- Emails are sent only to the stored creator address. The HTTPS link is pinned to `www.quizmint.co.uk`, avoiding attacker-controlled Host headers. Passwords never appear in emails or logs.
- Reset requests and change notices share an atomic daily send-attempt ceiling of **100 per UTC day**. Set `PASSWORD_RESET_DAILY_EMAIL_LIMIT` to a positive integer (maximum 100,000) after confirming your provider plan and expected usage. This is separate from the AI budget. Provider billing and quotas still apply.

Test with `node tests/password-reset.mjs`. Outbound email is mocked; tests do not send real messages. Browser/mobile verification and real inbox delivery require the configured service.

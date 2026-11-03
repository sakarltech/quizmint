# Surveys

Creators can create surveys under `/surveys`. Guest respondents use `/s/<id>` without an account. Surveys are anonymous unless the creator specifies a required, self-reported identifier label. A link can be forwarded and repeat submissions are allowed.

Creators can personalise a survey with a logo, cover photo and accent colour. PNG, JPEG and WebP uploads up to 10 MB are resized in the browser. Branding can be changed after responses have been received and appears in the preview and on the respondent link.

Questions support single choice, multiple choice, short text, long text, and a 1–5 rating. Questions are required by default. Single-choice options can continue to the next question, jump forward, or end the survey. Optional unanswered branching questions continue to the next question. The server validates the submitted path and only requires questions shown on that path. Results distinguish skipped and unseen questions.

Questions and identifier settings lock after the first response. Title, description, and closing message remain editable. Duplicate the survey to revise its structure. Creators can close, reopen, or delete surveys. Deletion permanently removes their responses.

Existing QuizMint question documents can be imported; recognised questions with fewer than two options become short-text questions. AI survey drafting uses the existing AI wallet and one question credit per question. Review all imported and generated questions. The dashboard currently lists up to 100 surveys and shows/exports the most recent 1,000 responses for a survey.

Apply `drizzle/0012_surveys.sql` after prior migrations before enabling the feature. Run `node tests/surveys.mjs`, `node tests/api.mjs`, and the TypeScript and build checks to validate changes. Survey replies and any creator-selected identifier are personal data when they identify someone; do not place sensitive information in AI topics.

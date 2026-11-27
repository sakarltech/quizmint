# Surveys

Creators can create surveys under `/surveys`. Guest respondents use `/s/<id>` without an account. Surveys are anonymous unless the creator specifies a required, self-reported identifier label. A link can be forwarded and repeat submissions are allowed.

Creators can personalise a survey with a logo, cover photo and accent colour. PNG, JPEG and WebP uploads up to 10 MB are resized in the browser. Branding can be changed after responses have been received and appears in the preview and on the respondent link.

Questions support single choice, multiple choice, short text, long text, and a 1–5 rating. Questions are required by default. Single-choice options can continue to the next question, jump forward, or end the survey. Optional unanswered branching questions continue to the next question. The server validates the submitted path and only requires questions shown on that path. Results distinguish skipped and unseen questions.

Questions and identifier settings lock after the first response. Title, description, and closing message remain editable. Duplicate the survey to revise its structure. Creators can close, reopen, or delete surveys. Deletion permanently removes their responses.

Existing QuizMint question documents can be imported; recognised questions with fewer than two options become short-text questions. AI survey drafting uses the existing AI wallet and one question credit per question. Review all imported and generated questions. The dashboard currently lists up to 100 surveys and shows/exports the most recent 1,000 responses for a survey.

Apply `drizzle/0012_surveys.sql` after prior migrations before enabling the feature. Run `node tests/surveys.mjs`, `node tests/api.mjs`, and the TypeScript and build checks to validate changes. Survey replies and any creator-selected identifier are personal data when they identify someone; do not place sensitive information in AI topics.

## Namecheap release

Use the existing QuizMint Node environment and app root. Check that cPanel and the CLI select the same database. Export a fresh SQL backup before applying the migration and keep the previous application revision available for rollback. Keep the private configuration, OpenAI key and upload directory in place.

After deploying the tested branch and installing its locked dependencies, run the following commands. Enter the production database name confirmed in cPanel when prompted.

```sh
read -r SURVEY_DATABASE
npm run db:check:namecheap
npm run db:migrate:surveys:namecheap -- --database="$SURVEY_DATABASE"
npm run build:namecheap
npm run db:migrate:surveys:namecheap -- --database="$SURVEY_DATABASE" --apply
npm run db:migrate:surveys:namecheap -- --database="$SURVEY_DATABASE"
```

The preview checks the selected database and reports which survey tables exist. The apply command runs only `migrations/mariadb/0002_surveys.sql`. It creates `surveys` and `survey_responses` and can be repeated after a successful run. Use the empty-database setup command only for a fresh fixture. Restart QuizMint in cPanel after the migration succeeds. Then sign in, publish a survey, use a private window to submit both branches, check required fields, verify the results and CSV, and submit an existing quiz.

To test the same survey routes against native SQL, use a disposable MariaDB database named `quizmint_survey_test` or `quizmint_survey_test_<suffix>`. Load the initial schema, apply the survey migration and ensure the account suspension columns used by the running application are present. Run `node tests/surveys.mjs --namecheap` with that database's private connection settings available as environment variables. This test registers fixture accounts and uses a mocked AI provider.

CREATE TABLE surveys (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES creator_users(id), survey TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, updated INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX survey_owner_created_idx ON surveys(owner_id,created,id);
--> statement-breakpoint
CREATE TABLE survey_responses (id TEXT PRIMARY KEY NOT NULL, survey_id TEXT NOT NULL REFERENCES surveys(id), identifier TEXT, answers TEXT NOT NULL, seen TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX survey_response_created_idx ON survey_responses(survey_id,created,id);

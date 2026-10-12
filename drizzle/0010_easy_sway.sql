CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`student` text NOT NULL,
	`snapshot` text NOT NULL,
	`answers` text NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`deadline` integer DEFAULT 0 NOT NULL,
	`result` text,
	`started` integer NOT NULL,
	`updated` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_sessions_token_hash_unique` ON `quiz_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `quiz_session_quiz_idx` ON `quiz_sessions` (`quiz_id`);--> statement-breakpoint
ALTER TABLE `quizzes` ADD `time_limit_minutes` integer DEFAULT 0 NOT NULL;
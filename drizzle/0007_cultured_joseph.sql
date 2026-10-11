CREATE TABLE `ai_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_queue_status_created_idx` ON `ai_queue` (`status`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `ai_queue_user_status_idx` ON `ai_queue` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`feature` text NOT NULL,
	`model` text NOT NULL,
	`user_id` text,
	`reserved_micro` integer NOT NULL,
	`cost_micro` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_month_status_idx` ON `ai_usage` (`month`,`status`);--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `public_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`quiz` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`copies` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_quiz_published_created_idx` ON `public_quizzes` (`published`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `public_quiz_owner_idx` ON `public_quizzes` (`owner_id`);--> statement-breakpoint
CREATE INDEX `ai_job_user_status_created_idx` ON `ai_jobs` (`user_id`,`status`,`created`);--> statement-breakpoint
CREATE INDEX `attempt_quiz_created_idx` ON `attempts` (`quiz_id`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `quiz_owner_created_idx` ON `quizzes` (`owner_id`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `quiz_created_idx` ON `quizzes` (`created`,`id`);
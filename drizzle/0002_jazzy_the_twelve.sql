CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`free` integer NOT NULL,
	`paid` integer NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`free_remaining` integer DEFAULT 20 NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`subscription_end` integer DEFAULT 0 NOT NULL,
	`customer` text,
	`lock_id` text,
	`locked_until` integer DEFAULT 0 NOT NULL
);

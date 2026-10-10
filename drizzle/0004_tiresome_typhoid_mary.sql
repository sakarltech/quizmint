CREATE TABLE `arena_answers` (
	`room_code` text NOT NULL,
	`player_id` text NOT NULL,
	`question_index` integer NOT NULL,
	`selected` integer NOT NULL,
	`points` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`room_code`, `player_id`, `question_index`),
	FOREIGN KEY (`player_id`) REFERENCES `arena_players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `arena_answers_round_idx` ON `arena_answers` (`room_code`,`question_index`);--> statement-breakpoint
CREATE TABLE `arena_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`joined` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `arena_rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `arena_token_idx` ON `arena_players` (`room_code`,`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `arena_name_idx` ON `arena_players` (`room_code`,`name_key`);--> statement-breakpoint
CREATE TABLE `arena_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`quiz_id` text NOT NULL,
	`questions` text NOT NULL,
	`mode` text NOT NULL,
	`seconds` integer NOT NULL,
	`status` text NOT NULL,
	`question_index` integer NOT NULL,
	`deadline` integer NOT NULL,
	`remaining` integer NOT NULL,
	`version` integer NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `arena_owner_idx` ON `arena_rooms` (`owner_id`,`expires`);
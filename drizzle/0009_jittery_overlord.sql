CREATE TABLE `creator_password_resets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`password_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `creator_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_password_resets_token_hash_unique` ON `creator_password_resets` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_expires_idx` ON `creator_password_resets` (`expires`);
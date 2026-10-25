-- MariaDB / InnoDB initial schema. Generated from the existing D1 schema.
-- Empty database only. No production data or credentials are included.
-- SQLite FTS5 is replaced by a native FULLTEXT index on public_quizzes.

CREATE TABLE `ai_budgets` (
  `month` VARCHAR(191) NOT NULL,
  `cost_micro` BIGINT NOT NULL DEFAULT 0,
  `reserved_micro` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `ai_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `free` BIGINT NOT NULL,
  `paid` BIGINT NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `result` LONGTEXT NULL,
  `created` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ai_job_user_status_created_idx` (`user_id`, `status`, `created`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `ai_payments` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created` BIGINT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `ai_queue` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `created` BIGINT NOT NULL,
  `expires` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ai_queue_user_status_idx` (`user_id`, `status`),
  KEY `ai_queue_status_created_idx` (`status`, `created`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `ai_usage` (
  `id` VARCHAR(191) NOT NULL,
  `month` VARCHAR(191) NOT NULL,
  `feature` LONGTEXT NOT NULL,
  `model` LONGTEXT NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `reserved_micro` BIGINT NOT NULL,
  `cost_micro` BIGINT NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL,
  `input_tokens` BIGINT NOT NULL DEFAULT 0,
  `output_tokens` BIGINT NOT NULL DEFAULT 0,
  `duration_ms` BIGINT NOT NULL DEFAULT 0,
  `created` BIGINT NOT NULL,
  `expires` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ai_usage_status_expires_idx` (`status`, `expires`),
  KEY `ai_usage_created_idx` (`created`),
  KEY `ai_usage_month_status_idx` (`month`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `ai_wallets` (
  `user_id` VARCHAR(191) NOT NULL,
  `free_remaining` BIGINT NOT NULL DEFAULT 20,
  `credits` BIGINT NOT NULL DEFAULT 0,
  `subscription_end` BIGINT NOT NULL DEFAULT 0,
  `customer` LONGTEXT NULL,
  `lock_id` VARCHAR(191) NULL,
  `locked_until` BIGINT NOT NULL DEFAULT 0,
  `free_period_start` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `arena_rooms` (
  `code` VARCHAR(191) NOT NULL,
  `owner_id` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `quiz_id` VARCHAR(191) NOT NULL,
  `questions` LONGTEXT NOT NULL,
  `mode` LONGTEXT NOT NULL,
  `seconds` BIGINT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `question_index` BIGINT NOT NULL,
  `deadline` BIGINT NOT NULL,
  `remaining` BIGINT NOT NULL,
  `version` BIGINT NOT NULL,
  `created` BIGINT NOT NULL,
  `expires` BIGINT NOT NULL,
  PRIMARY KEY (`code`),
  KEY `arena_owner_idx` (`owner_id`, `expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `auth_limits` (
  `key` VARCHAR(191) NOT NULL,
  `window` BIGINT NOT NULL,
  `count` BIGINT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `creator_profiles` (
  `user_id` VARCHAR(191) NOT NULL,
  `profile` LONGTEXT NOT NULL,
  `updated` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `creator_users` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `salt` VARCHAR(191) NOT NULL,
  `created` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `creator_users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `platform_settings` (
  `id` VARCHAR(191) NOT NULL,
  `value` LONGTEXT NOT NULL,
  `updated` BIGINT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `public_quizzes` (
  `id` VARCHAR(191) NOT NULL,
  `owner_id` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `subject` LONGTEXT NOT NULL,
  `quiz` LONGTEXT NOT NULL,
  `published` BIGINT NOT NULL DEFAULT 1,
  `copies` BIGINT NOT NULL DEFAULT 0,
  `created` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `public_quiz_owner_idx` (`owner_id`),
  KEY `public_quiz_published_created_idx` (`published`, `created`, `id`),
  FULLTEXT KEY `public_quiz_search_idx` (`title`, `subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `quizzes` (
  `id` VARCHAR(191) NOT NULL,
  `title` LONGTEXT NOT NULL,
  `subject` LONGTEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `questions` LONGTEXT NOT NULL,
  `active` BIGINT NOT NULL DEFAULT 1,
  `created` VARCHAR(191) NOT NULL,
  `owner_id` VARCHAR(191) NULL,
  `time_limit_minutes` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `quiz_created_idx` (`created`, `id`),
  KEY `quiz_owner_created_idx` (`owner_id`, `created`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `arena_players` (
  `id` VARCHAR(191) NOT NULL,
  `room_code` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `name` LONGTEXT NOT NULL,
  `name_key` VARCHAR(191) NOT NULL,
  `joined` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `arena_name_idx` (`room_code`, `name_key`),
  UNIQUE KEY `arena_token_idx` (`room_code`, `token_hash`),
  CONSTRAINT `fk_arena_players_room_code` FOREIGN KEY (`room_code`) REFERENCES `arena_rooms` (`code`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `attempts` (
  `id` VARCHAR(191) NOT NULL,
  `quiz_id` VARCHAR(191) NOT NULL,
  `student` LONGTEXT NOT NULL,
  `score` BIGINT NOT NULL,
  `total` BIGINT NOT NULL,
  `result` LONGTEXT NOT NULL,
  `created` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `attempt_quiz_created_idx` (`quiz_id`, `created`, `id`),
  CONSTRAINT `fk_attempts_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `creator_password_resets` (
  `user_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `expires` BIGINT NOT NULL,
  `used` BIGINT NOT NULL DEFAULT 0,
  `created` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `password_reset_expires_idx` (`expires`),
  UNIQUE KEY `creator_password_resets_token_hash_unique` (`token_hash`),
  CONSTRAINT `fk_creator_password_resets_user_id` FOREIGN KEY (`user_id`) REFERENCES `creator_users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `creator_sessions` (
  `token_hash` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `expires` BIGINT NOT NULL,
  PRIMARY KEY (`token_hash`),
  CONSTRAINT `fk_creator_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `creator_users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `quiz_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `quiz_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `student` LONGTEXT NOT NULL,
  `snapshot` LONGTEXT NOT NULL,
  `answers` LONGTEXT NOT NULL,
  `step` BIGINT NOT NULL DEFAULT 0,
  `revision` BIGINT NOT NULL DEFAULT 0,
  `deadline` BIGINT NOT NULL DEFAULT 0,
  `result` LONGTEXT NULL,
  `started` BIGINT NOT NULL,
  `updated` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `quiz_session_quiz_idx` (`quiz_id`),
  UNIQUE KEY `quiz_sessions_token_hash_unique` (`token_hash`),
  CONSTRAINT `fk_quiz_sessions_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `arena_answers` (
  `room_code` VARCHAR(191) NOT NULL,
  `player_id` VARCHAR(191) NOT NULL,
  `question_index` BIGINT NOT NULL,
  `selected` BIGINT NOT NULL,
  `points` BIGINT NOT NULL,
  `created` BIGINT NOT NULL,
  PRIMARY KEY (`room_code`, `player_id`, `question_index`),
  KEY `arena_answers_round_idx` (`room_code`, `question_index`),
  CONSTRAINT `fk_arena_answers_player_id` FOREIGN KEY (`player_id`) REFERENCES `arena_players` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

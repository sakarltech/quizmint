CREATE TABLE IF NOT EXISTS surveys (
  id CHAR(32) NOT NULL,
  owner_id VARCHAR(191) NOT NULL,
  survey LONGTEXT NOT NULL,
  active TINYINT NOT NULL DEFAULT 1,
  created BIGINT NOT NULL,
  updated BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY survey_owner_created_idx (owner_id, created, id),
  CONSTRAINT survey_creator_fk FOREIGN KEY (owner_id) REFERENCES creator_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS survey_responses (
  id CHAR(36) NOT NULL,
  survey_id CHAR(32) NOT NULL,
  identifier VARCHAR(254) NULL,
  answers LONGTEXT NOT NULL,
  seen LONGTEXT NOT NULL,
  created BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY survey_response_created_idx (survey_id, created, id),
  CONSTRAINT survey_response_survey_fk FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

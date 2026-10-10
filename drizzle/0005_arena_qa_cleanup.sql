-- Remove only the synthetic room left by the interrupted production smoke test.
-- Require its exact code, title and synthetic creator email before touching data.
DELETE FROM creator_sessions WHERE user_id IN (
 SELECT r.owner_id FROM arena_rooms r JOIN creator_users u ON u.id=r.owner_id
 WHERE r.code='CJ6CRV' AND r.title='Arena QA — temporary' AND u.email LIKE 'arena-check-%@quizmint.invalid'
);
--> statement-breakpoint
DELETE FROM attempts WHERE quiz_id IN (
 SELECT r.quiz_id FROM arena_rooms r JOIN creator_users u ON u.id=r.owner_id JOIN quizzes q ON q.id=r.quiz_id AND q.owner_id=r.owner_id
 WHERE r.code='CJ6CRV' AND r.title='Arena QA — temporary' AND q.title='Arena QA — temporary' AND u.email LIKE 'arena-check-%@quizmint.invalid'
);
--> statement-breakpoint
DELETE FROM quizzes WHERE id IN (
 SELECT r.quiz_id FROM arena_rooms r JOIN creator_users u ON u.id=r.owner_id
 WHERE r.code='CJ6CRV' AND r.title='Arena QA — temporary' AND u.email LIKE 'arena-check-%@quizmint.invalid'
) AND title='Arena QA — temporary';
--> statement-breakpoint
DELETE FROM arena_answers WHERE room_code IN (
 SELECT r.code FROM arena_rooms r JOIN creator_users u ON u.id=r.owner_id
 WHERE r.code='CJ6CRV' AND r.title='Arena QA — temporary' AND u.email LIKE 'arena-check-%@quizmint.invalid'
);
--> statement-breakpoint
DELETE FROM arena_players WHERE room_code IN (
 SELECT r.code FROM arena_rooms r JOIN creator_users u ON u.id=r.owner_id
 WHERE r.code='CJ6CRV' AND r.title='Arena QA — temporary' AND u.email LIKE 'arena-check-%@quizmint.invalid'
);
--> statement-breakpoint
DELETE FROM arena_rooms WHERE code='CJ6CRV' AND title='Arena QA — temporary' AND owner_id IN (
 SELECT id FROM creator_users WHERE email LIKE 'arena-check-%@quizmint.invalid'
);

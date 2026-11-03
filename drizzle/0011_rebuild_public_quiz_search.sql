-- Backfill the external-content index for quizzes published before FTS existed.
INSERT INTO public_quiz_search(public_quiz_search) VALUES('rebuild');

CREATE TABLE `ai_budgets` (
	`month` text PRIMARY KEY NOT NULL,
	`cost_micro` integer DEFAULT 0 NOT NULL,
	`reserved_micro` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_status_expires_idx` ON `ai_usage` (`status`,`expires`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `public_quiz_search` USING fts5(title,subject,content='public_quizzes',content_rowid='rowid');
--> statement-breakpoint
CREATE TRIGGER public_quiz_search_insert AFTER INSERT ON public_quizzes BEGIN INSERT INTO public_quiz_search(rowid,title,subject) VALUES(new.rowid,new.title,new.subject); END;
--> statement-breakpoint
CREATE TRIGGER public_quiz_search_delete AFTER DELETE ON public_quizzes BEGIN INSERT INTO public_quiz_search(public_quiz_search,rowid,title,subject) VALUES('delete',old.rowid,old.title,old.subject); END;
--> statement-breakpoint
CREATE TRIGGER public_quiz_search_update AFTER UPDATE OF title,subject ON public_quizzes BEGIN INSERT INTO public_quiz_search(public_quiz_search,rowid,title,subject) VALUES('delete',old.rowid,old.title,old.subject); INSERT INTO public_quiz_search(rowid,title,subject) VALUES(new.rowid,new.title,new.subject); END;

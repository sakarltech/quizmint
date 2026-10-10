import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const quizzes = sqliteTable('quizzes', { id: text('id').primaryKey(), title: text('title').notNull(), subject: text('subject').notNull(), description: text('description').notNull(), questions: text('questions').notNull(), active: integer('active').notNull().default(1), created: text('created').notNull(), ownerId: text('owner_id') });
export const attempts = sqliteTable('attempts', { id: text('id').primaryKey(), quizId: text('quiz_id').notNull().references(()=>quizzes.id), student: text('student').notNull(), score: integer('score').notNull(), total: integer('total').notNull(), result: text('result').notNull(), created: text('created').notNull() });

export const creatorUsers=sqliteTable('creator_users',{id:text('id').primaryKey(),email:text('email').notNull().unique(),passwordHash:text('password_hash').notNull(),salt:text('salt').notNull(),created:text('created').notNull()});
export const creatorSessions=sqliteTable('creator_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull().references(()=>creatorUsers.id),expires:integer('expires').notNull()});
export const authLimits=sqliteTable('auth_limits',{key:text('key').primaryKey(),window:integer('window').notNull(),count:integer('count').notNull()});

export const aiWallets=sqliteTable('ai_wallets',{userId:text('user_id').primaryKey(),freeRemaining:integer('free_remaining').notNull().default(20),credits:integer('credits').notNull().default(0),subscriptionEnd:integer('subscription_end').notNull().default(0),customer:text('customer'),lockId:text('lock_id'),lockedUntil:integer('locked_until').notNull().default(0)});
export const aiJobs=sqliteTable('ai_jobs',{id:text('id').primaryKey(),userId:text('user_id').notNull(),free:integer('free').notNull(),paid:integer('paid').notNull(),status:text('status').notNull(),result:text('result'),created:integer('created').notNull()});
export const aiPayments=sqliteTable('ai_payments',{id:text('id').primaryKey(),userId:text('user_id').notNull(),created:integer('created').notNull()});

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { people } from './person.schema.js';

// code_reviews, no reviews: la tabla reviews existente es spaced repetition de conceptos
export const codeReviews = sqliteTable('code_reviews', {
  id: text('id').primaryKey(),
  user_id: text('user_id'),
  title: text('title').notNull(),
  url: text('url'),
  dev_id: text('dev_id').references(() => people.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'),
  due_date: text('due_date'),
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

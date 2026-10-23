import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { domains } from './domain.schema.js';

export const project_skills = sqliteTable('project_skills', {
  id: text('id').primaryKey(),
  domain_id: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  skill_ref: text('skill_ref').notNull(),
  source: text('source').notNull(),
  created_at: text('created_at').notNull()
});

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { domains } from './domain.schema.js';

// Log de solo-append: sin updated_at/delete, se alimenta enganchando al eventBus (ver
// project-activity.subscriber.ts).
export const project_activity = sqliteTable('project_activity', {
  id: text('id').primaryKey(),
  domain_id: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  summary: text('summary').notNull(),
  source: text('source').notNull(),
  created_at: text('created_at').notNull()
});

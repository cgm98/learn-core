import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { domains } from './domain.schema.js';

// Un proyecto sandbox ES un dominio existente + esta metadata (ver ADR-003): no hay un id
// propio, domain_id es la PK.
export const project_metadata = sqliteTable('project_metadata', {
  domain_id: text('domain_id').primaryKey().references(() => domains.id, { onDelete: 'cascade' }),
  local_path: text('local_path').notNull(),
  watch_enabled: integer('watch_enabled', { mode: 'boolean' }).notNull().default(false),
  // Rama y commit del working tree al momento de indexar (Fase 5). NULL si el proyecto
  // no es un repo git.
  indexed_commit: text('indexed_commit'),
  indexed_branch: text('indexed_branch'),
  last_indexed_at: text('last_indexed_at'),
  created_at: text('created_at').notNull()
});

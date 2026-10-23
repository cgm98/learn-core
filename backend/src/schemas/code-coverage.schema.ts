import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { code_symbols } from './code-graph.schema.js';

// Coverage por símbolo, ingerido offline desde un reporte istanbul coverage-final.json
// (server/src/scripts/import-coverage.ts) — no hay instrumentación de coverage corriendo
// en este repo hoy (ni server/'s node:test ni client/'s vitest la tienen configurada), así
// que esta tabla queda vacía hasta que alguien corra el script contra un reporte real.
// Un símbolo, una fila (upsert al reingerir) — igual que concept_layout con concepts.
export const code_symbol_coverage = sqliteTable('code_symbol_coverage', {
  symbol_id: text('symbol_id').primaryKey().references(() => code_symbols.id, { onDelete: 'cascade' }),
  statements_total: integer('statements_total').notNull(),
  statements_covered: integer('statements_covered').notNull(),
  coverage_pct: real('coverage_pct').notNull(),
  source: text('source').notNull(),
  updated_at: text('updated_at').notNull()
});

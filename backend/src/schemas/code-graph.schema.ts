import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Reemplaza el grafo de código de Kuzu (File/Symbol/DEFINES/IMPORTS/CALLS/EXTENDS,
// ADR-004). code_edges unifica los 4 tipos de relación en una sola tabla — coincide
// exactamente con la forma { type, from, to } que ya consume /code-graph
// (graph-reader.ts), así que la lectura es un solo SELECT en vez de cuatro.
export const code_files = sqliteTable('code_files', {
  path: text('path').primaryKey(),
  hash: text('hash').notNull().default(''),
  lang: text('lang').notNull(),
  domain_id: text('domain_id').notNull(),
  updated_at: integer('updated_at').notNull()
});

export const code_symbols = sqliteTable('code_symbols', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  file_path: text('file_path').notNull(),
  domain_id: text('domain_id').notNull(),
  start_line: integer('start_line').notNull(),
  end_line: integer('end_line').notNull()
});

// edge_type: 'DEFINES' | 'IMPORTS' | 'CALLS' | 'EXTENDS'. from_id/to_id son heterogéneos
// (path de File o id de Symbol según el tipo) — sin FK declarada por eso; el cascade de
// borrado se maneja a mano en graph-writer.ts, igual que el DETACH DELETE que hacía Kuzu.
export const code_edges = sqliteTable('code_edges', {
  id: text('id').primaryKey(),
  edge_type: text('edge_type').notNull(),
  from_id: text('from_id').notNull(),
  to_id: text('to_id').notNull(),
  domain_id: text('domain_id').notNull()
});

// Diff journal (docs/UNF/2026-08-08-mcp-unfair-advantages-deep-tech.md §1): log append-only
// de cada archivo que el watcher reindexó o borró. Granularidad de archivo, no de símbolo —
// es lo que watcher.ts ya emite (symbolCount, no ids), no vale inventar plumbing nueva en el
// indexer solo para esto. change_type espeja los dos eventos de watcher.ts.
export const code_change_journal = sqliteTable('code_change_journal', {
  id: text('id').primaryKey(),
  domain_id: text('domain_id').notNull(),
  file_path: text('file_path').notNull(),
  change_type: text('change_type').notNull(),
  symbol_count: integer('symbol_count').notNull().default(0),
  changed_at: text('changed_at').notNull()
});

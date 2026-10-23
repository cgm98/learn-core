import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Historical filenames are retained; the dependency order is explicit because
// 001 references code_edges, which is first created by 003.
const MIGRATIONS = [
  '003_type_script_graph.sql',
  '002_semantic_calls.sql',
  '001_impact_lookup.sql'
];

function hasTable(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function verifyCoreSchema(db) {
  for (const [table, columns] of Object.entries({
    code_files: ['path', 'hash', 'lang', 'domain_id', 'updated_at'],
    code_symbols: ['id', 'name', 'kind', 'file_path', 'domain_id', 'start_line', 'end_line'],
    code_edges: ['id', 'edge_type', 'from_id', 'to_id', 'domain_id']
  })) {
    if (!hasTable(db, table)) throw new Error(`Falta la tabla ${table}; ejecuta npm run db:migrate si es una base heredada`);
    const actual = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
    for (const column of columns) if (!actual.has(column)) throw new Error(`Esquema incompatible: falta ${table}.${column}`);
  }
}

export function applyMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(row => row.name));
  const completed = [];
  for (const name of MIGRATIONS) {
    if (applied.has(name)) continue;
    const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
      db.exec('COMMIT');
      completed.push(name);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Falló la migración ${name}: ${error.message}`, { cause: error });
    }
  }
  verifyCoreSchema(db);
  return completed;
}

/** New and managed databases migrate on startup. Legacy databases require db:migrate. */
export function initializeDatabase(dbPath, { migrateExisting = false } = {}) {
  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const existed = existsSync(absolutePath);
  const db = new DatabaseSync(absolutePath);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    const managed = hasTable(db, 'schema_migrations');
    const empty = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().n === 0;
    const shouldMigrate = !existed || empty || managed || migrateExisting;
    if (shouldMigrate) db.exec('PRAGMA journal_mode = WAL');
    const migrationsApplied = shouldMigrate ? applyMigrations(db) : [];
    verifyCoreSchema(db);
    return { path: absolutePath, created: !existed, legacy: existed && !empty && !managed && !migrateExisting, migrationsApplied };
  } finally { db.close(); }
}

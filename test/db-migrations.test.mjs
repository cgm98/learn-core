import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase } from '../src/db-migrations.mjs';

test('crea una base ausente, registra migraciones y conserva datos al reiniciar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-db-init-'));
  const path = join(dir, 'nested', 'learn_code.db');
  try {
    assert.equal(existsSync(path), false);
    const first = initializeDatabase(path);
    assert.equal(first.created, true);
    assert.equal(first.migrationsApplied.length, 3);
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO code_files (path, hash, lang, domain_id, updated_at) VALUES (?, ?, ?, ?, ?)').run('a.ts', 'hash', 'typescript', 'demo', 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 3);
    db.close();
    const second = initializeDatabase(path);
    assert.equal(second.created, false);
    assert.deepEqual(second.migrationsApplied, []);
    const check = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(check.prepare('SELECT count(*) AS n FROM code_files').get().n, 1); }
    finally { check.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mantiene una base heredada sin migrarla automáticamente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-db-legacy-'));
  const path = join(dir, 'legacy.db');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE code_files(path TEXT PRIMARY KEY, hash TEXT, lang TEXT, domain_id TEXT, updated_at INTEGER);
      CREATE TABLE code_symbols(id TEXT PRIMARY KEY, name TEXT, kind TEXT, file_path TEXT, domain_id TEXT, start_line INTEGER, end_line INTEGER);
      CREATE TABLE code_edges(id TEXT PRIMARY KEY, edge_type TEXT, from_id TEXT, to_id TEXT, domain_id TEXT);
      INSERT INTO code_files VALUES ('a.ts','h','typescript','demo',1);`);
    db.close();
    const existing = initializeDatabase(path);
    assert.equal(existing.legacy, true);
    assert.deepEqual(existing.migrationsApplied, []);
    const before = new DatabaseSync(path, { readOnly: true });
    assert.equal(before.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'schema_migrations'").get().n, 0);
    before.close();
    const migrated = initializeDatabase(path, { migrateExisting: true });
    assert.equal(migrated.migrationsApplied.length, 3);
    const after = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(after.prepare('SELECT count(*) AS n FROM code_files').get().n, 1); }
    finally { after.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('no sobrescribe un archivo de base inválido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-db-invalid-'));
  const path = join(dir, 'invalid.db');
  try {
    writeFileSync(path, 'not a sqlite database');
    assert.throws(() => initializeDatabase(path));
    assert.equal(readFileSync(path, 'utf8'), 'not a sqlite database');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { collectSemanticCalls, replaceSemanticCalls } from '../src/typescript-semantic.mjs';
import { SqliteImpactStore } from '../src/sqlite-impact-store.mjs';
import { analyzeImpact } from '../src/impact.mjs';

test('resuelve llamadas por símbolo y elimina aristas obsoletas al reindexar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-semantic-'));
  const dbPath = join(dir, 'graph.db');
  const a = join(dir, 'a.ts');
  const b = join(dir, 'b.ts');
  const config = join(dir, 'tsconfig.json');
  let db;
  try {
    writeFileSync(a, 'export function target() { return 1; }\n');
    writeFileSync(b, "import { target } from './a';\nexport function caller() { return target(); }\n");
    writeFileSync(config, JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'es2022' }, include: ['*.ts'] }));
    db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE code_files(path TEXT PRIMARY KEY, lang TEXT, domain_id TEXT, updated_at INTEGER);
      CREATE TABLE code_symbols(id TEXT PRIMARY KEY, name TEXT, kind TEXT, file_path TEXT, domain_id TEXT, start_line INTEGER, end_line INTEGER);
      CREATE TABLE code_edges(id TEXT PRIMARY KEY, edge_type TEXT, from_id TEXT, to_id TEXT, domain_id TEXT);`);
    db.exec(readFileSync(new URL('../migrations/002_semantic_calls.sql', import.meta.url), 'utf8'));
    for (const file of [a, b]) db.prepare('INSERT INTO code_files VALUES (?, ?, ?, ?)').run(file, 'typescript', 'p', 1);
    db.prepare('INSERT INTO code_symbols VALUES (?, ?, ?, ?, ?, ?, ?)').run('target-id', 'target', 'function', a, 'p', 1, 1);
    db.prepare('INSERT INTO code_symbols VALUES (?, ?, ?, ?, ?, ?, ?)').run('caller-id', 'caller', 'function', b, 'p', 2, 2);
    const symbols = db.prepare('SELECT id, file_path, start_line, name FROM code_symbols').all();
    const first = collectSemanticCalls(ts, config, symbols);
    assert.equal(first.calls.length, 1);
    assert.deepEqual([first.calls[0].sourceId, first.calls[0].targetId], ['caller-id', 'target-id']);
    assert.equal(collectSemanticCalls(ts, config, [...symbols, { ...symbols[0], id: 'ambiguous-id' }]).calls.length, 0);
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../src/semantic-index-cli.mjs', import.meta.url)), '--db', dbPath, '--domain', 'p', '--tsconfig', config], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).calls, 1);
    replaceSemanticCalls(db, 'p', first);
    db.close(); db = null;

    const store = new SqliteImpactStore(dbPath);
    try {
      const impact = analyzeImpact(store, { domainId: 'p', focusId: 'target-id' });
      assert.equal(impact.affected[0].node.id, 'caller-id');
      assert.equal(impact.affected[0].path[0].evidence, 'typescript_compiler');
    } finally { store.close(); }

    writeFileSync(b, "import { target } from './a';\nexport function caller() { return 2; }\n");
    db = new DatabaseSync(dbPath);
    replaceSemanticCalls(db, 'p', collectSemanticCalls(ts, config, symbols));
    assert.equal(db.prepare('SELECT count(*) AS n FROM semantic_calls').get().n, 0);
  } finally {
    if (db?.isOpen) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

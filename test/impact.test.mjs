import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { analyzeImpact } from '../src/impact.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE code_files(path TEXT PRIMARY KEY, lang TEXT, domain_id TEXT, updated_at INTEGER);
    CREATE TABLE code_symbols(id TEXT PRIMARY KEY, name TEXT, kind TEXT, file_path TEXT, domain_id TEXT, start_line INTEGER, end_line INTEGER);
    CREATE TABLE code_edges(id TEXT PRIMARY KEY, edge_type TEXT, from_id TEXT, to_id TEXT, domain_id TEXT);`);
  for (const [id, domain] of [['a', 'one'], ['b', 'one'], ['c', 'one'], ['x', 'two']]) {
    db.prepare('INSERT INTO code_files VALUES (?, ?, ?, ?)').run(id, 'ts', domain, 1);
  }
  for (const [id, type, from, to, domain] of [
    ['1', 'IMPORTS', 'b', 'a', 'one'], ['2', 'IMPORTS', 'c', 'b', 'one'],
    ['3', 'IMPORTS', 'a', 'c', 'one'], ['4', 'IMPORTS', 'x', 'a', 'two']
  ]) db.prepare('INSERT INTO code_edges VALUES (?, ?, ?, ?, ?)').run(id, type, from, to, domain);
  return {
    getNode(domain, id) { const row = db.prepare('SELECT path AS id FROM code_files WHERE domain_id = ? AND path = ?').get(domain, id); return row ? { ...row, nodeType: 'file' } : null; },
    getDependents(domain, id) { return db.prepare('SELECT edge_type AS type, from_id AS "from", to_id AS "to" FROM code_edges WHERE domain_id = ? AND to_id = ? ORDER BY from_id').all(domain, id); },
    close() { db.close(); }
  };
}

test('recorre dependientes en dirección de impacto, conserva rutas y aísla dominios', () => {
  const store = fixture();
  try {
    const result = analyzeImpact(store, { domainId: 'one', focusId: 'a' });
    assert.deepEqual(result.affected.map(x => x.node.id), ['b', 'c']);
    assert.deepEqual(result.affected[1].path.map(x => x.from), ['b', 'c']);
    assert.equal(result.truncated, false);
  } finally { store.close(); }
});

test('declara truncamiento y ausencia de índice', () => {
  const store = fixture();
  try {
    assert.equal(analyzeImpact(store, { domainId: 'one', focusId: 'a', maxDepth: 1 }).truncated, true);
    assert.equal(analyzeImpact(store, { domainId: 'one', focusId: 'a', maxNodes: 1 }).truncated, true);
    assert.equal(analyzeImpact(store, { domainId: 'one', focusId: 'missing' }).status, 'not_indexed');
  } finally { store.close(); }
});

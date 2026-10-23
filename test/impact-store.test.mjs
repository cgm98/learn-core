import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteImpactStore } from '../src/sqlite-impact-store.mjs';
import { analyzeImpact } from '../src/impact.mjs';

test('lee el esquema heredado sin modificarlo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-impact-'));
  const dbPath = join(dir, 'test.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`CREATE TABLE code_files(path TEXT PRIMARY KEY, lang TEXT, domain_id TEXT, updated_at INTEGER);
      CREATE TABLE code_symbols(id TEXT PRIMARY KEY, name TEXT, kind TEXT, file_path TEXT, domain_id TEXT, start_line INTEGER, end_line INTEGER);
      CREATE TABLE code_edges(id TEXT PRIMARY KEY, edge_type TEXT, from_id TEXT, to_id TEXT, domain_id TEXT);
      INSERT INTO code_files VALUES ('base.ts','ts','p',1),('caller.ts','ts','p',1);
      INSERT INTO code_symbols VALUES ('base#fn','fn','function','base.ts','p',1,3),('caller#fn','caller','function','caller.ts','p',1,5);
      INSERT INTO code_edges VALUES ('e1','CALLS','caller#fn','base#fn','p');`);
    db.close();
    const store = new SqliteImpactStore(dbPath);
    try {
      const result = analyzeImpact(store, { domainId: 'p', focusId: 'base#fn' });
      assert.equal(result.affected[0].node.id, 'caller#fn');
      assert.equal(result.affected[0].path[0].type, 'CALLS');
      const fileResult = analyzeImpact(store, { domainId: 'p', focusId: 'base.ts' });
      assert.deepEqual(fileResult.affected.map(x => x.node.id), ['base#fn', 'caller#fn']);
      assert.deepEqual(fileResult.affected[1].path.map(x => x.type), ['DEFINES', 'CALLS']);
    } finally { store.close(); }
  } finally {
    if (db.isOpen) db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

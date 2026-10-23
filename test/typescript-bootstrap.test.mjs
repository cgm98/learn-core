import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteImpactStore } from '../src/sqlite-impact-store.mjs';
import { analyzeImpact } from '../src/impact.mjs';

test('crea un índice TypeScript independiente y lo consulta extremo a extremo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-bootstrap-'));
  const dbPath = join(dir, 'new.db');
  const a = join(dir, 'a.ts');
  const b = join(dir, 'b.ts');
  const config = join(dir, 'tsconfig.json');
  try {
    writeFileSync(a, 'export function target() { return 1; }\n');
    writeFileSync(b, "import { target } from './a';\nexport function caller() { return target(); }\n");
    writeFileSync(config, JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'es2022' }, include: ['*.ts'] }));
    const cli = fileURLToPath(new URL('../src/typescript-bootstrap-cli.mjs', import.meta.url));
    const args = [cli, '--db', dbPath, '--domain', 'demo', '--tsconfig', config];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), { files: 2, symbols: 2, importEdges: 1, resolvedCalls: 1, unresolvedCalls: 0 });

    const store = new SqliteImpactStore(dbPath);
    try {
      const impact = analyzeImpact(store, { domainId: 'demo', focusId: a });
      assert.ok(impact.affected.some(item => item.node.path === b && item.path.some(edge => edge.type === 'IMPORTS')));
      assert.ok(impact.affected.some(item => item.node.name === 'caller' && item.path.some(edge => edge.type === 'RESOLVED_CALL')));
    } finally { store.close(); }

    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /ya tiene un índice/);
    writeFileSync(b, "import { target } from './a';\nexport function caller() { return 2; }\n");
    const refresh = spawnSync(process.execPath, [...args, '--refresh', 'true'], { encoding: 'utf8' });
    assert.equal(refresh.status, 0, refresh.stderr);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT count(*) AS n FROM code_files').get().n, 2);
      assert.equal(db.prepare('SELECT count(*) AS n FROM semantic_calls').get().n, 0);
    }
    finally { db.close(); }
    unlinkSync(b);
    const removed = spawnSync(process.execPath, [...args, '--refresh', 'true'], { encoding: 'utf8' });
    assert.equal(removed.status, 0, removed.stderr);
    const finalDb = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(finalDb.prepare('SELECT count(*) AS n FROM code_files').get().n, 1);
      assert.equal(finalDb.prepare('SELECT count(*) AS n FROM code_symbols').get().n, 1);
      assert.equal(finalDb.prepare("SELECT count(*) AS n FROM code_edges WHERE edge_type = 'IMPORTS'").get().n, 0);
    } finally { finalDb.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

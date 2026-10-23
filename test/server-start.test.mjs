import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('el arranque crea una base ausente e inicia el servicio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learn-core-server-'));
  const dbPath = join(dir, 'db', 'learn_code.db');
  const entry = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, LEARN_CODE_DB_PATH: dbPath, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error(`Timeout de arranque: ${output}`)), 10000);
      child.stderr.on('data', chunk => {
        output += chunk.toString();
        const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor terminó con ${code}: ${output}`)); });
    });
    assert.equal(existsSync(dbPath), true);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 3); }
    finally { db.close(); }
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    rmSync(dir, { recursive: true, force: true });
  }
});

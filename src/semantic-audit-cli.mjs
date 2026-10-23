import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { resolve } from 'node:path';
import { collectSemanticCalls } from './typescript-semantic.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Uso: npm run semantic:audit -- --db RUTA --domain ID --tsconfig RUTA [--immutable true]');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.db || !options.domain || !options.tsconfig) throw new Error('Faltan --db, --domain o --tsconfig');

const dbPath = resolve(options.db);
const filename = options.immutable === 'true' ? `file:${dbPath.replaceAll('\\', '/')}?immutable=1` : dbPath;
const db = new DatabaseSync(filename, { readOnly: true });
try {
  const symbols = db.prepare('SELECT id, file_path, start_line, end_line, name FROM code_symbols WHERE domain_id = ?').all(options.domain);
  const started = performance.now();
  const result = collectSemanticCalls(ts, options.tsconfig, symbols);
  process.stdout.write(`${JSON.stringify({
    files: result.files.length,
    indexedSymbols: symbols.length,
    resolvedCalls: result.calls.length,
    unresolvedCalls: result.unresolved,
    unresolvedReasons: result.unresolvedReasons,
    elapsedMs: Math.round(performance.now() - started),
    immutable: options.immutable === 'true'
  }, null, 2)}\n`);
} finally { db.close(); }

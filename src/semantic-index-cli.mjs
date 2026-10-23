import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectSemanticCalls, replaceSemanticCalls } from './typescript-semantic.mjs';

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Uso: npm run semantic:index -- --db RUTA --domain ID --tsconfig RUTA');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.db || !options.domain || !options.tsconfig) throw new Error('Faltan --db, --domain o --tsconfig');
  return options;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(resolve(args.db));
  try {
    const symbols = db.prepare('SELECT id, file_path, start_line, end_line, name FROM code_symbols WHERE domain_id = ?').all(args.domain);
    const result = collectSemanticCalls(ts, args.tsconfig, symbols);
    db.exec(readFileSync(new URL('../migrations/002_semantic_calls.sql', import.meta.url), 'utf8'));
    replaceSemanticCalls(db, args.domain, result);
    process.stdout.write(`${JSON.stringify({ files: result.files.length, calls: result.calls.length, unresolved: result.unresolved, unresolvedReasons: result.unresolvedReasons, scopeId: result.scopeId })}\n`);
  } finally { db.close(); }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

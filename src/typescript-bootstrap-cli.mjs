import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { collectTypeScriptGraph, writeTypeScriptGraph } from './typescript-bootstrap.mjs';
import { collectSemanticCalls } from './typescript-semantic.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Uso: npm run bootstrap:ts -- --db RUTA --domain ID --tsconfig RUTA [--refresh true]');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.db || !options.domain || !options.tsconfig) throw new Error('Faltan --db, --domain o --tsconfig');

const graph = collectTypeScriptGraph(ts, options.tsconfig, options.domain);
const semantic = collectSemanticCalls(ts, options.tsconfig, graph.symbols.map(s => ({ id: s.id, file_path: s.filePath, start_line: s.startLine, name: s.name })));
const db = new DatabaseSync(resolve(options.db));
try {
  db.exec(readFileSync(new URL('../migrations/003_type_script_graph.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/002_semantic_calls.sql', import.meta.url), 'utf8'));
  writeTypeScriptGraph(db, options.domain, graph, semantic, { refresh: options.refresh === 'true' });
  process.stdout.write(`${JSON.stringify({ files: graph.files.length, symbols: graph.symbols.length, importEdges: graph.edges.filter(e => e.type === 'IMPORTS').length, resolvedCalls: semantic.calls.length, unresolvedCalls: semantic.unresolved })}\n`);
} finally { db.close(); }

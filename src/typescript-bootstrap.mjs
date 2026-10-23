import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTypeScriptProject } from './typescript-project.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

/** Build a standalone file/symbol/import graph for one TypeScript project. */
export function collectTypeScriptGraph(ts, configPath, domainId) {
  const { parsed, files: sourceFiles } = loadTypeScriptProject(ts, configPath);
  const files = [];
  const symbols = [];
  const edges = [];
  const edgeIds = new Set();
  const paths = new Set(sourceFiles.map(file => resolve(file.fileName)));
  const updatedAt = Date.now();

  function edge(type, from, to) {
    const id = hash(`${domainId}\0${type}\0${from}\0${to}`);
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, type, from, to });
  }

  for (const file of sourceFiles) {
    const filePath = resolve(file.fileName);
    files.push({ path: filePath, hash: `tsc-v1:${hash(readFileSync(filePath))}`, lang: 'typescript', updatedAt });

    function visit(node) {
      let name;
      let kind;
      if (ts.isFunctionDeclaration(node) && node.name) { name = node.name.text; kind = 'function'; }
      else if (ts.isClassDeclaration(node) && node.name) { name = node.name.text; kind = 'class'; }
      else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) { name = node.name.text; kind = 'method'; }
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        name = node.name.text; kind = 'function';
      }
      if (name) {
        const start = file.getLineAndCharacterOfPosition(node.getStart(file));
        const end = file.getLineAndCharacterOfPosition(node.getEnd());
        const id = `${filePath}#${name}#${start.line + 1}:${start.character}`;
        symbols.push({ id, name, kind, filePath, startLine: start.line + 1, endLine: end.line + 1 });
        edge('DEFINES', filePath, id);
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = ts.resolveModuleName(node.moduleSpecifier.text, filePath, parsed.options, ts.sys).resolvedModule?.resolvedFileName;
        if (resolved && paths.has(resolve(resolved))) edge('IMPORTS', filePath, resolve(resolved));
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return { files, symbols, edges };
}

/** Insert or refresh a domain owned by this TypeScript indexer. */
export function writeTypeScriptGraph(db, domainId, graph, semantic, { refresh = false } = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT scope_id FROM typescript_index_scopes WHERE domain_id = ?').get(domainId);
    if (refresh) {
      if (!existing || existing.scope_id !== semantic.scopeId) throw new Error(`El dominio ${domainId} no pertenece a este tsconfig`);
      db.prepare('DELETE FROM semantic_calls WHERE domain_id = ?').run(domainId);
      db.prepare('DELETE FROM semantic_index_files WHERE domain_id = ?').run(domainId);
      db.prepare('DELETE FROM code_edges WHERE domain_id = ?').run(domainId);
      db.prepare('DELETE FROM code_symbols WHERE domain_id = ?').run(domainId);
      db.prepare('DELETE FROM code_files WHERE domain_id = ?').run(domainId);
    } else {
      if (existing || db.prepare('SELECT 1 FROM code_files WHERE domain_id = ? LIMIT 1').get(domainId)) throw new Error(`El dominio ${domainId} ya tiene un índice`);
    }
    const insertFile = db.prepare('INSERT INTO code_files (path, hash, lang, domain_id, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (const file of graph.files) insertFile.run(file.path, file.hash, file.lang, domainId, file.updatedAt);
    const insertSymbol = db.prepare('INSERT INTO code_symbols (id, name, kind, file_path, domain_id, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const symbol of graph.symbols) insertSymbol.run(symbol.id, symbol.name, symbol.kind, symbol.filePath, domainId, symbol.startLine, symbol.endLine);
    const insertEdge = db.prepare('INSERT INTO code_edges (id, edge_type, from_id, to_id, domain_id) VALUES (?, ?, ?, ?, ?)');
    for (const edge of graph.edges) insertEdge.run(edge.id, edge.type, edge.from, edge.to, domainId);
    const insertCall = db.prepare('INSERT INTO semantic_calls (scope_id, domain_id, source_path, source_id, target_id, call_line, call_column) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const call of semantic.calls) insertCall.run(semantic.scopeId, domainId, call.sourcePath, call.sourceId, call.targetId, call.callLine, call.callColumn);
    const insertIndexFile = db.prepare('INSERT INTO semantic_index_files (scope_id, domain_id, source_path, source_hash, indexed_at) VALUES (?, ?, ?, ?, ?)');
    const indexedAt = new Date().toISOString();
    for (const file of semantic.files) insertIndexFile.run(semantic.scopeId, domainId, file.sourcePath, file.sourceHash, indexedAt);
    db.prepare(`INSERT INTO typescript_index_scopes (domain_id, scope_id, indexed_at) VALUES (?, ?, ?)
      ON CONFLICT(domain_id) DO UPDATE SET indexed_at = excluded.indexed_at`).run(domainId, semantic.scopeId, indexedAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

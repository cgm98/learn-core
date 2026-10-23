import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTypeScriptProject } from './typescript-project.mjs';

const normalize = file => {
  const path = resolve(file).replaceAll('\\', '/');
  return process.platform === 'win32' ? path.toLowerCase() : path;
};
const key = (file, line, name) => `${normalize(file)}\0${line}\0${name}`;

function declarationName(ts, node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
  return null;
}

/** Resolve call edges to symbol IDs already stored by the legacy indexer. */
export function collectSemanticCalls(ts, configPath, symbols) {
  const { absoluteConfig, program, files: projectFiles } = loadTypeScriptProject(ts, configPath);
  const checker = program.getTypeChecker();
  const byLocation = new Map();
  for (const symbol of symbols) {
    const location = key(symbol.file_path, symbol.start_line, symbol.name);
    byLocation.set(location, [...(byLocation.get(location) ?? []), symbol.id]);
  }
  const calls = [];
  const files = [];
  let unresolved = 0;
  const unresolvedReasons = { caller: 0, target: 0, both: 0 };

  function indexedId(declaration) {
    const name = declarationName(ts, declaration);
    if (!name) return null;
    const source = declaration.getSourceFile();
    const locationNode = ts.isArrowFunction(declaration) && ts.isVariableDeclaration(declaration.parent)
      ? declaration.parent : declaration;
    const line = source.getLineAndCharacterOfPosition(locationNode.getStart(source)).line + 1;
    const matches = byLocation.get(key(source.fileName, line, name)) ?? [];
    return matches.length === 1 ? matches[0] : null;
  }

  function enclosingIndexedId(node) {
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        const id = indexedId(current);
        if (id) return id;
      }
    }
    return null;
  }

  for (const file of projectFiles) {
    const sourcePath = resolve(file.fileName);
    const sourceHash = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
    files.push({ sourcePath, sourceHash });

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const sourceId = enclosingIndexedId(node);
        let target = checker.getSymbolAtLocation(node.expression);
        if (target && (target.flags & ts.SymbolFlags.Alias)) target = checker.getAliasedSymbol(target);
        const targetId = target?.declarations?.map(indexedId).find(Boolean) ?? null;
        if (sourceId && targetId) {
          const position = file.getLineAndCharacterOfPosition(node.expression.getStart(file));
          calls.push({ sourcePath, sourceId, targetId, callLine: position.line + 1, callColumn: position.character + 1 });
        } else {
          unresolved++;
          const reason = !sourceId && !targetId ? 'both' : !sourceId ? 'caller' : 'target';
          unresolvedReasons[reason]++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }

  return { scopeId: absoluteConfig, files, calls, unresolved, unresolvedReasons };
}

/** Atomic replacement for one tsconfig scope; removed files lose their old edges. */
export function replaceSemanticCalls(db, domainId, result) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM semantic_calls WHERE scope_id = ? AND domain_id = ?').run(result.scopeId, domainId);
    db.prepare('DELETE FROM semantic_index_files WHERE scope_id = ? AND domain_id = ?').run(result.scopeId, domainId);
    const insertCall = db.prepare(`INSERT INTO semantic_calls
      (scope_id, domain_id, source_path, source_id, target_id, call_line, call_column)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const call of result.calls) insertCall.run(result.scopeId, domainId, call.sourcePath, call.sourceId, call.targetId, call.callLine, call.callColumn);
    const insertFile = db.prepare(`INSERT INTO semantic_index_files
      (scope_id, domain_id, source_path, source_hash, indexed_at) VALUES (?, ?, ?, ?, ?)`);
    const indexedAt = new Date().toISOString();
    for (const file of result.files) insertFile.run(result.scopeId, domainId, file.sourcePath, file.sourceHash, indexedAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

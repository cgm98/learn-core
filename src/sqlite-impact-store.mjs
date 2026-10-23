import { DatabaseSync } from 'node:sqlite';

const PROPAGATING_EDGES = ['CALLS', 'IMPORTS', 'REFERENCES', 'EXTENDS'];

export class SqliteImpactStore {
  constructor(dbPath, { immutable = false } = {}) {
    // immutable avoids creating WAL sidecar files in read-only environments, but
    // SQLite ignores any uncheckpointed WAL changes in this mode.
    this.db = new DatabaseSync(immutable ? `file:${dbPath.replaceAll('\\', '/')}?immutable=1` : dbPath, { readOnly: true });
    this.file = this.db.prepare('SELECT path AS id, path, lang, updated_at FROM code_files WHERE domain_id = ? AND path = ?');
    this.symbol = this.db.prepare('SELECT id, name, kind, file_path AS path, start_line, end_line FROM code_symbols WHERE domain_id = ? AND id = ?');
    this.definitions = this.db.prepare('SELECT id, name, kind, file_path AS path, start_line, end_line FROM code_symbols WHERE domain_id = ? AND file_path = ? ORDER BY start_line, id LIMIT ?');
    this.dependents = this.db.prepare(`SELECT edge_type AS type, from_id AS "from", to_id AS "to"
      FROM code_edges WHERE domain_id = ? AND to_id = ? AND edge_type IN (${PROPAGATING_EDGES.map(() => '?').join(',')})
      ORDER BY edge_type, from_id`);
    const hasSemanticCalls = !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'semantic_calls'").get();
    this.semanticDependents = hasSemanticCalls ? this.db.prepare(`SELECT 'RESOLVED_CALL' AS type, source_id AS "from", target_id AS "to",
      source_path AS sourcePath, call_line AS callLine, call_column AS callColumn
      FROM semantic_calls WHERE domain_id = ? AND target_id = ? ORDER BY source_path, call_line`) : null;
  }

  getNode(domainId, id) {
    const symbol = this.symbol.get(domainId, id);
    if (symbol) return { ...symbol, nodeType: 'symbol' };
    const file = this.file.get(domainId, id);
    return file ? { ...file, nodeType: 'file' } : null;
  }

  getDependents(domainId, id) {
    const semantic = this.semanticDependents?.all(domainId, id).map(row => ({ ...row, evidence: 'typescript_compiler' })) ?? [];
    return [...semantic, ...this.dependents.all(domainId, id, ...PROPAGATING_EDGES)];
  }

  getDefinedSymbols(domainId, filePath, limit) {
    const rows = this.definitions.all(domainId, filePath, limit + 1);
    return { nodes: rows.slice(0, limit).map(row => ({ ...row, nodeType: 'symbol' })), truncated: rows.length > limit };
  }

  close() { this.db.close(); }
}

-- Los IDs apuntan a code_symbols. Se guarda la procedencia sin alterar CALLS heredadas.
CREATE TABLE IF NOT EXISTS semantic_calls (
  scope_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  call_line INTEGER NOT NULL,
  call_column INTEGER NOT NULL,
  PRIMARY KEY (scope_id, domain_id, source_path, source_id, target_id, call_line, call_column)
);

CREATE INDEX IF NOT EXISTS idx_semantic_calls_target
  ON semantic_calls(domain_id, target_id);

CREATE TABLE IF NOT EXISTS semantic_index_files (
  scope_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, domain_id, source_path)
);

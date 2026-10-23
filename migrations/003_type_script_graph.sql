-- Esquema mínimo compatible con el grafo heredado para una base LEARN-CORE nueva.
CREATE TABLE IF NOT EXISTS code_files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_files_domain ON code_files(domain_id);

CREATE TABLE IF NOT EXISTS code_symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_symbols_domain_file ON code_symbols(domain_id, file_path);

CREATE TABLE IF NOT EXISTS code_edges (
  id TEXT PRIMARY KEY,
  edge_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  domain_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_edges_domain_to_type ON code_edges(domain_id, to_id, edge_type);

CREATE TABLE IF NOT EXISTS typescript_index_scopes (
  domain_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

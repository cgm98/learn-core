-- Ejecutar después de respaldar y medir la base; puede bloquear escrituras durante su creación.
CREATE INDEX IF NOT EXISTS idx_code_edges_domain_to_type
  ON code_edges(domain_id, to_id, edge_type);

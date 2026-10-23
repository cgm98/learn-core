# APP 1: LEARN-CORE (Code Topology & Agent Intelligence Engine)

- **Bounded Context:** Análisis estático, topología de dependencias, grafos de sintaxis abstracta (AST), métricas de *churn* Git y cálculo de *blast radius*.
- **Usuarios Principales:** Agentes de IA autónomos (Cursor, Claude Code, Windsurf) y Tech Leads.
- **Protocolo de Interfaz:** Servidor **MCP In-Process** (4 herramientas multiplexadas: `learn_mutate`, `learn_query`, `learn_diagnose`, `learn_timeline`).
- **Persistencia Dedicada:** `db/learn_code.db` (SQLite WAL dedicada, < 50 MB).

---

## Componentes a Migrar

### 1. Esquemas de Base de Datos (`backend/src/schemas/`)
- `code-graph.schema.ts`
- `intelligence.schema.ts`
- `code-coverage.schema.ts`
- `code-review.schema.ts`
- `project.schema.ts`
- `project-activity.schema.ts`
- `project-metadata.schema.ts`
- `project-skill.schema.ts`

### 2. Servicios de Negocio (`backend/src/services/`)
- `code-review.service.ts`
- `project.service.ts`
- `project-management.service.ts`
- `project-metadata.service.ts`
- `project-skill.service.ts`
- `project-activity.service.ts`
- `indexer.service.ts` (Tree-Sitter parser incremental)

### 3. Vistas Frontend (`frontend/src/views/`)
- `CodeExplorer/`
- `CodeReviewsView/`
- `ProjectIntelligence/`
- `ProjectSandbox/`

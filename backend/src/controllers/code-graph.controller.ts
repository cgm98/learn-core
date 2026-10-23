import { Request, Response } from 'express';
import { codeIndexService, projectMetadataRepository } from '../di/container.js';
import { getIndexedCount } from '../events/code-index.subscriber.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { sqlite } from '../database/connection.js';

const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 3;

// Tokeniza un identificador o nombre de archivo en palabras buscables: separa por
// no-alfanuméricos y por límites camelCase, descarta ruido (números sueltos, tokens < 3
// chars) — así "saved-view.service.ts" y "SavedViewService" producen el mismo vocabulario.
function tokenize(raw: string): string[] {
  return raw
    .replace(/\.[a-zA-Z]+$/, '') // extensión
    .split(/[^a-zA-Z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
}

interface RelatedConceptRow {
  concept_id: string;
  title: string;
  domain: string;
  explanation: string;
}

interface CodeSymbolRow {
  id: string;
  name: string;
  kind: string;
  file_path: string;
  domain_id: string;
  start_line: number;
  end_line: number;
}

interface CodeEdgeRow {
  id: string;
  edge_type: string;
  from_id: string;
  to_id: string;
  domain_id: string;
}

interface DebtRow {
  symbol_id: string;
  name: string;
  kind: string;
  file_path: string;
  start_line: number;
  fan_in: number;
  file_updated_at: number | null;
}

const placeholders = (n: number) => Array(n).fill('?').join(',');

function parseDepth(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : DEFAULT_DEPTH;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DEPTH;
  return Math.min(n, MAX_DEPTH);
}

// Los endpoints que tocan el disco necesitan la raíz del proyecto, que solo vive en
// project_metadata: un dominio sin fila ahí se puede leer del grafo pero no explorar.
// Responde el 404 y devuelve undefined para que el handler corte.
function resolveProject(req: Request, res: Response) {
  const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
  const meta = projectMetadataRepository.findByDomainId(domain);
  if (!meta) {
    res.status(404).json({ error: `El domain '${domain}' no está registrado como proyecto sandbox (sin local_path).` });
    return undefined;
  }
  return meta;
}

export class CodeGraphController {
  static listProjects = asyncHandler(async (_req: Request, res: Response) => {
    res.json(codeIndexService.listCodeProjects());
  });

  // Lista TODOS los proyectos sandbox, no solo los vivos: la UI necesita distinguir
  // "apagado" de "encendido pero caído", y para eso tiene que ver también los que no
  // tienen watcher corriendo.
  static watchers = asyncHandler(async (_req: Request, res: Response) => {
    res.json(
      projectMetadataRepository.listAll().map((p) => {
        // Estado git EN VIVO, para contrastarlo con el que quedó guardado al indexar: si
        // HEAD se movió, el grafo describe un working tree que ya no es el actual.
        const current = codeIndexService.readGitState(p.local_path);
        return {
          domainId: p.domain_id,
          rootDir: p.local_path,
          watchEnabled: p.watch_enabled,
          alive: codeIndexService.isWatching(p.domain_id),
          lastIndexedAt: p.last_indexed_at,
          indexedBranch: p.indexed_branch,
          indexedCommit: p.indexed_commit,
          currentBranch: current?.branch ?? null,
          currentCommit: current?.commit ?? null,
          lastError: codeIndexService.getWatcherError(p.domain_id) ?? null,
          indexedCount: getIndexedCount(p.domain_id)
        };
      })
    );
  });

  static health = asyncHandler(async (req: Request, res: Response) => {
    const meta = resolveProject(req, res);
    if (!meta) return;
    res.json({
      ...codeIndexService.getProjectHealth(meta.local_path, meta.domain_id),
      localPath: meta.local_path,
      lastIndexedAt: meta.last_indexed_at
    });
  });

  // Explorador (Fase 3). Los tres comparten la misma resolución de raíz que health/reindex:
  // sin fila en project_metadata no hay carpeta contra la cual listar ni leer.
  static tree = asyncHandler(async (req: Request, res: Response) => {
    const meta = resolveProject(req, res);
    if (!meta) return;
    res.json(codeIndexService.listProjectTree(meta.local_path, meta.domain_id));
  });

  static file = asyncHandler(async (req: Request, res: Response) => {
    const meta = resolveProject(req, res);
    if (!meta) return;
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!relPath) return res.status(400).json({ error: "Falta el parámetro 'path'." });

    const detail = codeIndexService.readProjectFile(meta.local_path, meta.domain_id, relPath);
    // undefined cubre tanto "no existe" como "quedó fuera de la raíz del proyecto": no se
    // distinguen hacia afuera para no confirmar la existencia de rutas del disco.
    if (!detail) return res.status(404).json({ error: `No se encontró '${relPath}' dentro del proyecto.` });
    res.json(detail);
  });

  static search = asyncHandler(async (req: Request, res: Response) => {
    const meta = resolveProject(req, res);
    if (!meta) return;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.json([]);
    res.json(codeIndexService.searchSymbols(meta.local_path, meta.domain_id, q));
  });

  static reindex = asyncHandler(async (req: Request, res: Response) => {
    const meta = resolveProject(req, res);
    if (!meta) return;
    const stats = codeIndexService.reconcile(meta.local_path, meta.domain_id);
    const git = codeIndexService.recordIndexedGitState(projectMetadataRepository, meta.local_path, meta.domain_id);
    res.json({ ...stats, branch: git?.branch ?? null, commit: git?.commit ?? null });
  });

  static get = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    res.json(codeIndexService.getCodeGraph(domain));
  });

  // ADR-005 Fase 3: BFS acotada por hops desde un archivo/símbolo en foco, en
  // vez del dump plano completo por dominio que sirve `get`.
  static subgraph = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const focus = typeof req.query.focus === 'string' ? req.query.focus : undefined;
    if (!focus) return res.status(400).json({ error: "Falta el parámetro 'focus'." });
    const depth = parseDepth(req.query.depth);
    res.json(codeIndexService.getCodeSubgraph(domain, focus, depth));
  });

  // Puente código↔conocimiento: el vault de conceptos y el explorador de código son dos
  // mundos separados en el schema (no hay tabla que los una), así que esto busca por
  // texto en vez de por relación — vocabulario del path + nombres de símbolo contra
  // concepts_fts, acotado al dominio del proyecto. Es una aproximación léxica, no una
  // relación curada: false negatives esperables si la nota no menciona esos términos.
  static relatedConcepts = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!relPath) return res.status(400).json({ error: "Falta el parámetro 'path'." });

    const symbolNames = typeof req.query.symbols === 'string' && req.query.symbols
      ? req.query.symbols.split(',').slice(0, 5)
      : [];

    const basename = relPath.split('/').pop() ?? relPath;
    const tokens = [...new Set([...tokenize(basename), ...symbolNames.flatMap(tokenize)])].slice(0, 12);

    if (tokens.length === 0) return res.json([]);

    const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');

    const rows = sqlite
      .prepare(
        `SELECT f.concept_id as concept_id, f.title as title, c.domain as domain, f.explanation as explanation
         FROM concepts_fts f
         JOIN concepts c ON c.id = f.concept_id
         WHERE concepts_fts MATCH ? AND c.deleted_at IS NULL AND c.domain = ?
         ORDER BY bm25(concepts_fts)
         LIMIT 8`
      )
      .all(ftsQuery, domain) as RelatedConceptRow[];

    res.json(rows.map((r) => ({ id: r.concept_id, title: r.title, domain: r.domain, snippet: r.explanation.slice(0, 160) })));
  });

  // Blast radius de un símbolo: mismo query que learn_find_callers del MCP (edges CALLS/
  // EXTENDS entrantes), portado acá para que el explorador no dependa de una llamada MCP
  // por click. Resolución por nombre: si dos símbolos comparten nombre, sus callers se
  // suman sin distinguir — igual que la tool, para no under-reportar en falso.
  static callers = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    if (!symbol) return res.status(400).json({ error: "Falta el parámetro 'symbol'." });

    const byId = sqlite.prepare('SELECT * FROM code_symbols WHERE id = ?').all(symbol) as CodeSymbolRow[];
    const targets = byId.length
      ? byId
      : (sqlite.prepare('SELECT * FROM code_symbols WHERE name = ? AND domain_id = ?').all(symbol, domain) as CodeSymbolRow[]);

    if (targets.length === 0) {
      return res.json({ targets: [], total_callers: 0, files_affected: 0, by_file: [], callers: [] });
    }

    const targetIds = targets.map((t) => t.id);
    const incoming = sqlite
      .prepare(`SELECT * FROM code_edges WHERE to_id IN (${placeholders(targetIds.length)}) AND edge_type IN ('CALLS','EXTENDS')`)
      .all(...targetIds) as CodeEdgeRow[];

    const callerIds = [...new Set(incoming.map((e) => e.from_id))];
    const callerRows = callerIds.length
      ? (sqlite.prepare(`SELECT * FROM code_symbols WHERE id IN (${placeholders(callerIds.length)})`).all(...callerIds) as CodeSymbolRow[])
      : [];
    const callerById = new Map(callerRows.map((c) => [c.id, c]));

    const callers = incoming
      .map((e) => {
        const c = callerById.get(e.from_id);
        return c ? { id: c.id, name: c.name, kind: c.kind, file_path: c.file_path, start_line: c.start_line, edge_type: e.edge_type } : undefined;
      })
      .filter((c): c is NonNullable<typeof c> => !!c);

    const byFileCounts = new Map<string, number>();
    for (const c of callers) byFileCounts.set(c.file_path, (byFileCounts.get(c.file_path) ?? 0) + 1);
    const by_file = [...byFileCounts.entries()].map(([file_path, count]) => ({ file_path, count })).sort((a, b) => b.count - a.count);

    res.json({
      targets: targets.map((t) => ({ id: t.id, name: t.name, kind: t.kind, file_path: t.file_path })),
      total_callers: callers.length,
      files_affected: by_file.length,
      by_file,
      callers: callers.slice(0, 50)
    });
  });

  // Living Specs Validation (Fase Unfair Advantage): verifica en lote si un conjunto
  // de símbolos referenciados en una nota siguen vivos en el AST o si fueron eliminados/renombrados.
  static validateSymbols = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const rawSymbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    if (!rawSymbols) return res.json({ symbols: [] });

    const symbolList = rawSymbols.split(',').map(s => s.trim()).filter(Boolean).slice(0, 30);
    if (symbolList.length === 0) return res.json({ symbols: [] });

    const results = symbolList.map(name => {
      const match = sqlite
        .prepare('SELECT id, name, kind, file_path, start_line FROM code_symbols WHERE name = ? AND domain_id = ? LIMIT 1')
        .get(name, domain) as CodeSymbolRow | undefined;

      if (!match) {
        return { name, alive: false, symbol: null };
      }

      const callersCount = (sqlite
        .prepare("SELECT COUNT(*) as count FROM code_edges WHERE to_id = ? AND edge_type IN ('CALLS','EXTENDS')")
        .get(match.id) as { count: number })?.count || 0;

      return {
        name,
        alive: true,
        symbol: {
          id: match.id,
          name: match.name,
          kind: match.kind,
          file_path: match.file_path,
          start_line: match.start_line,
          callers_count: callersCount
        }
      };
    });

    res.json({ symbols: results });
  });

  // Architectural Drift Detector (AI Guardrails en tiempo real):
  // Detecta violaciones de capas de Clean Architecture en las dependencias (IMPORTS/CALLS)
  // Reglas:
  // 1. domain/ NO debe importar infrastructure/, controllers/, o routes/
  // 2. controllers/ NO debe depender de schemas/ sql directos sin repository/
  // 3. client/stores/ NO debe importar server/
  static detectDrift = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';

    // Obtener todos los edges de tipo IMPORTS o CALLS con las rutas de archivo de origen y destino
    const rows = sqlite.prepare(`
      SELECT 
        e.id, e.edge_type, 
        s_from.name as from_symbol, s_from.file_path as from_path,
        s_to.name as to_symbol, s_to.file_path as to_path
      FROM code_edges e
      JOIN code_symbols s_from ON s_from.id = e.from_id
      JOIN code_symbols s_to ON s_to.id = e.to_id
      WHERE e.domain_id = ? AND e.edge_type IN ('IMPORTS', 'CALLS')
      LIMIT 20000
    `).all(domain) as { id: string; edge_type: string; from_symbol: string; from_path: string; to_symbol: string; to_path: string }[];

    const violations: { id: string; rule: string; severity: 'critical' | 'warning'; source: string; target: string; message: string }[] = [];

    for (const r of rows) {
      const from = r.from_path.replace(/\\/g, '/').toLowerCase();
      const to = r.to_path.replace(/\\/g, '/').toLowerCase();

      // Regla 1: Domain nunca debe depender de Infrastructure o Controllers
      if (from.includes('/domain/') && (to.includes('/infrastructure/') || to.includes('/controllers/'))) {
        violations.push({
          id: r.id,
          rule: 'Clean Architecture: Domain Inversion',
          severity: 'critical',
          source: `${r.from_symbol} (${r.from_path})`,
          target: `${r.to_symbol} (${r.to_path})`,
          message: 'La capa de Dominio no debe tener acoplamiento con Infraestructura o Controladores.'
        });
      }

      // Regla 2: UI Store directo a Database / SQL sin pasar por Service
      if (from.includes('/stores/') && (to.includes('/database/') || to.includes('/schemas/'))) {
        violations.push({
          id: r.id,
          rule: 'Frontend: Bypass de Capa de Servicio',
          severity: 'critical',
          source: `${r.from_symbol} (${r.from_path})`,
          target: `${r.to_symbol} (${r.to_path})`,
          message: 'El Store de cliente no debe importar esquemas de base de datos directos.'
        });
      }

      // Regla 3: Controllers llamando a Database directamente sin Repository
      if (from.includes('/controllers/') && to.includes('/database/schemas/')) {
        violations.push({
          id: r.id,
          rule: 'Backend: Repository Pattern Bypass',
          severity: 'warning',
          source: `${r.from_symbol} (${r.from_path})`,
          target: `${r.to_symbol} (${r.to_path})`,
          message: 'El controlador interactúa directamente con esquemas en lugar de usar un Repositorio.'
        });
      }
    }

    // Deduplicar violaciones idénticas
    const uniqueMap = new Map<string, typeof violations[0]>();
    for (const v of violations) {
      const key = `${v.rule}:${v.source}:${v.target}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, v);
    }

    const uniqueViolations = [...uniqueMap.values()];

    res.json({
      total_violations: uniqueViolations.length,
      critical_count: uniqueViolations.filter(v => v.severity === 'critical').length,
      warning_count: uniqueViolations.filter(v => v.severity === 'warning').length,
      violations: uniqueViolations.slice(0, 50)
    });
  });

  // Ranking de deuda técnica MVP: fan_in × días desde el último reindex del archivo —
  // mismo heurístico que learn_get_code_debt (ver ese tool para las salvedades: no es
  // centralidad real, y la "antigüedad" mide desde el último reindex, no desde git).
  static debt = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 50);

    const rows = sqlite
      .prepare(
        `SELECT s.id as symbol_id, s.name as name, s.kind as kind, s.file_path as file_path, s.start_line as start_line,
                COUNT(e.id) as fan_in, f.updated_at as file_updated_at
         FROM code_symbols s
         LEFT JOIN code_edges e ON e.to_id = s.id AND e.edge_type IN ('CALLS', 'EXTENDS')
         LEFT JOIN code_files f ON f.path = s.file_path
         WHERE s.domain_id = ?
         GROUP BY s.id
         HAVING fan_in > 0
         ORDER BY fan_in DESC
         LIMIT 2000`
      )
      .all(domain) as DebtRow[];

    const now = Date.now();
    const hotspots = rows
      .map((r) => {
        const staleness_days = r.file_updated_at !== null ? Math.max(0, Math.round((now - r.file_updated_at) / 86_400_000)) : 0;
        return {
          id: r.symbol_id,
          name: r.name,
          kind: r.kind,
          file_path: r.file_path,
          start_line: r.start_line,
          fan_in: r.fan_in,
          staleness_days,
          debt_score: r.fan_in * staleness_days
        };
      })
      .sort((a, b) => b.debt_score - a.debt_score)
      .slice(0, limit);

    res.json(hotspots);
  });

  // Feature 4: AI Context Packager for LLMs ("Zero-Token Hallucination")
  // Extrae la firma, archivo, llamadores y dependencias directas en un snippet ultra-compacto
  static packContext = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    if (!symbol) return res.status(400).json({ error: "Falta parámetro 'symbol'." });

    const target = sqlite
      .prepare('SELECT id, name, kind, file_path, start_line, end_line FROM code_symbols WHERE name = ? AND domain_id = ? LIMIT 1')
      .get(symbol, domain) as CodeSymbolRow | undefined;

    if (!target) {
      return res.status(404).json({ error: `Símbolo '${symbol}' no encontrado en el AST de '${domain}'.` });
    }

    // Llamadores entrantes
    const callers = sqlite.prepare(`
      SELECT s.name, s.kind, s.file_path, s.start_line, e.edge_type
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.from_id
      WHERE e.to_id = ? AND e.domain_id = ?
      LIMIT 10
    `).all(target.id, domain) as { name: string; kind: string; file_path: string; start_line: number; edge_type: string }[];

    // Dependencias salientes
    const callees = sqlite.prepare(`
      SELECT s.name, s.kind, s.file_path, s.start_line, e.edge_type
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.to_id
      WHERE e.from_id = ? AND e.domain_id = ?
      LIMIT 10
    `).all(target.id, domain) as { name: string; kind: string; file_path: string; start_line: number; edge_type: string }[];

    const aiPrompt = `### AI Context Pack: ${target.name} (${target.kind})
- **File:** \`${target.file_path}\` (Lines ${target.start_line}-${target.end_line || target.start_line})
- **Incoming Callers (${callers.length}):** ${callers.map(c => `\`${c.name}\` (${c.file_path}:${c.start_line})`).join(', ') || 'None'}
- **Outgoing Dependencies (${callees.length}):** ${callees.map(c => `\`${c.name}\` (${c.file_path}:${c.start_line})`).join(', ') || 'None'}
`;

    res.json({
      target,
      callers,
      callees,
      prompt: aiPrompt
    });
  });

  // Feature 5: Dead Code & Dependency Orphan Pruner
  // Lista exports y símbolos con in-degree = 0 que no son consumidos por nadie
  static getDeadCode = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);

    const rows = sqlite.prepare(`
      SELECT s.id, s.name, s.kind, s.file_path, s.start_line
      FROM code_symbols s
      LEFT JOIN code_edges e ON e.to_id = s.id AND e.edge_type IN ('CALLS', 'EXTENDS', 'IMPORTS')
      WHERE s.domain_id = ? 
        AND e.id IS NULL
        AND s.name NOT IN ('main', 'Index', 'App', 'default')
        AND s.file_path NOT LIKE '%.test.%'
        AND s.file_path NOT LIKE '%.spec.%'
      LIMIT ?
    `).all(domain, limit) as CodeSymbolRow[];

    res.json({
      total_orphans: rows.length,
      orphans: rows
    });
  });

  // Feature: Automated Test Gap Finder
  // Cruza símbolos con alto fan_in (>2 callers) que NO tienen llamadas entrantes desde archivos de test (*.test.* o *.spec.*)
  static testGaps = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '15'), 10) || 15, 1), 50);

    const rows = sqlite.prepare(`
      SELECT s.id, s.name, s.kind, s.file_path, s.start_line, s.end_line,
             COUNT(e.id) as fan_in
      FROM code_symbols s
      JOIN code_edges e ON e.to_id = s.id AND e.edge_type IN ('CALLS', 'EXTENDS')
      WHERE s.domain_id = ?
        AND s.file_path NOT LIKE '%.test.%'
        AND s.file_path NOT LIKE '%.spec.%'
        AND s.name NOT IN ('main', 'Index', 'App', 'default')
      GROUP BY s.id
      HAVING fan_in >= 2
      ORDER BY fan_in DESC
      LIMIT 200
    `).all(domain) as { id: string; name: string; kind: string; file_path: string; start_line: number; end_line: number; fan_in: number }[];

    // Filtrar aquellos que tienen 0 llamadas entrantes desde archivos de test
    const gaps: {
      id: string;
      name: string;
      kind: string;
      file_path: string;
      start_line: number;
      fan_in: number;
      test_boilerplate: string;
    }[] = [];

    for (const r of rows) {
      const testCallers = sqlite.prepare(`
        SELECT COUNT(e.id) as count
        FROM code_edges e
        JOIN code_symbols s_from ON s_from.id = e.from_id
        WHERE e.to_id = ? 
          AND (s_from.file_path LIKE '%.test.%' OR s_from.file_path LIKE '%.spec.%')
      `).get(r.id) as { count: number };

      if (!testCallers || testCallers.count === 0) {
        const fileBasename = r.file_path.split(/[/\\]/).pop()?.replace(/\.(ts|js|vue)$/, '') || 'module';
        const boilerplate = `import { describe, it, expect, vi } from 'vitest';\n// TODO: Importar ${r.name} desde '${r.file_path}'\n\ndescribe('${r.name}', () => {\n  it('debería responder correctamente ante inputs válidos', async () => {\n    // Arrange\n    // Act\n    // Assert\n    expect(true).toBe(true);\n  });\n\n  it('debería manejar casos de error adecuadamente', async () => {\n    // Arrange\n    // Act & Assert\n  });\n});`;

        gaps.push({
          id: r.id,
          name: r.name,
          kind: r.kind,
          file_path: r.file_path,
          start_line: r.start_line,
          fan_in: r.fan_in,
          test_boilerplate: boilerplate
        });
      }

      if (gaps.length >= limit) break;
    }

    res.json({
      total_gaps: gaps.length,
      gaps
    });
  });

  // Feature 3: Cross-Project Dependency Radar (Monitoreo Multi-Repo)
  // Detecta si símbolos o contratos de un dominio son referenciados o importados por otros proyectos
  static crossProjectRadar = asyncHandler(async (req: Request, res: Response) => {
    const projects = sqlite.prepare(`
      SELECT pm.domain_id as domain_id, d.name as name, pm.local_path as local_path
      FROM project_metadata pm
      JOIN domains d ON d.id = pm.domain_id
    `).all() as { domain_id: string; name: string; local_path: string }[];
    
    // Contar símbolos y dependencias por proyecto
    const projectStats = projects.map(p => {
      const symbolsCount = (sqlite.prepare('SELECT COUNT(*) as c FROM code_symbols WHERE domain_id = ?').get(p.domain_id) as { c: number })?.c || 0;
      const edgesCount = (sqlite.prepare('SELECT COUNT(*) as c FROM code_edges WHERE domain_id = ?').get(p.domain_id) as { c: number })?.c || 0;
      
      // Buscar imports compartidos
      const externalImports = sqlite.prepare(`
        SELECT COUNT(DISTINCT s_to.id) as c
        FROM code_edges e
        JOIN code_symbols s_to ON s_to.id = e.to_id
        WHERE e.domain_id = ? AND s_to.domain_id != ?
      `).get(p.domain_id, p.domain_id) as { c: number };

      return {
        domainId: p.domain_id,
        name: p.name,
        localPath: p.local_path,
        symbolsCount,
        edgesCount,
        sharedDepsCount: externalImports?.c || 0
      };
    });

    res.json({
      total_projects: projects.length,
      projects: projectStats
    });
  });

  // Feature 4: Git Commit Impact Forecaster ("Simula el Blast Radius de tu Git Diff")
  // Lee el estado actual de archivos modificados no committeados y calcula su impacto total en el AST
  static gitDiffForecast = asyncHandler(async (req: Request, res: Response) => {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : 'learn';
    const meta = sqlite.prepare('SELECT local_path FROM project_metadata WHERE domain_id = ? LIMIT 1').get(domain) as { local_path: string } | undefined;

    if (!meta || !meta.local_path) {
      return res.status(404).json({ error: `Proyecto '${domain}' no encontrado.` });
    }

    let modifiedFiles: string[] = [];
    try {
      const { execSync } = await import('child_process');
      const stdout = execSync('git status --porcelain', { cwd: meta.local_path, encoding: 'utf-8', timeout: 3000 });
      modifiedFiles = stdout
        .split('\n')
        .map(line => line.trim().slice(3).trim())
        .filter(Boolean)
        .filter(f => /\.(ts|js|vue|go|py|rs)$/i.test(f));
    } catch (_e) {
      modifiedFiles = [];
    }

    if (modifiedFiles.length === 0) {
      return res.json({
        clean: true,
        modified_files_count: 0,
        symbols_affected: 0,
        total_callers_at_risk: 0,
        files: []
      });
    }

    let totalSymbolsAffected = 0;
    let totalCallersAtRisk = 0;
    const fileImpacts: { file: string; symbols: number; callers: number }[] = [];

    for (const relFile of modifiedFiles.slice(0, 15)) {
      const normFile = relFile.replace(/\\/g, '/');
      const symbols = sqlite.prepare(`
        SELECT id, name FROM code_symbols 
        WHERE domain_id = ? AND (file_path LIKE ? OR file_path LIKE ?)
      `).all(domain, `%${normFile}`, `%${relFile}`) as CodeSymbolRow[];

      let callersCount = 0;
      if (symbols.length > 0) {
        const symbolIds = symbols.map(s => s.id);
        const callers = sqlite.prepare(`
          SELECT COUNT(DISTINCT from_id) as c FROM code_edges 
          WHERE to_id IN (${placeholders(symbolIds.length)}) AND edge_type IN ('CALLS', 'EXTENDS')
        `).get(...symbolIds) as { c: number };
        callersCount = callers?.c || 0;
      }

      totalSymbolsAffected += symbols.length;
      totalCallersAtRisk += callersCount;
      fileImpacts.push({ file: relFile, symbols: symbols.length, callers: callersCount });
    }

    res.json({
      clean: false,
      modified_files_count: modifiedFiles.length,
      symbols_affected: totalSymbolsAffected,
      total_callers_at_risk: totalCallersAtRisk,
      risk_level: totalCallersAtRisk >= 15 ? 'HIGH' : totalCallersAtRisk >= 5 ? 'MED' : 'LOW',
      files: fileImpacts
    });
  });
}

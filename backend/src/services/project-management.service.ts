import { Database } from 'better-sqlite3';
import { db as defaultDrizzleDb, sqlite as defaultSqlite } from '../../infrastructure/database/connection.js';
import {
  Project,
  ProjectSchema,
  Task,
  TaskSchema,
  TaskStatus,
  Issue,
  IssueSchema,
  IssueStatus,
  Decision,
  DecisionSchema,
  CodeReview,
  CodeReviewSchema,
  DailyNote,
  DailyNoteSchema,
  ExtractedItem,
  Report,
  ReportSchema,
  ReportKind,
  Event
} from '../../domain/entities/intelligence.types.js';
import {
  validateIssueTransition,
  validateTaskCompletion,
  validateDecisionSuperseded
} from '../../domain/invariants/intelligence-invariants.js';
import { UnifiedEventRepository } from '../../infrastructure/repositories/unified-event.repository.js';

export interface KanbanBoard {
  projectId: string;
  columns: Record<string, Task[]>;
  totalTasks: number;
}

export interface ReadResult<T> {
  data: T;
  sources: string[];
  truncated: boolean;
}

function createUniqueEventId(prefix: string, entityId: string): string {
  return `evt_${prefix}_${entityId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Board migrado desde why/MIGRACION/kanban: 5 columnas de negocio en vez de las
// 4 genéricas originales (Backlog/In Progress/Review/Done). kanban_column sigue
// siendo texto libre — este mapeo solo decide qué status/D3 corresponde cuando
// se mueve una tarjeta de columna sin que el caller mande status explícito.
export const KANBAN_COLUMNS = ['planeacion', 'por hacer', 'en progreso', 'en revision', 'finalizado'] as const;

function columnToStatus(column: string): TaskStatus {
  if (column === 'finalizado') return 'done';
  if (column === 'en progreso' || column === 'en revision') return 'in_progress';
  return 'todo';
}

function parseTaskRow(raw: any): Task {
  return TaskSchema.parse({
    ...raw,
    blocked_by: typeof raw.blocked_by === 'string' ? JSON.parse(raw.blocked_by) : raw.blocked_by,
    schedule: typeof raw.schedule === 'string' ? JSON.parse(raw.schedule || '{}') : (raw.schedule || {})
  });
}

export class ProjectManagementService {
  private sqlite: Database;
  private eventRepo: UnifiedEventRepository;

  constructor(sqliteClient?: Database) {
    this.sqlite = sqliteClient || defaultSqlite;
    this.eventRepo = new UnifiedEventRepository();
  }

  // =========================================================================
  // 1. PROJECTS
  // =========================================================================
  createProject(data: { id?: string; slug: string; name: string }): Project {
    const now = new Date().toISOString();
    const id = data.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const project = ProjectSchema.parse({
      id,
      slug: data.slug,
      name: data.name,
      status: 'active',
      created_at: now,
      archived_at: null
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_projects (id, slug, name, status, created_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(project.id, project.slug, project.name, project.status, project.created_at, project.archived_at);

    // R12: Emit event in same transaction
    this.eventRepo.append({
      id: createUniqueEventId('proj', project.id),
      project_id: project.id,
      type: 'project.created',
      entity_type: 'project',
      entity_id: project.id,
      actor: 'human',
      payload: { name: project.name, slug: project.slug },
      timestamp: now
    }, this.sqlite);

    return project;
  }

  /**
   * The project registry for Kanban/Issues/Decisions/Memory/Timeline is the sandbox
   * project registry (domains + project_metadata, ADR-003) — this system does not have
   * its own separate notion of "project". `intelligence_projects` exists only because
   * every intelligence_* table FKs to it; this keeps that shadow row in sync with the
   * real project (same id = domain_id), instead of letting this subsystem invent its
   * own disconnected project identity.
   *
   * Idempotent: does nothing (no duplicate `project.created` event) if the row already
   * exists for this domain.
   */
  ensureProjectFromDomain(domainId: string, name: string): Project {
    const existing = this.sqlite.prepare(`SELECT * FROM intelligence_projects WHERE id = ?`).get(domainId) as any;
    if (existing) {
      // Keep the mirrored name current if the sandbox project was renamed.
      if (existing.name !== name) {
        this.sqlite.prepare(`UPDATE intelligence_projects SET name = ? WHERE id = ?`).run(name, domainId);
      }
      return ProjectSchema.parse({ ...existing, name });
    }

    return this.createProject({ id: domainId, slug: domainId, name });
  }


  getProjectState(projectId: string): ReadResult<{ project: Project; taskCounts: Record<string, number>; issueCounts: Record<string, number> } | null> {
    const row = this.sqlite.prepare(`SELECT * FROM intelligence_projects WHERE id = ?`).get(projectId) as any;
    if (!row) return { data: null, sources: [], truncated: false };

    const project = ProjectSchema.parse(row);
    const taskRows = this.sqlite.prepare(`
      SELECT status, count(*) as count FROM intelligence_tasks WHERE project_id = ? GROUP BY status
    `).all(projectId) as any[];
    const issueRows = this.sqlite.prepare(`
      SELECT status, count(*) as count FROM intelligence_issues WHERE project_id = ? GROUP BY status
    `).all(projectId) as any[];

    const taskCounts: Record<string, number> = {};
    for (const r of taskRows) taskCounts[r.status] = r.count;

    const issueCounts: Record<string, number> = {};
    for (const r of issueRows) issueCounts[r.status] = r.count;

    return {
      data: { project, taskCounts, issueCounts },
      sources: [`[PROJECT:${project.id} "${project.name}"]`],
      truncated: false
    };
  }

  // =========================================================================
  // 2. TASKS & KANBAN (Invariant D3, R12, R13)
  // =========================================================================
  createTask(data: {
    id?: string;
    project_id: string;
    title: string;
    description?: string | null;
    client_name?: string | null;
    implementer?: string | null;
    source_issue_id?: string | null;
    priority?: Task['priority'];
    assignee?: string | null;
    kanban_column?: string;
    estimate?: string | null;
    blocked_by?: string[];
  }): Task {
    const now = new Date().toISOString();
    const id = data.id || `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task = TaskSchema.parse({
      id,
      project_id: data.project_id,
      title: data.title,
      description: data.description || null,
      client_name: data.client_name || null,
      implementer: data.implementer || null,
      schedule: {},
      source_issue_id: data.source_issue_id || null,
      status: 'todo',
      priority: data.priority || 'medium',
      assignee: data.assignee || null,
      kanban_column: data.kanban_column || 'planeacion',
      estimate: data.estimate || null,
      blocked_by: data.blocked_by || [],
      created_at: now,
      started_at: null,
      completed_at: null
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_tasks (
        id, project_id, title, description, client_name, implementer, schedule, source_issue_id,
        status, priority, assignee, kanban_column, estimate, blocked_by, created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.project_id,
      task.title,
      task.description,
      task.client_name,
      task.implementer,
      JSON.stringify(task.schedule),
      task.source_issue_id,
      task.status,
      task.priority,
      task.assignee,
      task.kanban_column,
      task.estimate,
      JSON.stringify(task.blocked_by),
      task.created_at,
      task.started_at,
      task.completed_at
    );

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('tsk', task.id),
      project_id: task.project_id,
      type: 'task.created',
      entity_type: 'task',
      entity_id: task.id,
      actor: 'agent:pm',
      payload: { title: task.title, priority: task.priority, kanban_column: task.kanban_column },
      timestamp: now
    }, this.sqlite);

    return task;
  }

  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    options: { kanban_column?: string; actor?: string } = {}
  ): Task {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_tasks WHERE id = ?`).get(taskId) as any;
    if (!raw) throw new Error(`Task '${taskId}' not found`);

    const current = parseTaskRow(raw);

    const now = new Date().toISOString();
    const completedAt = newStatus === 'done' ? now : null;
    const startedAt = newStatus === 'in_progress' && !current.started_at ? now : current.started_at;
    const kanbanColumn = options.kanban_column || (newStatus === 'done' ? 'finalizado' : newStatus === 'in_progress' ? 'en progreso' : current.kanban_column);

    const updated = TaskSchema.parse({
      ...current,
      status: newStatus,
      kanban_column: kanbanColumn,
      started_at: startedAt,
      completed_at: completedAt
    });

    this.sqlite.prepare(`
      UPDATE intelligence_tasks
      SET status = ?, kanban_column = ?, started_at = ?, completed_at = ?
      WHERE id = ?
    `).run(updated.status, updated.kanban_column, updated.started_at, updated.completed_at, taskId);

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('tsk', taskId),
      project_id: updated.project_id,
      type: 'task.status_changed',
      entity_type: 'task',
      entity_id: taskId,
      actor: options.actor || 'agent:dev',
      payload: { from_status: current.status, to_status: newStatus, kanban_column: kanbanColumn, completed_at: completedAt },
      timestamp: now
    }, this.sqlite);

    return updated;
  }

  /**
   * Edición de campos descriptivos de la tarjeta (título/descripción/cliente/PO/
   * dev/urgencia) — separado de updateTaskStatus (mueve de columna, D3) y de
   * updateTaskSchedule (cronograma). Modal "editar" del board migrado.
   */
  updateTask(taskId: string, data: {
    title?: string;
    description?: string | null;
    client_name?: string | null;
    implementer?: string | null;
    assignee?: string | null;
    priority?: Task['priority'];
  }): Task {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_tasks WHERE id = ?`).get(taskId) as any;
    if (!raw) throw new Error(`Task '${taskId}' not found`);
    const current = parseTaskRow(raw);

    const updated = TaskSchema.parse({
      ...current,
      title: data.title !== undefined ? data.title : current.title,
      description: data.description !== undefined ? data.description : current.description,
      client_name: data.client_name !== undefined ? data.client_name : current.client_name,
      implementer: data.implementer !== undefined ? data.implementer : current.implementer,
      assignee: data.assignee !== undefined ? data.assignee : current.assignee,
      priority: data.priority !== undefined ? data.priority : current.priority
    });

    this.sqlite.prepare(`
      UPDATE intelligence_tasks
      SET title = ?, description = ?, client_name = ?, implementer = ?, assignee = ?, priority = ?
      WHERE id = ?
    `).run(updated.title, updated.description, updated.client_name, updated.implementer, updated.assignee, updated.priority, taskId);

    this.eventRepo.append({
      id: createUniqueEventId('tsk', taskId),
      project_id: updated.project_id,
      type: 'task.updated',
      entity_type: 'task',
      entity_id: taskId,
      actor: 'human',
      payload: { title: updated.title },
      timestamp: new Date().toISOString()
    }, this.sqlite);

    return updated;
  }

  deleteTask(taskId: string): void {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_tasks WHERE id = ?`).get(taskId) as any;
    if (!raw) throw new Error(`Task '${taskId}' not found`);

    this.sqlite.prepare(`DELETE FROM intelligence_tasks WHERE id = ?`).run(taskId);

    this.eventRepo.append({
      id: createUniqueEventId('tsk', taskId),
      project_id: raw.project_id,
      type: 'task.deleted',
      entity_type: 'task',
      entity_id: taskId,
      actor: 'human',
      payload: { title: raw.title },
      timestamp: new Date().toISOString()
    }, this.sqlite);
  }

  getKanbanBoard(projectId: string): ReadResult<KanbanBoard> {
    const rows = this.sqlite.prepare(`
      SELECT * FROM intelligence_tasks WHERE project_id = ? ORDER BY created_at ASC
    `).all(projectId) as any[];

    const columns: Record<string, Task[]> = Object.fromEntries(KANBAN_COLUMNS.map(c => [c, []]));

    const tasks: Task[] = [];
    for (const r of rows) {
      const task = parseTaskRow(r);
      tasks.push(task);
      const col = task.kanban_column || 'planeacion';
      if (!columns[col]) columns[col] = [];
      columns[col].push(task);
    }

    return {
      data: {
        projectId,
        columns,
        totalTasks: tasks.length
      },
      sources: tasks.map(t => `[TASK:${t.id} (${t.status}) "${t.title}"]`),
      truncated: false
    };
  }

  getBlockedTasks(projectId: string): ReadResult<Task[]> {
    const rows = this.sqlite.prepare(`
      SELECT * FROM intelligence_tasks
      WHERE project_id = ? AND (status = 'blocked' OR blocked_by != '[]')
    `).all(projectId) as any[];

    const tasks = rows.map(parseTaskRow);

    return {
      data: tasks,
      sources: tasks.map(t => `[TASK:${t.id} (blocked)]`),
      truncated: false
    };
  }

  /**
   * Cronograma (migrado desde why/MIGRACION/kanban): mergea un patch parcial
   * dentro del JSON `schedule` de la tarea — ajustes de fecha por etapa,
   * estado (N/S) por etapa, y responsable por etapa. `kanban_column`, si viene,
   * mueve la tarjeta de columna reusando updateTaskStatus (mantiene D3: el
   * completed_at solo se toca ahí, no acá).
   */
  updateTaskSchedule(
    taskId: string,
    patch: {
      updates?: { section: 'sistemas' | 'diseno' | 'proyecto'; adjustment: number; field: 'inicio' | 'fin'; value: string | null }[];
      statuses?: { section: 'sistemas' | 'diseno' | 'proyecto'; value: string }[];
      responsible?: Partial<Record<'sistemas' | 'diseno' | 'proyecto', string>>;
      kanban_column?: string;
    },
    actor: string = 'human'
  ): Task {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_tasks WHERE id = ?`).get(taskId) as any;
    if (!raw) throw new Error(`Task '${taskId}' not found`);

    const schedule: Record<string, { estado: string; responsable: string | null; ajustes: { number: number; inicio: string | null; fin: string | null }[] }> =
      raw.schedule ? JSON.parse(raw.schedule) : {};

    const ensureSection = (key: string) => {
      if (!schedule[key]) schedule[key] = { estado: 'N', responsable: null, ajustes: [] };
      return schedule[key];
    };

    for (const u of patch.updates || []) {
      const section = ensureSection(u.section);
      let item = section.ajustes.find((a) => a.number === u.adjustment);
      if (!item) {
        item = { number: u.adjustment, inicio: null, fin: null };
        section.ajustes.push(item);
      }
      item[u.field] = u.value;
    }

    for (const s of patch.statuses || []) {
      ensureSection(s.section).estado = s.value;
    }

    for (const [section, name] of Object.entries(patch.responsible || {})) {
      ensureSection(section).responsable = name as string;
    }

    this.sqlite.prepare(`UPDATE intelligence_tasks SET schedule = ? WHERE id = ?`)
      .run(JSON.stringify(schedule), taskId);

    this.eventRepo.append({
      id: createUniqueEventId('tsk', taskId),
      project_id: raw.project_id,
      type: 'task.schedule_updated',
      entity_type: 'task',
      entity_id: taskId,
      actor,
      payload: { updates: patch.updates || [], statuses: patch.statuses || [], responsible: patch.responsible || {} },
      timestamp: new Date().toISOString()
    }, this.sqlite);

    if (patch.kanban_column) {
      return this.updateTaskStatus(taskId, columnToStatus(patch.kanban_column), { kanban_column: patch.kanban_column, actor });
    }

    const updatedRaw = this.sqlite.prepare(`SELECT * FROM intelligence_tasks WHERE id = ?`).get(taskId) as any;
    return parseTaskRow(updatedRaw);
  }

  // =========================================================================
  // 3. ISSUES (Invariant D2, R12, R13)
  // =========================================================================
  createIssue(data: {
    id?: string;
    project_id: string;
    title: string;
    severity?: Issue['severity'];
  }): Issue {
    const now = new Date().toISOString();
    const id = data.id || `iss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const issue = IssueSchema.parse({
      id,
      project_id: data.project_id,
      title: data.title,
      severity: data.severity || 'medium',
      status: 'open',
      reproduced: false,
      resolution: null,
      first_seen_at: now,
      resolved_at: null
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_issues (
        id, project_id, title, severity, status, reproduced, resolution, first_seen_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      issue.id,
      issue.project_id,
      issue.title,
      issue.severity,
      issue.status,
      issue.reproduced ? 1 : 0,
      issue.resolution,
      issue.first_seen_at,
      issue.resolved_at
    );

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('iss', issue.id),
      project_id: issue.project_id,
      type: 'issue.created',
      entity_type: 'issue',
      entity_id: issue.id,
      actor: 'human',
      payload: { title: issue.title, severity: issue.severity },
      timestamp: now
    }, this.sqlite);

    return issue;
  }

  transitionIssue(
    issueId: string,
    newStatus: IssueStatus,
    options: { actor?: string; resolution?: string; reproduced?: boolean } = {}
  ): Issue {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_issues WHERE id = ?`).get(issueId) as any;
    if (!raw) throw new Error(`Issue '${issueId}' not found`);

    const current = IssueSchema.parse({ ...raw, reproduced: Boolean(raw.reproduced) });
    const actor = options.actor || 'agent:dev';

    // Invariant D2 Validation
    const transitionValidation = validateIssueTransition(issueId, current.project_id, current.status, newStatus, actor);
    if (!transitionValidation.valid) {
      throw new Error(transitionValidation.error);
    }

    const now = new Date().toISOString();
    const isResolved = ['fixed', 'verified', 'closed'].includes(newStatus);
    const isReopening = transitionValidation.event?.type === 'issue.reopened';

    const resolution = isReopening ? null : (options.resolution ?? current.resolution);
    const resolvedAt = isReopening ? null : (isResolved ? (current.resolved_at || now) : current.resolved_at);
    const reproduced = options.reproduced ?? current.reproduced;

    const updated = IssueSchema.parse({
      ...current,
      status: newStatus,
      reproduced,
      resolution,
      resolved_at: resolvedAt
    });

    this.sqlite.prepare(`
      UPDATE intelligence_issues
      SET status = ?, reproduced = ?, resolution = ?, resolved_at = ?
      WHERE id = ?
    `).run(updated.status, updated.reproduced ? 1 : 0, updated.resolution, updated.resolved_at, issueId);

    // R12: Emit event
    if (transitionValidation.event) {
      this.eventRepo.append(transitionValidation.event, this.sqlite);
    }

    return updated;
  }

  getOpenIssues(projectId: string): ReadResult<(Issue & { linked_task: { id: string; title: string; kanban_column: string; status: string } | null })[]> {
    const rows = this.sqlite.prepare(`
      SELECT * FROM intelligence_issues
      WHERE project_id = ? AND status != 'closed'
      ORDER BY first_seen_at DESC
    `).all(projectId) as any[];

    const issues = rows.map(r => {
      const issue = IssueSchema.parse({ ...r, reproduced: Boolean(r.reproduced) });
      const linkedTaskRow = this.sqlite.prepare(`
        SELECT id, title, kanban_column, status FROM intelligence_tasks WHERE source_issue_id = ? ORDER BY created_at DESC LIMIT 1
      `).get(issue.id) as { id: string; title: string; kanban_column: string; status: string } | undefined;

      return { ...issue, linked_task: linkedTaskRow || null };
    });

    return {
      data: issues,
      sources: issues.map(i => `[ISSUE:${i.id} (${i.status}) "${i.title}"]`),
      truncated: false
    };
  }

  /** Issue -> Task: crea la tarea de trabajo y deja la referencia en ambos sentidos. */
  convertIssueToTask(issueId: string, data: {
    kanban_column?: string;
    assignee?: string | null;
    implementer?: string | null;
    client_name?: string | null;
    priority?: Task['priority'];
  } = {}): Task {
    const issueRaw = this.sqlite.prepare(`SELECT * FROM intelligence_issues WHERE id = ?`).get(issueId) as any;
    if (!issueRaw) throw new Error(`Issue '${issueId}' not found`);
    const issue = IssueSchema.parse({ ...issueRaw, reproduced: Boolean(issueRaw.reproduced) });

    const task = this.createTask({
      project_id: issue.project_id,
      title: issue.title,
      description: `Bug: ${issue.title} (severidad ${issue.severity})`,
      source_issue_id: issue.id,
      priority: data.priority || (issue.severity === 'critical' || issue.severity === 'high' ? 'urgent' : 'medium'),
      assignee: data.assignee ?? null,
      implementer: data.implementer ?? null,
      client_name: data.client_name ?? null,
      kanban_column: data.kanban_column || 'planeacion'
    });

    // Convertir en tarea es empezar a trabajarlo: avanza el issue por D2 hasta
    // in_progress (si ya estaba más adelante en el ciclo, no lo toca).
    if (issue.status === 'open') {
      this.transitionIssue(issueId, 'investigating', { actor: 'human' });
      this.transitionIssue(issueId, 'in_progress', { actor: 'human' });
    } else if (issue.status === 'investigating') {
      this.transitionIssue(issueId, 'in_progress', { actor: 'human' });
    }

    return task;
  }

  // =========================================================================
  // 4. DECISIONS (Invariant D4, R12, R13)
  // =========================================================================
  createDecision(data: {
    id?: string;
    project_id: string;
    title: string;
    context: string;
    options?: string[];
    related_task_id?: string | null;
    related_issue_id?: string | null;
  }): Decision {
    const now = new Date().toISOString();
    const id = data.id || `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const decision = DecisionSchema.parse({
      id,
      project_id: data.project_id,
      title: data.title,
      context: data.context,
      options: data.options || [],
      chosen: null,
      rationale: null,
      status: 'proposed',
      superseded_by: null,
      decided_at: null,
      related_task_id: data.related_task_id || null,
      related_issue_id: data.related_issue_id || null
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_decisions (
        id, project_id, title, context, options, chosen, rationale, status, superseded_by, decided_at, related_task_id, related_issue_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision.id,
      decision.project_id,
      decision.title,
      decision.context,
      JSON.stringify(decision.options),
      decision.chosen,
      decision.rationale,
      decision.status,
      decision.superseded_by,
      decision.decided_at,
      decision.related_task_id,
      decision.related_issue_id
    );

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('dec', decision.id),
      project_id: decision.project_id,
      type: 'decision.proposed',
      entity_type: 'decision',
      entity_id: decision.id,
      actor: 'agent:pm',
      payload: { title: decision.title, context: decision.context, options: decision.options },
      timestamp: now
    }, this.sqlite);

    return decision;
  }

  acceptDecision(decisionId: string, chosen: string, rationale: string, actor: string = 'human'): Decision {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_decisions WHERE id = ?`).get(decisionId) as any;
    if (!raw) throw new Error(`Decision '${decisionId}' not found`);

    const current = DecisionSchema.parse({
      ...raw,
      options: typeof raw.options === 'string' ? JSON.parse(raw.options) : raw.options
    });

    const now = new Date().toISOString();
    const updated = DecisionSchema.parse({
      ...current,
      status: 'accepted',
      chosen,
      rationale,
      decided_at: now
    });

    this.sqlite.prepare(`
      UPDATE intelligence_decisions
      SET status = ?, chosen = ?, rationale = ?, decided_at = ?
      WHERE id = ?
    `).run(updated.status, updated.chosen, updated.rationale, updated.decided_at, decisionId);

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('dec', decisionId),
      project_id: updated.project_id,
      type: 'decision.accepted',
      entity_type: 'decision',
      entity_id: decisionId,
      actor,
      payload: { chosen, rationale, decided_at: now },
      timestamp: now
    }, this.sqlite);

    return updated;
  }

  supersedeDecision(decisionId: string, supersededBy: string, actor: string = 'human'): Decision {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_decisions WHERE id = ?`).get(decisionId) as any;
    if (!raw) throw new Error(`Decision '${decisionId}' not found`);

    const current = DecisionSchema.parse({
      ...raw,
      options: typeof raw.options === 'string' ? JSON.parse(raw.options) : raw.options
    });

    // Invariant D4 Validation
    const updated = DecisionSchema.parse({
      ...current,
      status: 'superseded',
      superseded_by: supersededBy
    });

    this.sqlite.prepare(`
      UPDATE intelligence_decisions
      SET status = ?, superseded_by = ?
      WHERE id = ?
    `).run(updated.status, updated.superseded_by, decisionId);

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('dec', decisionId),
      project_id: updated.project_id,
      type: 'decision.superseded',
      entity_type: 'decision',
      entity_id: decisionId,
      actor,
      payload: { superseded_by: supersededBy },
      timestamp: new Date().toISOString()
    }, this.sqlite);

    return updated;
  }

  getProjectDecisions(projectId: string): ReadResult<Decision[]> {
    const rows = this.sqlite.prepare(`
      SELECT * FROM intelligence_decisions WHERE project_id = ? ORDER BY decided_at DESC, id DESC
    `).all(projectId) as any[];

    const decisions = rows.map(r => DecisionSchema.parse({
      ...r,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options
    }));

    return {
      data: decisions,
      sources: decisions.map(d => `[DECISION:${d.id} (${d.status}) "${d.title}"]`),
      truncated: false
    };
  }

  // =========================================================================
  // 5. CODE REVIEWS (§4.1, R12, R13)
  // =========================================================================
  createCodeReview(data: {
    id?: string;
    project_id: string;
    task_id?: string | null;
    issue_id?: string | null;
    commit_sha?: string | null;
    status?: CodeReview['status'];
    findings?: CodeReview['findings'];
  }): CodeReview {
    const now = new Date().toISOString();
    const id = data.id || `cr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const review = CodeReviewSchema.parse({
      id,
      project_id: data.project_id,
      task_id: data.task_id ?? null,
      issue_id: data.issue_id ?? null,
      commit_sha: data.commit_sha ?? null,
      status: data.status || 'pending',
      findings: data.findings || [],
      created_at: now
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_code_reviews (id, project_id, task_id, issue_id, commit_sha, status, findings, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      review.id,
      review.project_id,
      review.task_id,
      review.issue_id,
      review.commit_sha,
      review.status,
      JSON.stringify(review.findings),
      review.created_at
    );

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('cr', review.id),
      project_id: review.project_id,
      type: 'code_review.created',
      entity_type: 'code_review',
      entity_id: review.id,
      actor: 'agent:reviewer',
      payload: { status: review.status, findings_count: review.findings.length },
      timestamp: now
    }, this.sqlite);

    return review;
  }

  getCodeReview(reviewId: string): ReadResult<CodeReview | null> {
    const raw = this.sqlite.prepare(`SELECT * FROM intelligence_code_reviews WHERE id = ?`).get(reviewId) as any;
    if (!raw) return { data: null, sources: [], truncated: false };

    const review = CodeReviewSchema.parse({
      ...raw,
      findings: typeof raw.findings === 'string' ? JSON.parse(raw.findings) : raw.findings
    });

    return {
      data: review,
      sources: [`[REVIEW:${review.id} (${review.status})]`],
      truncated: false
    };
  }

  // =========================================================================
  // 6. DAILY NOTES WITH STRUCTURED ENTITY EXTRACTION (§4.1, Gate FASE 7)
  // =========================================================================
  createDailyNote(projectId: string, date: string, rawMarkdown: string): DailyNote {
    const now = new Date().toISOString();
    const id = `daily_${projectId}_${date}`;

    // Extract structured entities from markdown
    const extracted: ExtractedItem[] = [];

    // Pattern 1: @task: <title> or [TASK-id]. Corta antes del próximo marcador
    // @task:/@issue:/@decision: en vez de tragarse el resto de la línea cuando
    // varios van seguidos en el mismo párrafo.
    const taskMatches = rawMarkdown.matchAll(/@task:\s*([^\n\r]+?)(?=\s*@(?:task|issue|decision):|[\n\r]|$)/gi);
    let tIdx = 1;
    for (const match of taskMatches) {
      extracted.push({
        entity_type: 'task',
        entity_id: `extracted_task_${tIdx++}`,
        summary: match[1].trim()
      });
    }

    // Pattern 2: @issue: <severity>: <title> or [ISSUE-id]
    const issueMatches = rawMarkdown.matchAll(/@issue:\s*([^\n\r]+?)(?=\s*@(?:task|issue|decision):|[\n\r]|$)/gi);
    let iIdx = 1;
    for (const match of issueMatches) {
      extracted.push({
        entity_type: 'issue',
        entity_id: `extracted_issue_${iIdx++}`,
        summary: match[1].trim()
      });
    }

    // Pattern 3: @decision: <title> -> <chosen>
    const decisionMatches = rawMarkdown.matchAll(/@decision:\s*([^\n\r]+?)(?=\s*@(?:task|issue|decision):|[\n\r]|$)/gi);
    let dIdx = 1;
    for (const match of decisionMatches) {
      extracted.push({
        entity_type: 'decision',
        entity_id: `extracted_decision_${dIdx++}`,
        summary: match[1].trim()
      });
    }

    // Pattern 4: Wikilinks [[Entity]]
    const wikilinkMatches = rawMarkdown.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of wikilinkMatches) {
      extracted.push({
        entity_type: 'knowledge',
        entity_id: `wikilink_${match[1].trim().replace(/\s+/g, '_')}`,
        summary: match[1].trim()
      });
    }

    const note = DailyNoteSchema.parse({
      id,
      project_id: projectId,
      date,
      raw_markdown: rawMarkdown,
      extracted,
      created_at: now
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_daily_notes (id, project_id, date, raw_markdown, extracted, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        raw_markdown = excluded.raw_markdown,
        extracted = excluded.extracted
    `).run(note.id, note.project_id, note.date, note.raw_markdown, JSON.stringify(note.extracted), note.created_at);

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('daily', id),
      project_id: projectId,
      type: 'daily_note.created',
      entity_type: 'daily_note',
      entity_id: id,
      actor: 'human',
      payload: { date, extracted_count: extracted.length },
      timestamp: now
    }, this.sqlite);

    return note;
  }

  getDailyNotes(projectId: string): ReadResult<DailyNote[]> {
    const rows = this.sqlite.prepare(`
      SELECT * FROM intelligence_daily_notes WHERE project_id = ? ORDER BY date DESC
    `).all(projectId) as any[];

    const notes = rows.map(r => DailyNoteSchema.parse({
      ...r,
      extracted: typeof r.extracted === 'string' ? JSON.parse(r.extracted) : r.extracted
    }));

    return {
      data: notes,
      sources: notes.map(n => `[DAILY_NOTE:${n.id} (${n.date})]`),
      truncated: false
    };
  }

  // =========================================================================
  // 7. REPORTS (§4.1)
  // =========================================================================
  generateProjectReport(
    projectId: string,
    kind: ReportKind,
    periodStart: string,
    periodEnd: string
  ): Report {
    const now = new Date().toISOString();
    const id = `rep_${projectId}_${kind}_${Date.now()}`;

    // Query state and events in period
    const tasksDone = this.sqlite.prepare(`
      SELECT count(*) as count FROM intelligence_tasks
      WHERE project_id = ? AND status = 'done' AND completed_at >= ? AND completed_at <= ?
    `).get(projectId, periodStart, periodEnd) as any;

    const issuesResolved = this.sqlite.prepare(`
      SELECT count(*) as count FROM intelligence_issues
      WHERE project_id = ? AND status IN ('fixed', 'verified', 'closed') AND resolved_at >= ? AND resolved_at <= ?
    `).get(projectId, periodStart, periodEnd) as any;

    const eventsCount = this.sqlite.prepare(`
      SELECT count(*) as count FROM intelligence_events
      WHERE project_id = ? AND timestamp >= ? AND timestamp <= ?
    `).get(projectId, periodStart, periodEnd) as any;

    const content = `# Project Report (${kind.toUpperCase()})\n` +
      `**Period:** ${periodStart} to ${periodEnd}\n\n` +
      `## Summary Metrics\n` +
      `- **Tasks Completed:** ${tasksDone?.count || 0}\n` +
      `- **Issues Resolved:** ${issuesResolved?.count || 0}\n` +
      `- **Total Recorded Events:** ${eventsCount?.count || 0}\n\n` +
      `Generated deterministically from transactional timeline.`;

    const report = ReportSchema.parse({
      id,
      project_id: projectId,
      kind,
      period_start: periodStart,
      period_end: periodEnd,
      generated_at: now,
      content
    });

    this.sqlite.prepare(`
      INSERT INTO intelligence_reports (id, project_id, kind, period_start, period_end, generated_at, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(report.id, report.project_id, report.kind, report.period_start, report.period_end, report.generated_at, report.content);

    // R12: Emit event
    this.eventRepo.append({
      id: createUniqueEventId('rep', id),
      project_id: projectId,
      type: 'report.generated',
      entity_type: 'report',
      entity_id: id,
      actor: 'agent:pm',
      payload: { kind, period_start: periodStart, period_end: periodEnd },
      timestamp: now
    }, this.sqlite);

    return report;
  }
}

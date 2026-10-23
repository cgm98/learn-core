import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const intelligenceProjects = sqliteTable('intelligence_projects', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').notNull(),
  archived_at: text('archived_at')
});

export const intelligenceTasks = sqliteTable('intelligence_tasks', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  client_name: text('client_name'),
  implementer: text('implementer'),
  schedule: text('schedule').notNull().default('{}'), // JSON TaskSchedule (sistemas/diseno/proyecto)
  source_issue_id: text('source_issue_id'), // Issue -> Task: de qué bug salió esta tarea, si salió de uno
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('medium'),
  assignee: text('assignee'),
  kanban_column: text('kanban_column').notNull().default('planeacion'),
  estimate: text('estimate'),
  blocked_by: text('blocked_by').notNull().default('[]'), // JSON array of string IDs
  created_at: text('created_at').notNull(),
  started_at: text('started_at'),
  completed_at: text('completed_at')
}, (table) => ({
  projectIdx: index('idx_intelligence_tasks_project').on(table.project_id),
  statusIdx: index('idx_intelligence_tasks_status').on(table.status)
}));

export const intelligenceIssues = sqliteTable('intelligence_issues', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  severity: text('severity').notNull().default('medium'),
  status: text('status').notNull().default('open'),
  reproduced: integer('reproduced').notNull().default(0),
  resolution: text('resolution'),
  first_seen_at: text('first_seen_at').notNull(),
  resolved_at: text('resolved_at')
}, (table) => ({
  projectIdx: index('idx_intelligence_issues_project').on(table.project_id),
  statusIdx: index('idx_intelligence_issues_status').on(table.status)
}));

export const intelligenceCodeReviews = sqliteTable('intelligence_code_reviews', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  task_id: text('task_id').references(() => intelligenceTasks.id, { onDelete: 'set null' }),
  issue_id: text('issue_id').references(() => intelligenceIssues.id, { onDelete: 'set null' }),
  commit_sha: text('commit_sha'),
  status: text('status').notNull().default('pending'),
  findings: text('findings').notNull().default('[]'), // JSON array of Finding objects
  created_at: text('created_at').notNull()
}, (table) => ({
  projectIdx: index('idx_intelligence_code_reviews_project').on(table.project_id)
}));

export const intelligenceDecisions = sqliteTable('intelligence_decisions', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context').notNull(),
  options: text('options').notNull().default('[]'), // JSON array of string options
  chosen: text('chosen'),
  rationale: text('rationale'),
  status: text('status').notNull().default('proposed'),
  superseded_by: text('superseded_by'),
  decided_at: text('decided_at'),
  related_task_id: text('related_task_id'), // qué tarea motivó esta decisión, si aplica
  related_issue_id: text('related_issue_id') // qué bug motivó esta decisión, si aplica
}, (table) => ({
  projectIdx: index('idx_intelligence_decisions_project').on(table.project_id),
  statusIdx: index('idx_intelligence_decisions_status').on(table.status)
}));

export const intelligenceDailyNotes = sqliteTable('intelligence_daily_notes', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // YYYY-MM-DD
  raw_markdown: text('raw_markdown').notNull(),
  extracted: text('extracted').notNull().default('[]'), // JSON array of ExtractedItem
  created_at: text('created_at').notNull()
}, (table) => ({
  projectDateIdx: index('idx_intelligence_daily_notes_project_date').on(table.project_id, table.date)
}));

export const intelligenceReports = sqliteTable('intelligence_reports', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // daily, weekly, sprint, post_mortem, architecture
  period_start: text('period_start').notNull(),
  period_end: text('period_end').notNull(),
  generated_at: text('generated_at').notNull(),
  content: text('content').notNull()
}, (table) => ({
  projectKindIdx: index('idx_intelligence_reports_project_kind').on(table.project_id, table.kind)
}));

// Immutable Event Log (D1, I5)
export const intelligenceEvents = sqliteTable('intelligence_events', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => intelligenceProjects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  actor: text('actor').notNull(),
  payload: text('payload').notNull().default('{}'), // JSON payload
  timestamp: text('timestamp').notNull()
}, (table) => ({
  projectTimeIdx: index('idx_intelligence_events_project_time').on(table.project_id, table.timestamp),
  entityIdx: index('idx_intelligence_events_entity').on(table.entity_type, table.entity_id)
}));

// Persistent Memory (§4.1, §5)
export const agentMemories = sqliteTable('agent_memories', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(), // global, project, task, session
  scope_id: text('scope_id').notNull(),
  kind: text('kind').notNull(), // episodic, semantic, procedural
  content: text('content').notNull(),
  summary: text('summary').notNull(),
  importance: real('importance').notNull().default(0.5),
  confidence: real('confidence').notNull().default(1.0),
  source: text('source').notNull(),
  status: text('status').notNull().default('active'), // active, stale, invalidated
  created_at: text('created_at').notNull(),
  last_accessed_at: text('last_accessed_at').notNull(),
  invalidated_at: text('invalidated_at')
}, (table) => ({
  scopeIdx: index('idx_agent_memories_scope').on(table.scope, table.scope_id),
  statusIdx: index('idx_agent_memories_status').on(table.status),
  kindIdx: index('idx_agent_memories_kind').on(table.kind)
}));

// Knowledge Hierarchy Nodes (§4.1, R5 - No project_id on KnowledgeNode)
export const knowledgeNodes = sqliteTable('knowledge_nodes', {
  id: text('id').primaryKey(),
  level: text('level').notNull(), // area, domain, topic, note
  parent_id: text('parent_id'), // Self-referencing FK or validated in hierarchy
  title: text('title').notNull(),
  type: text('type').notNull().default('concept'),
  content: text('content').notNull().default(''),
  summary: text('summary'),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (table) => ({
  levelParentIdx: index('idx_knowledge_nodes_level_parent').on(table.level, table.parent_id),
  statusIdx: index('idx_knowledge_nodes_status').on(table.status)
}));

// Typed Graph Relations (§4.1, R6)
export const typedRelations = sqliteTable('typed_relations', {
  id: text('id').primaryKey(),
  from_type: text('from_type').notNull(),
  from_id: text('from_id').notNull(),
  relation: text('relation').notNull(),
  to_type: text('to_type').notNull(),
  to_id: text('to_id').notNull(),
  weight: real('weight').notNull().default(1.0),
  created_at: text('created_at').notNull()
}, (table) => ({
  fromIdx: index('idx_typed_relations_from').on(table.from_type, table.from_id),
  toIdx: index('idx_typed_relations_to').on(table.to_type, table.to_id),
  relationIdx: index('idx_typed_relations_type').on(table.relation)
}));

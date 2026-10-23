import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../../infrastructure/database/migrations.js';
import { ProjectManagementService } from './project-management.service.js';

describe('FASE 7: Project Management (Kanban, Tasks, Issues, Reviews, Daily, Decisions)', () => {
  function setupTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    sqliteVec.load(db);
    runMigrations(db);
    return db;
  }

  describe('1. Task Management & Kanban Board (Invariant D3, R12, R13)', () => {
    it('creates tasks, updates status, organizes Kanban columns and enforces D3', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);

      const project = service.createProject({
        slug: 'core-pm',
        name: 'Core PM System'
      });

      // 1. Create task (R12: emits task.created)
      const task1 = service.createTask({
        project_id: project.id,
        title: 'Design API Gateway',
        priority: 'high',
        kanban_column: 'planeacion',
        estimate: '4h'
      });
      assert.equal(task1.status, 'todo');
      assert.equal(task1.completed_at, null);

      const task2 = service.createTask({
        project_id: project.id,
        title: 'Setup Database Migrations',
        priority: 'urgent',
        kanban_column: 'planeacion'
      });

      // 2. Move task1 to in_progress
      const progressTask1 = service.updateTaskStatus(task1.id, 'in_progress');
      assert.equal(progressTask1.status, 'in_progress');
      assert.ok(progressTask1.started_at);
      assert.equal(progressTask1.completed_at, null);

      // 3. Move task1 to done (Invariant D3: completed_at must be set)
      const doneTask1 = service.updateTaskStatus(task1.id, 'done');
      assert.equal(doneTask1.status, 'done');
      assert.ok(doneTask1.completed_at);
      assert.equal(doneTask1.kanban_column, 'finalizado');

      // 4. Query Kanban board (R13 sources)
      const kanban = service.getKanbanBoard(project.id);
      assert.equal(kanban.data.totalTasks, 2);
      assert.equal(kanban.data.columns['finalizado'].length, 1);
      assert.equal(kanban.data.columns['planeacion'].length, 1);
      assert.ok(kanban.sources.length >= 2);
      assert.ok(kanban.sources[0].startsWith('[TASK:'));

      // Verify events emitted (R12)
      const events = db.prepare(`SELECT * FROM intelligence_events WHERE project_id = ?`).all(project.id) as any[];
      const eventTypes = events.map(e => e.type);
      assert.ok(eventTypes.includes('project.created'));
      assert.ok(eventTypes.includes('task.created'));
      assert.ok(eventTypes.includes('task.status_changed'));
    });
  });

  describe('2. Issue Lifecycle (Invariant D2, R12, R13)', () => {
    it('executes full D2 issue state machine with transactional events and reopening', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const project = service.createProject({ slug: 'issue-test', name: 'Issue Test' });

      // 1. Create issue (open)
      const issue = service.createIssue({
        project_id: project.id,
        title: 'Concurrent WAL lock contention',
        severity: 'critical'
      });
      assert.equal(issue.status, 'open');

      // 2. Transition open -> investigating
      const step1 = service.transitionIssue(issue.id, 'investigating', { reproduced: true });
      assert.equal(step1.status, 'investigating');
      assert.equal(step1.reproduced, true);

      // 3. Transition investigating -> in_progress
      const step2 = service.transitionIssue(issue.id, 'in_progress');
      assert.equal(step2.status, 'in_progress');

      // 4. Transition in_progress -> fixed (sets resolution)
      const step3 = service.transitionIssue(issue.id, 'fixed', {
        resolution: 'Configured busy_timeout to 5000ms'
      });
      assert.equal(step3.status, 'fixed');
      assert.equal(step3.resolution, 'Configured busy_timeout to 5000ms');
      assert.ok(step3.resolved_at);

      // 5. Transition fixed -> verified
      const step4 = service.transitionIssue(issue.id, 'verified');
      assert.equal(step4.status, 'verified');

      // 6. Transition verified -> closed
      const step5 = service.transitionIssue(issue.id, 'closed');
      assert.equal(step5.status, 'closed');

      // 7. Reopen from closed -> investigating (Issue regressed)
      const step6 = service.transitionIssue(issue.id, 'investigating');
      assert.equal(step6.status, 'investigating');
      assert.equal(step6.resolution, null); // Resolution cleared on reopen

      // 8. Assert illegal transition fails (investigating -> closed directly without fixing)
      assert.throws(() => {
        service.transitionIssue(issue.id, 'closed');
      }, /Invariant D2 Violation/);

      // Verify R13 open issues query
      const openIssues = service.getOpenIssues(project.id);
      assert.equal(openIssues.data.length, 1);
      assert.equal(openIssues.data[0].id, issue.id);
      assert.ok(openIssues.sources[0].includes('[ISSUE:'));
    });
  });

  describe('3. Decisions Management (Invariant D4, R12, R13)', () => {
    it('manages decision proposals, acceptance and D4 supersession', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const project = service.createProject({ slug: 'dec-test', name: 'Decision Test' });

      // 1. Propose decision
      const decision = service.createDecision({
        project_id: project.id,
        title: 'Adopt In-Process BM25',
        context: 'Need fast lexical search without external Elasticsearch or Python daemon',
        options: ['Elasticsearch', 'In-process BM25']
      });
      assert.equal(decision.status, 'proposed');

      // 2. Accept decision
      const accepted = service.acceptDecision(decision.id, 'In-process BM25', 'Zero IPC latency and embedded in Node.js');
      assert.equal(accepted.status, 'accepted');
      assert.equal(accepted.chosen, 'In-process BM25');

      // 3. Supersede decision (Invariant D4)
      const superseded = service.supersedeDecision(decision.id, 'ADR-009');
      assert.equal(superseded.status, 'superseded');
      assert.equal(superseded.superseded_by, 'ADR-009');

      // Query decisions with R13
      const decisionsResult = service.getProjectDecisions(project.id);
      assert.equal(decisionsResult.data.length, 1);
      assert.ok(decisionsResult.sources[0].includes('[DECISION:'));
    });
  });

  describe('3b. Code Reviews (§4.1, R12, R13, Gate FASE 7 "reviews")', () => {
    it('creates and retrieves a code review with real findings and an emitted event', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const project = service.createProject({ slug: 'review-test', name: 'Review Test' });
      const task = service.createTask({ project_id: project.id, title: 'Refactor timeline reducers' });

      const review = service.createCodeReview({
        project_id: project.id,
        task_id: task.id,
        status: 'changes_requested',
        findings: [{ id: 'f-1', file_path: 'timeline.engine.ts', severity: 'warning', description: 'Missing null check on reducer state' }]
      });
      assert.equal(review.status, 'changes_requested');
      assert.equal(review.findings.length, 1);

      const fetched = service.getCodeReview(review.id);
      assert.ok(fetched.data);
      assert.equal(fetched.data!.id, review.id);
      assert.ok(fetched.sources[0].includes('[REVIEW:'));

      // CodeReviewStatusSchema only allows pending/changes_requested/approved/dismissed —
      // 'dismissed' exercised here since the pre-fix MCP tool type wrongly allowed a
      // non-existent 'in_review' value instead.
      const dismissed = service.createCodeReview({ project_id: project.id, status: 'dismissed' });
      assert.equal(dismissed.status, 'dismissed');

      const events = db.prepare(`SELECT * FROM intelligence_events WHERE entity_type = 'code_review'`).all() as any[];
      assert.equal(events.length, 2);
      assert.ok(events.every(e => e.type === 'code_review.created'));
    });

    it('returns a null-data result for an unknown review id, not a thrown error', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const result = service.getCodeReview('nonexistent-review-id');
      assert.equal(result.data, null);
      assert.deepEqual(result.sources, []);
    });
  });

  describe('4. Daily Notes with Structured Entity Extraction (§4.1, Gate FASE 7)', () => {
    it('extracts tasks, issues, decisions and wikilinks as structured entities from daily note markdown', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const project = service.createProject({ slug: 'daily-test', name: 'Daily Test' });

      const markdown = `# Daily Log - 2026-08-21
Today we worked on the core persistence engine.

## Tasks
- @task: Implement Event Sourcing timeline reducers
- @task: Audit all foreign key triggers

## Bugs & Issues
- @issue: High: Memory leak when parsing large AST nodes

## Architectural Decisions
- @decision: Use SQLite WAL mode -> Better-SQLite3

## References
Consulted [[Clean Architecture]] and [[Write-Ahead Logging]] for design rules.
`;

      const note = service.createDailyNote(project.id, '2026-08-21', markdown);
      assert.ok(note);
      assert.equal(note.extracted.length, 6);

      // Verify extracted types
      const types = note.extracted.map(e => e.entity_type);
      assert.equal(types.filter(t => t === 'task').length, 2);
      assert.equal(types.filter(t => t === 'issue').length, 1);
      assert.equal(types.filter(t => t === 'decision').length, 1);
      assert.equal(types.filter(t => t === 'knowledge').length, 2);

      // Verify physical persistence in SQLite
      const raw = db.prepare(`SELECT * FROM intelligence_daily_notes WHERE id = ?`).get(note.id) as any;
      assert.ok(raw);
      const parsedExtracted = JSON.parse(raw.extracted);
      assert.equal(parsedExtracted.length, 6);
    });
  });

  describe('5. Deterministic Report Generation (§4.1)', () => {
    it('aggregates transactional state and timeline events into a persisted report', () => {
      const db = setupTestDb();
      const service = new ProjectManagementService(db);
      const project = service.createProject({ slug: 'rep-test', name: 'Report Test' });

      // Generate task and complete it
      const task = service.createTask({ project_id: project.id, title: 'Completed Feature' });
      service.updateTaskStatus(task.id, 'done');

      const now = new Date();
      const periodStart = new Date(now.getTime() - 86400000).toISOString();
      const periodEnd = new Date(now.getTime() + 86400000).toISOString();

      // Generate report
      const report = service.generateProjectReport(
        project.id,
        'daily',
        periodStart,
        periodEnd
      );

      assert.ok(report);
      assert.equal(report.kind, 'daily');
      assert.ok(report.content.includes('**Tasks Completed:** 1'));


      // Verify event emitted
      const events = db.prepare(`SELECT * FROM intelligence_events WHERE entity_type = 'report'`).all() as any[];
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'report.generated');
    });
  });
});

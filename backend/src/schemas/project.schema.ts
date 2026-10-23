import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { concepts } from './concept.schema.js';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  user_id: text('user_id'),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('active'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export const project_concepts = sqliteTable('project_concepts', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  concept_id: text('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  usage_type: text('usage_type').default('applied'),
  created_at: text('created_at').notNull()
});

export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hypothesis: text('hypothesis'),
  outcome: text('outcome'),
  status: text('status').default('planned'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

export const experiment_decisions = sqliteTable('experiment_decisions', {
  id: text('id').primaryKey(),
  experiment_id: text('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  concept_id: text('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  decision: text('decision').notNull(),
  rationale: text('rationale'),
  outcome: text('outcome'),
  created_at: text('created_at').notNull()
});

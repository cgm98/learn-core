<script setup lang="ts">
// Extraído de la vieja KanbanView.vue (fase "rediseño de IA") — Decisiones
// pasa de ser peer de Tablero a vivir bajo Documentación, como material de
// consulta/contexto en vez de trabajo activo.
import { ref, onMounted, watch } from 'vue';
import { IntelligenceService, type IntelligenceDecision, type IntelligenceIssue } from '../../services/intelligence.service.js';
import { useTasks } from './kanban/useTasks';

const props = defineProps<{ projectId: string }>();

const { tasks: allTasks, loadTasks: loadAllTasks } = useTasks(() => props.projectId);
const issues = ref<IntelligenceIssue[]>([]);
const decisions = ref<IntelligenceDecision[]>([]);
const newDecTitle = ref('');
const newDecContext = ref('');
const newDecRelatedTaskId = ref('');
const newDecRelatedIssueId = ref('');

async function loadData() {
  if (!props.projectId) return;
  const [decsRes, issuesRes] = await Promise.all([
    IntelligenceService.getDecisions(props.projectId),
    IntelligenceService.getIssues(props.projectId),
    loadAllTasks()
  ]);
  decisions.value = decsRes.data;
  issues.value = issuesRes.data;
}

async function createDecision() {
  if (!newDecTitle.value.trim() || !props.projectId) return;
  try {
    await IntelligenceService.createDecision(props.projectId, {
      title: newDecTitle.value.trim(),
      context: newDecContext.value.trim(),
      related_task_id: newDecRelatedTaskId.value || undefined,
      related_issue_id: newDecRelatedIssueId.value || undefined
    });
    newDecTitle.value = '';
    newDecContext.value = '';
    newDecRelatedTaskId.value = '';
    newDecRelatedIssueId.value = '';
    await loadData();
  } catch (err) {
    console.error('Error creating decision:', err);
  }
}

function taskTitle(taskId: string) {
  return allTasks.value.find((t: any) => t.id === taskId)?.moduleDescription || taskId;
}

watch(() => props.projectId, loadData);
onMounted(loadData);
</script>

<template>
  <div class="decisiones-view">
    <div class="create-dec-bar">
      <input v-model="newDecTitle" placeholder="Título de decisión arquitectónica (ADR)..." />
      <textarea v-model="newDecContext" placeholder="Contexto y motivaciones..."></textarea>
      <div class="dec-link-row">
        <select v-model="newDecRelatedTaskId">
          <option value="">Sin tarea relacionada</option>
          <option v-for="t in allTasks" :key="t.id" :value="t.id">Tarea: {{ t.moduleDescription }}</option>
        </select>
        <select v-model="newDecRelatedIssueId">
          <option value="">Sin issue relacionado</option>
          <option v-for="i in issues" :key="i.id" :value="i.id">Issue: {{ i.title }}</option>
        </select>
      </div>
      <button :disabled="!newDecTitle.trim()" @click="createDecision">Proponer Decisión</button>
    </div>

    <div class="decisions-list">
      <div v-for="dec in decisions" :key="dec.id" class="decision-card">
        <div class="decision-header">
          <span class="dec-status-badge" :class="dec.status">{{ dec.status }}</span>
          <span class="r13-tag">[DECISION:{{ dec.id }}]</span>
        </div>
        <h4>{{ dec.title }}</h4>
        <p class="dec-context">{{ dec.context }}</p>
        <p v-if="dec.related_task_id" class="linked-task-tag">→ Tarea: <strong>{{ taskTitle(dec.related_task_id) }}</strong></p>
        <p v-if="dec.related_issue_id" class="linked-task-tag">→ Issue: <strong>{{ issues.find(i => i.id === dec.related_issue_id)?.title || dec.related_issue_id }}</strong></p>
        <div v-if="dec.chosen" class="dec-choice">
          <span><strong>Elegido:</strong> {{ dec.chosen }}</span>
          <span><strong>Razón:</strong> {{ dec.rationale }}</span>
        </div>
        <div v-if="dec.superseded_by" class="superseded-notice">
          Reemplazada por: {{ dec.superseded_by }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decisiones-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.create-dec-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.create-dec-bar input, .create-dec-bar textarea {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 10px 14px;
  border-radius: var(--r-md, 8px);
  font-family: inherit;
}

.create-dec-bar input:focus, .create-dec-bar textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.dec-link-row {
  display: flex;
  gap: 10px;
}

.dec-link-row select {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 8px 10px;
  border-radius: var(--r-md, 8px);
}

.create-dec-bar button {
  align-self: flex-start;
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: var(--r-md, 8px);
  font-weight: 600;
  cursor: pointer;
}

.create-dec-bar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.decisions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.decision-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.decision-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.dec-status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  text-transform: uppercase;
  font-weight: 600;
  color: var(--muted);
}

.dec-status-badge.accepted { color: var(--success); border-color: var(--success); }
.dec-status-badge.superseded { color: var(--muted); }

.r13-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

.dec-context {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 4px;
}

.linked-task-tag {
  font-size: 12px;
  color: var(--accent);
  margin: 4px 0 0;
}

.dec-choice {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--fg);
  margin-top: 6px;
}

.superseded-notice {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  font-style: italic;
}

@media (max-width: 640px) {
  .dec-link-row { flex-direction: column; }
}
</style>

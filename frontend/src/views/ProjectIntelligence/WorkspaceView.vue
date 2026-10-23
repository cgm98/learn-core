<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { IntelligenceService, type ProjectStateResponse, type AgentTurnResponse, type IntelligenceTask, type IntelligenceIssue, type IntelligenceDecision } from '../../services/intelligence.service.js';
import { ClipboardList, Bug, Brain, Zap, AlertTriangle, Landmark } from 'lucide-vue-next';

const props = defineProps<{
  projectId: string;
}>();

const router = useRouter();

const loading = ref(false);
const state = ref<ProjectStateResponse | null>(null);
const queryText = ref('');
const agentLoading = ref(false);
const agentTurn = ref<AgentTurnResponse | null>(null);

// Radar accionable: lo primero que un PM necesita ver, no listas de KPIs
// estáticas. Cada ítem navega directo al Tablero/Documentación con foco en
// esa tarea/issue/decisión — ver plan "Rediseño de IA de /intelligence".
const urgentTasks = ref<IntelligenceTask[]>([]);
const untriagedIssues = ref<IntelligenceIssue[]>([]);
const proposedDecisions = ref<IntelligenceDecision[]>([]);

async function loadRadar() {
  if (!props.projectId) return;
  try {
    const [kanbanRes, issuesRes, decsRes] = await Promise.all([
      IntelligenceService.getKanban(props.projectId),
      IntelligenceService.getIssues(props.projectId),
      IntelligenceService.getDecisions(props.projectId)
    ]);
    const allTasks = Object.values(kanbanRes.data.columns).flat();
    urgentTasks.value = allTasks.filter((t) => t.priority === 'urgent' && t.kanban_column !== 'finalizado');
    untriagedIssues.value = issuesRes.data.filter((i) => !i.linked_task && i.status !== 'closed');
    proposedDecisions.value = decsRes.data.filter((d) => d.status === 'proposed');
  } catch (err) {
    console.error('Error loading radar:', err);
  }
}

function goToTask(task: IntelligenceTask) {
  router.push({ path: '/intelligence', query: { tab: 'kanban', focusTaskId: task.id } });
}

function goToTriage() {
  router.push({ path: '/intelligence', query: { tab: 'kanban', openTriage: '1' } });
}

function goToDecisiones() {
  router.push({ path: '/intelligence', query: { tab: 'documentacion', doc: 'decisiones' } });
}

async function loadState() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await IntelligenceService.getProjectState(props.projectId);
    state.value = res.data;
    await loadRadar();
  } catch (err) {
    console.error('Error loading project state:', err);
  } finally {
    loading.value = false;
  }
}

async function runAgentQuery() {
  if (!queryText.value.trim() || !props.projectId) return;
  agentLoading.value = true;
  try {
    const res = await IntelligenceService.executeAgentTurn(props.projectId, queryText.value.trim());
    agentTurn.value = res.data;
  } catch (err) {
    console.error('Agent execution error:', err);
  } finally {
    agentLoading.value = false;
  }
}

watch(() => props.projectId, () => {
  loadState();
  agentTurn.value = null;
});

onMounted(() => {
  loadState();
});
</script>

<template>
  <div class="workspace-view">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando estado del proyecto...</p>
    </div>

    <div v-else-if="state" class="workspace-grid">
      <!-- Radar accionable: riesgo y prioridad de un vistazo -->
      <div v-if="urgentTasks.length || untriagedIssues.length || proposedDecisions.length" class="radar-row">
        <div v-if="urgentTasks.length" class="radar-card urgent">
          <div class="radar-header"><AlertTriangle :size="16" /><h3>Urgentes activas</h3></div>
          <button v-for="t in urgentTasks" :key="t.id" class="radar-item" @click="goToTask(t)">
            {{ t.title }} <span class="radar-tag">{{ t.kanban_column }}</span>
          </button>
        </div>

        <div v-if="untriagedIssues.length" class="radar-card issues">
          <div class="radar-header"><Bug :size="16" /><h3>Bugs sin triar</h3></div>
          <button class="radar-item" @click="goToTriage">
            {{ untriagedIssues.length }} issue(s) esperando conversión a tarea
          </button>
        </div>

        <div v-if="proposedDecisions.length" class="radar-card decisions">
          <div class="radar-header"><Landmark :size="16" /><h3>Decisiones sin aceptar</h3></div>
          <button v-for="d in proposedDecisions" :key="d.id" class="radar-item" @click="goToDecisiones">
            {{ d.title }}
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-row">
        <div class="kpi-card task-kpi">
          <div class="kpi-header">
            <span class="icon"><ClipboardList :size="18" /></span>
            <h3>Tareas Kanban</h3>
          </div>
          <div class="kpi-body">
            <div class="metric">
              <span class="value">{{ (state.taskCounts.todo || 0) + (state.taskCounts.in_progress || 0) }}</span>
              <span class="label">Activas</span>
            </div>
            <div class="metric-breakdown">
              <span>Backlog: <strong>{{ state.taskCounts.todo || 0 }}</strong></span>
              <span>Progreso: <strong>{{ state.taskCounts.in_progress || 0 }}</strong></span>
              <span>Done: <strong>{{ state.taskCounts.done || 0 }}</strong></span>
            </div>
          </div>
        </div>

        <div class="kpi-card issue-kpi">
          <div class="kpi-header">
            <span class="icon"><Bug :size="18" /></span>
            <h3>Issues & Bugs</h3>
          </div>
          <div class="kpi-body">
            <div class="metric">
              <span class="value">{{ (state.issueCounts.open || 0) + (state.issueCounts.investigating || 0) + (state.issueCounts.in_progress || 0) }}</span>
              <span class="label">Abiertos</span>
            </div>
            <div class="metric-breakdown">
              <span>Open: <strong>{{ state.issueCounts.open || 0 }}</strong></span>
              <span>Investigando: <strong>{{ state.issueCounts.investigating || 0 }}</strong></span>
              <span>Fixed/Closed: <strong>{{ (state.issueCounts.fixed || 0) + (state.issueCounts.closed || 0) }}</strong></span>
            </div>
          </div>
        </div>

        <div class="kpi-card memory-kpi">
          <div class="kpi-header">
            <span class="icon"><Brain :size="18" /></span>
            <h3>Memorias Persistentes</h3>
          </div>
          <div class="kpi-body">
            <div class="metric">
              <span class="value">{{ Object.values(state.memoryCounts || {}).reduce((a, b) => a + b, 0) }}</span>
              <span class="label">En Scope</span>
            </div>
            <div class="metric-breakdown">
              <span>Episódica: <strong>{{ state.memoryCounts?.episodic || 0 }}</strong></span>
              <span>Procedural: <strong>{{ state.memoryCounts?.procedural || 0 }}</strong></span>
              <span>Semántica: <strong>{{ state.memoryCounts?.semantic || 0 }}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Consola del agente PM: cada respuesta cita de dónde salió el dato -->
      <div class="agent-panel">
        <div class="panel-header">
          <div class="title-with-badge">
            <h2>Consultar al asistente del proyecto</h2>
            <span class="badge verified">Respuestas con fuente verificada</span>
          </div>
          <p class="subtitle">Cada dato que muestra viene de una consulta real al estado del proyecto, nunca inventado.</p>
        </div>

        <div class="agent-input-row">
          <input
            v-model="queryText"
            type="text"
            placeholder="Escribe una consulta operativa (ej. ¿Cuál es el estado del proyecto?, ¿Qué tareas están bloqueadas?)"
            @keyup.enter="runAgentQuery"
          />
          <button :disabled="agentLoading || !queryText.trim()" @click="runAgentQuery">
            <span v-if="agentLoading">Consultando...</span>
            <span v-else>Ejecutar Turno</span>
          </button>
        </div>

        <div v-if="agentTurn" class="agent-result">
          <div class="turn-meta">
            <span><strong>Turn ID:</strong> {{ agentTurn.turnId }}</span>
            <span><strong>Rol:</strong> {{ agentTurn.role }}</span>
            <span><strong>Tools Ejecutadas:</strong> {{ agentTurn.toolCallsExecuted.length }}</span>
          </div>

          <div class="tools-execution-trail">
            <h4>Consultas realizadas:</h4>
            <div class="tools-list">
              <div v-for="(tc, idx) in agentTurn.toolCallsExecuted" :key="idx" class="tool-tag">
                <Zap :size="11" /> {{ tc.toolName }}
              </div>
            </div>
          </div>

          <div class="response-box">
            <h4>Respuesta:</h4>
            <div class="response-content">{{ agentTurn.response }}</div>
          </div>

          <div v-if="agentTurn.citedSources.length" class="sources-box">
            <h4>Fuentes:</h4>
            <div class="sources-list">
              <span v-for="(src, idx) in agentTurn.citedSources" :key="idx" class="source-tag">
                {{ src }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.radar-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.radar-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radar-card.urgent { border-left-color: var(--danger); }
.radar-card.issues { border-left-color: #f97316; }
.radar-card.decisions { border-left-color: var(--warning); }

.radar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg);
}

.radar-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.radar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 8px 10px;
  border-radius: var(--r-md, 8px);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s;
}

.radar-item:hover {
  border-color: var(--accent);
}

.radar-tag {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 20px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.kpi-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.kpi-header .icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.kpi-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--fg);
}

.kpi-body {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric .value {
  font-size: 2rem;
  font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.metric .label {
  font-size: 12px;
  color: var(--muted);
}

.metric-breakdown {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}

.agent-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 24px;
}

.panel-header {
  margin-bottom: 16px;
}

.title-with-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.title-with-badge h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--fg);
}

.badge.verified {
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
  border: 1px solid var(--success);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.subtitle {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--muted);
}

.agent-input-row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.agent-input-row input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 10px 14px;
  border-radius: var(--r-md, 8px);
  font-size: 14px;
  font-family: inherit;
}

.agent-input-row input:focus {
  outline: none;
  border-color: var(--accent);
}

.agent-input-row button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: var(--r-md, 8px);
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.agent-input-row button:hover {
  opacity: 0.9;
}

.agent-input-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-result {
  margin-top: 24px;
  padding: 18px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
}

.turn-meta {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
}

.tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-family: var(--font-mono);
}

.response-box {
  margin-bottom: 16px;
}

.response-box h4, .tools-execution-trail h4, .sources-box h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.response-content {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.6;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: var(--r-md, 8px);
}

.sources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.source-tag {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-family: var(--font-mono);
}
</style>

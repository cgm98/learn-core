<script setup lang="ts">
// Tablero unificado: Kanban y Cronograma son dos lentes sobre el mismo
// trabajo, no dos pestañas separadas — y los bugs sin triar viven acá como
// cola de acción, no como una pestaña "Issues" aparte. Ver plan "Rediseño de
// IA de /intelligence".
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IntelligenceService, type IntelligenceIssue, type IntelligenceDecision, type DailyNote } from '../../services/intelligence.service.js';
import { useTasks } from './kanban/useTasks';
import KanbanBoard from './kanban/KanbanBoard.vue';
import ScheduleGrid2 from './cronograma/ScheduleGrid2.vue';
import TaskDetailPanel from './TaskDetailPanel.vue';
import { Kanban, CalendarRange, Bug, X } from 'lucide-vue-next';

const props = defineProps<{ projectId: string }>();
const route = useRoute();

const viewMode = ref<'kanban' | 'cronograma'>('kanban');
const kanbanRef = ref<InstanceType<typeof KanbanBoard> | null>(null);

const { tasks: cronoTasks, isLoading: cronoLoading, loadTasks: loadCronoTasks, getUnique: cronoGetUnique } = useTasks(() => props.projectId);
const cronoUsers = computed(() => [...new Set([...cronoGetUnique('systemOwner'), ...cronoGetUnique('implementer')])]);

const issues = ref<IntelligenceIssue[]>([]);
const decisions = ref<IntelligenceDecision[]>([]);
const notes = ref<DailyNote[]>([]);
const selectedTask = ref<any>(null);
const triageOpen = ref(false);
let hasAppliedFocusFromUrl = false;

const untriagedIssues = computed(() => issues.value.filter((i) => !i.linked_task && i.status !== 'closed'));

async function loadContext() {
  if (!props.projectId) return;
  const [issuesRes, decsRes, notesRes] = await Promise.all([
    IntelligenceService.getIssues(props.projectId),
    IntelligenceService.getDecisions(props.projectId),
    IntelligenceService.getDailyNotes(props.projectId)
  ]);
  issues.value = issuesRes.data;
  decisions.value = decsRes.data;
  notes.value = notesRes.data;
}

function refreshBoards() {
  kanbanRef.value?.loadTasks();
  loadCronoTasks();
}

async function convertIssue(issue: IntelligenceIssue) {
  try {
    await IntelligenceService.convertIssueToTask(props.projectId, issue.id);
    await loadContext();
    refreshBoards();
  } catch (err: any) {
    alert(err.message || 'Error convirtiendo el issue en tarea');
  }
}

function openTaskDetail(task: any) {
  selectedTask.value = task;
}

function closeTaskDetail() {
  selectedTask.value = null;
}

function onTaskUpdated() {
  refreshBoards();
}

function tryApplyFocusFromUrl() {
  if (hasAppliedFocusFromUrl) return;
  const focusId = route.query.focusTaskId as string | undefined;
  if (!focusId) return;
  const found = cronoTasks.value.find((t: any) => t.id === focusId);
  if (found) {
    selectedTask.value = found;
    hasAppliedFocusFromUrl = true;
  }
}

watch(() => props.projectId, () => {
  loadContext();
  loadCronoTasks();
});

watch(cronoTasks, tryApplyFocusFromUrl);

onMounted(() => {
  loadContext();
  loadCronoTasks();
  // Desde Resumen: "Bugs sin triar" navega acá con ?openTriage=1 para abrir
  // el drawer directo en vez de hacer buscar al usuario.
  if (route.query.openTriage) triageOpen.value = true;
});
</script>

<template>
  <div class="trabajo-view">
    <div class="trabajo-toolbar">
      <div class="view-toggle">
        <button :class="{ active: viewMode === 'kanban' }" @click="viewMode = 'kanban'">
          <Kanban :size="14" /> Kanban
        </button>
        <button :class="{ active: viewMode === 'cronograma' }" @click="viewMode = 'cronograma'">
          <CalendarRange :size="14" /> Cronograma
        </button>
      </div>

      <button class="triage-btn" :class="{ 'has-pending': untriagedIssues.length }" @click="triageOpen = true">
        <Bug :size="14" /> Bugs sin triar
        <span v-if="untriagedIssues.length" class="triage-count">{{ untriagedIssues.length }}</span>
      </button>
    </div>

    <div class="trabajo-surface">
      <KanbanBoard
        v-show="viewMode === 'kanban'"
        ref="kanbanRef"
        :project-id="projectId"
        @select-task="openTaskDetail"
      />
      <ScheduleGrid2
        v-if="viewMode === 'cronograma'"
        :project-id="projectId"
        :tasks="cronoTasks"
        :users="cronoUsers"
        :is-loading="cronoLoading"
        :stage-bars="true"
        @refresh="loadCronoTasks"
        @update-task="loadCronoTasks"
        @select-task="openTaskDetail"
      />
    </div>

    <TaskDetailPanel
      v-if="selectedTask"
      :project-id="projectId"
      :task="selectedTask"
      :issues="issues"
      :decisions="decisions"
      :notes="notes"
      @close="closeTaskDetail"
      @task-updated="onTaskUpdated"
    />

    <div v-if="triageOpen" class="triage-drawer-overlay" @click="triageOpen = false">
      <aside class="triage-drawer" @click.stop>
        <div class="triage-header">
          <h3>Bugs sin triar</h3>
          <button class="close-btn" type="button" @click="triageOpen = false"><X :size="18" /></button>
        </div>
        <p v-if="!untriagedIssues.length" class="triage-empty">No hay bugs pendientes de convertir en tarea.</p>
        <div v-for="issue in untriagedIssues" :key="issue.id" class="triage-item">
          <div class="triage-item-main">
            <span class="severity-badge" :class="issue.severity">{{ issue.severity }}</span>
            <span>{{ issue.title }}</span>
          </div>
          <button class="convert-btn" @click="convertIssue(issue)">Convertir en tarea</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.trabajo-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.trabajo-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.view-toggle {
  display: flex;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  padding: 4px;
  width: fit-content;
}

.view-toggle button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 7px 14px;
  border-radius: var(--r-sm, 6px);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.view-toggle button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.triage-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 8px 14px;
  border-radius: var(--r-md, 8px);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.triage-btn.has-pending {
  border-color: var(--danger);
  color: var(--danger);
}

.triage-count {
  background: var(--danger);
  color: white;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 11px;
}

.trabajo-surface {
  flex: 1;
  min-height: 0;
  height: 70vh;
}

.triage-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(17, 17, 17, 0.4);
}

.triage-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(360px, 100%);
  background: var(--surface);
  border-left: 1px solid var(--border);
  padding: 18px;
  overflow-y: auto;
}

.triage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.close-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg);
  border-radius: 8px;
  width: 30px;
  height: 30px;
  cursor: pointer;
}

.triage-empty {
  color: var(--muted);
  font-size: 13px;
}

.triage-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  margin-bottom: 10px;
}

.triage-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.severity-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  text-transform: uppercase;
  font-weight: 600;
  color: var(--muted);
}

.severity-badge.critical, .severity-badge.high { color: var(--danger); border-color: var(--danger); }

.convert-btn {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: var(--r-md, 8px);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>

<script setup lang="ts">
import './style.css';
import { ref, computed, onMounted } from 'vue';
import { Loader2, Trash2 } from 'lucide-vue-next';
import { useCodeReviewStore } from '../../stores/code-review.store';
import { usePersonStore } from '../../stores/person.store';
import Modal from '../../components/Modal/Index.vue';
import { todayLocal } from '../../lib/recurrence';
import type { CodeReview, CodeReviewStatus } from '../../types/code-review.types';

import { CodeGraphService } from '../../services/code-graph.service';
import { ShieldAlert, ShieldCheck, AlertTriangle, FlaskConical, Copy } from 'lucide-vue-next';

const store = useCodeReviewStore();
const personStore = usePersonStore();

const driftReport = ref<{
  total_violations: number;
  critical_count: number;
  warning_count: number;
  violations: { id: string; rule: string; severity: 'critical' | 'warning'; source: string; target: string; message: string }[];
} | null>(null);

const driftLoading = ref(false);

const loadDriftReport = async () => {
  driftLoading.value = true;
  try {
    driftReport.value = await CodeGraphService.drift('learn');
  } catch (e) {
    console.error('Error loading drift report', e);
  } finally {
    driftLoading.value = false;
  }
};

const testGapsReport = ref<{
  total_gaps: number;
  gaps: { id: string; name: string; kind: string; file_path: string; start_line: number; fan_in: number; test_boilerplate: string }[];
} | null>(null);

const testGapsLoading = ref(false);

const loadTestGapsReport = async () => {
  testGapsLoading.value = true;
  try {
    testGapsReport.value = await CodeGraphService.testGaps('learn', 8);
  } catch (e) {
    console.error('Error loading test gaps report', e);
  } finally {
    testGapsLoading.value = false;
  }
};

const copyTestBoilerplate = async (gap: { name: string; test_boilerplate: string }) => {
  try {
    await navigator.clipboard.writeText(gap.test_boilerplate);
    triggerToast(`🧪 Template de test para ${gap.name} copiado`);
  } catch (_e) {
    triggerToast('Error al copiar al portapapeles', 'error');
  }
};

const STATUS_LABELS: Record<CodeReviewStatus, string> = {
  pending: 'Pendiente',
  changes_requested: 'Cambios pedidos',
  approved: 'Aprobada'
};
const STATUSES: CodeReviewStatus[] = ['pending', 'changes_requested', 'approved'];

const toastMsg = ref(''); const toastType = ref<'success' | 'error'>('success'); const toastVisible = ref(false);
const triggerToast = (msg: string, type: 'success' | 'error' = 'success') => {
  toastMsg.value = msg; toastType.value = type; toastVisible.value = true;
  setTimeout(() => { toastVisible.value = false; }, 2500);
};

onMounted(async () => {
  try {
    await Promise.all([store.fetchCodeReviews(), personStore.fetchPeople(), loadDriftReport(), loadTestGapsReport()]);
  } catch (e) { console.error(e); }
});

// --- Alta rápida ---
const fTitle = ref('');
const fDevId = ref('');
const fUrl = ref('');

const initialLoading = computed(() => store.loading && store.codeReviews.length === 0);

const handleCreate = async () => {
  // Sin este guard, un doble-click dispara dos POST antes de que el
  // primero resuelva y crea la review duplicada.
  if (store.loading) return;
  const title = fTitle.value.trim();
  if (!title) return triggerToast('El título es obligatorio', 'error');
  try {
    await store.createCodeReview({
      title,
      dev_id: fDevId.value || null,
      url: fUrl.value.trim() || null
    });
    fTitle.value = ''; fUrl.value = '';
    triggerToast('Review creada');
  } catch (e: any) {
    triggerToast(e.message || 'Error', 'error');
  }
};

// --- Filtros: dev + estado; por defecto se ocultan las aprobadas ---
const devFilter = ref('');
const statusFilter = ref<CodeReviewStatus | ''>('');
const showApproved = ref(false);

const assignedDevIds = computed(() => new Set(store.codeReviews.map(r => r.dev_id).filter(Boolean)));
const devs = computed(() => personStore.people.filter(p => assignedDevIds.value.has(p.id)));

const filtered = computed(() =>
  store.codeReviews
    .filter(r => showApproved.value || statusFilter.value === 'approved' || r.status !== 'approved')
    .filter(r => !devFilter.value || r.dev_id === devFilter.value)
    .filter(r => !statusFilter.value || r.status === statusFilter.value)
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1;
      // Más vieja primero: una review sin fecha no debe enterrarse bajo las
      // recién creadas — es la que más se está olvidando.
      return a.created_at < b.created_at ? -1 : 1;
    })
);

const devName = (id: string | null) => {
  if (!id) return null;
  return personStore.people.find(p => p.id === id)?.name || '?';
};

const today = todayLocal();
const isOverdue = (r: CodeReview) => r.due_date !== null && r.due_date < today && r.status !== 'approved';
const isDueSoon = (r: CodeReview) => {
  if (!r.due_date || r.status === 'approved' || isOverdue(r)) return false;
  const limit = new Date(); limit.setDate(limit.getDate() + 3);
  return r.due_date <= todayLocal(limit);
};

// --- Edición inline: cambiar estado/fecha/notas es la operación diaria, sin form ---
const patch = async (r: CodeReview, data: Partial<CodeReview>) => {
  try {
    await store.updateCodeReview(r.id, data);
  } catch (e: any) {
    triggerToast(e.message || 'Error', 'error');
  }
};

// --- Eliminar ---
const showDeleteModal = ref(false);
const reviewToDeleteId = ref('');
const clickDelete = (id: string) => { reviewToDeleteId.value = id; showDeleteModal.value = true; };
const confirmDelete = async () => {
  showDeleteModal.value = false;
  try {
    await store.deleteCodeReview(reviewToDeleteId.value);
    triggerToast('Review eliminada');
  } catch (e: any) {
    triggerToast(e.message || 'Error al eliminar', 'error');
  }
};
</script>

<template>
  <div class="creviews-container animate-fade-in">
    <header class="creviews-header">
      <h1>Reviews & Blast Risk<Loader2 v-if="initialLoading" :size="20" class="creviews-header-spinner" /></h1>
      <p>Control de impacto estructural, asignación de revisiones de PRs y auditoría de blast radius antes de mezclar código.</p>
    </header>

    <!-- UNFAIR ADVANTAGE: Architectural Drift Detector Panel -->
    <section v-if="driftReport" class="drift-panel" :class="driftReport.critical_count > 0 ? 'drift-panel-alert' : 'drift-panel-clean'">
      <div class="drift-panel-header">
        <div class="drift-status-title">
          <component :is="driftReport.critical_count > 0 ? ShieldAlert : ShieldCheck" :size="20" class="drift-icon" />
          <span>Architectural Drift & AI Guardrails: {{ driftReport.critical_count > 0 ? `${driftReport.critical_count} Violación(es) Crítica(s) detectadas` : 'Capas Limpias 100% Conformes' }}</span>
        </div>
        <button @click="loadDriftReport" class="btn-drift-refresh" title="Reescanear Grafo AST">
          Reauditar AST
        </button>
      </div>

      <div v-if="driftReport.violations.length > 0" class="drift-violations-list">
        <div v-for="v in driftReport.violations" :key="v.id" class="drift-item" :class="`drift-${v.severity}`">
          <div class="drift-item-top">
            <span class="drift-rule-badge">{{ v.rule }}</span>
            <span class="drift-severity-badge">{{ v.severity.toUpperCase() }}</span>
          </div>
          <p class="drift-item-msg">{{ v.message }}</p>
          <div class="drift-item-flow">
            <span class="drift-from">{{ v.source }}</span>
            <span class="drift-arrow">→ IMPORTS / CALLS →</span>
            <span class="drift-to">{{ v.target }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- UNFAIR ADVANTAGE: Automated Test Gap Finder Panel -->
    <section v-if="testGapsReport && testGapsReport.gaps.length > 0" class="drift-panel test-gaps-panel">
      <div class="drift-panel-header">
        <div class="drift-status-title">
          <FlaskConical :size="20" class="test-gaps-icon" />
          <span>Automated Test Gap Finder: {{ testGapsReport.total_gaps }} símbolos de alto impacto sin pruebas</span>
        </div>
        <button @click="loadTestGapsReport" class="btn-drift-refresh" title="Reescanear Cobertura AST">
          Reauditar Tests
        </button>
      </div>

      <div class="test-gaps-grid">
        <div v-for="g in testGapsReport.gaps" :key="g.id" class="test-gap-card">
          <div class="test-gap-head">
            <span class="test-gap-name">{{ g.name }} <small>({{ g.kind }})</small></span>
            <span class="test-gap-callers">⚡ {{ g.fan_in }} callers</span>
          </div>
          <div class="test-gap-file">{{ g.file_path.split(/[/\\]/).pop() }}:{{ g.start_line }}</div>
          <button class="btn-copy-test" @click="copyTestBoilerplate(g)">
            <Copy :size="12" /> Copiar Boilerplate de Test
          </button>
        </div>
      </div>
    </section>

    <!-- Alta rápida -->
    <div class="quick-add">
      <div class="field-group grow">
        <label>Título *</label>
        <input v-model="fTitle" type="text" placeholder="Ej: PR #142 login" @keydown.enter="handleCreate">
      </div>
      <div class="field-group">
        <label>Dev</label>
        <select v-model="fDevId">
          <option value="">Sin dev</option>
          <option v-for="p in personStore.people" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="field-group grow">
        <label>URL del PR</label>
        <input v-model="fUrl" type="text" placeholder="https://github.com/…" @keydown.enter="handleCreate">
      </div>
      <button class="btn-add" @click="handleCreate" :disabled="store.loading">Agregar</button>
    </div>

    <!-- Filtros -->
    <div class="creviews-filters">
      <button class="filter-chip" :class="{ active: devFilter === '' }" @click="devFilter = ''">Todos los devs</button>
      <button
        v-for="p in devs" :key="p.id"
        class="filter-chip" :class="{ active: devFilter === p.id }"
        @click="devFilter = devFilter === p.id ? '' : p.id"
      >{{ p.name }}</button>
      <span class="filter-sep"></span>
      <button
        v-for="s in STATUSES" :key="s"
        class="filter-chip" :class="{ active: statusFilter === s }"
        @click="statusFilter = statusFilter === s ? '' : s"
      >{{ STATUS_LABELS[s] }}</button>
      <span class="filter-sep"></span>
      <button class="filter-chip" :class="{ active: showApproved }" @click="showApproved = !showApproved">Ver aprobadas</button>
    </div>

    <!-- Tabla -->
    <div class="creviews-table-wrap">
      <table class="creviews-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Dev</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Notas</th>
            <th></th>
          </tr>
        </thead>
        <tbody v-if="initialLoading">
          <tr v-for="n in 4" :key="n" class="row-skeleton"><td colspan="6"><div class="skeleton-bar"></div></td></tr>
        </tbody>
        <tbody v-else>
          <tr v-for="r in filtered" :key="r.id" :class="{ approved: r.status === 'approved' }">
            <td class="cell-title">
              <a v-if="r.url" :href="r.url" target="_blank" rel="noopener" class="title-link">{{ r.title }} ↗</a>
              <span v-else>{{ r.title }}</span>
            </td>
            <td>
              <span class="dev-badge" :class="{ none: !r.dev_id }">{{ devName(r.dev_id) || '—' }}</span>
            </td>
            <td>
              <select
                class="status-select" :class="r.status"
                :value="r.status"
                @change="patch(r, { status: ($event.target as HTMLSelectElement).value as CodeReviewStatus })"
              >
                <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
              </select>
            </td>
            <td>
              <input
                class="date-input" :class="{ overdue: isOverdue(r), soon: isDueSoon(r) }"
                type="date"
                :value="r.due_date || ''"
                @change="patch(r, { due_date: ($event.target as HTMLInputElement).value || null })"
              >
            </td>
            <td class="cell-notes">
              <input
                class="notes-input"
                type="text"
                placeholder="—"
                :value="r.notes || ''"
                @change="patch(r, { notes: ($event.target as HTMLInputElement).value.trim() || null })"
              >
            </td>
            <td class="cell-actions">
              <button class="row-delete" title="Eliminar" @click="clickDelete(r.id)"><Trash2 :size="14" /></button>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="table-empty">Nada pendiente. ✓</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="toast-popup" :class="{ 'visible': toastVisible, 'success': toastType === 'success', 'error': toastType === 'error' }">
      {{ toastMsg }}
    </div>

    <Modal
      v-if="showDeleteModal"
      title="Confirmar Eliminación"
      message="Se eliminará el registro de la review de forma permanente."
      confirm-label="Eliminar"
      :destructive="true"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

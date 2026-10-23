<script setup>
// Panel unificado de tarea: reemplaza el modal de solo-lectura viejo de
// KanbanBoard y la necesidad de saltar a Cronograma/Issues/Decisiones/Bitácora
// para entender una tarea. Se abre igual desde el Tablero (Kanban) que desde
// el Cronograma — ver plan "Rediseño de IA de /intelligence".
import { computed, reactive, ref, watch } from 'vue'
import { X, Bug, Landmark, BookOpen, Save } from 'lucide-vue-next'
import { IntelligenceService } from '../../services/intelligence.service'
import {
  PLANNER_SEGMENTS,
  SECTION_MAX_ADJUSTMENTS,
  getSectionAdjustments,
  getSectionStatus
} from './cronograma/useTimelineMath'
import './kanban/pm-theme.css'

const props = defineProps({
  projectId: { type: String, required: true },
  task: { type: Object, required: true },
  issues: { type: Array, default: () => [] },
  decisions: { type: Array, default: () => [] },
  notes: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'task-updated'])

const localTask = ref({ ...props.task })
watch(() => props.task, (t) => { localTask.value = { ...t } })

const sourceIssue = computed(() => {
  const id = localTask.value.source_issue_id
  return id ? props.issues.find((i) => i.id === id) || null : null
})

const relatedDecisions = computed(() =>
  props.decisions.filter((d) => d.related_task_id === localTask.value.id)
)

const bitacoraMentions = computed(() => {
  const title = (localTask.value.moduleDescription || '').toLowerCase().trim()
  if (!title) return []
  return props.notes
    .filter((n) => n.raw_markdown.toLowerCase().includes(title))
    .map((n) => ({ date: n.date, note: n }))
})

// --- Edición de cronograma: draft por sección, se manda todo junto al guardar ---
const scheduleDraft = reactive({})

const buildDraft = () => {
  for (const segment of PLANNER_SEGMENTS) {
    const key = segment.section
    scheduleDraft[key] = {
      estado: getSectionStatus(localTask.value, key) || 'N',
      responsable: localTask.value.schedule?.[key]?.responsable || '',
      ajustes: getSectionAdjustments(localTask.value, key).map((a) => ({ ...a }))
    }
  }
}
buildDraft()
watch(localTask, buildDraft)

const isSaving = ref(false)
const saveError = ref('')

const saveSchedule = async () => {
  isSaving.value = true
  saveError.value = ''
  try {
    const updates = []
    const statuses = []
    const responsible = {}

    for (const segment of PLANNER_SEGMENTS) {
      const key = segment.section
      const draft = scheduleDraft[key]
      statuses.push({ section: key, value: draft.estado })
      if (draft.responsable) responsible[key] = draft.responsable
      draft.ajustes.forEach((a) => {
        if (a.inicio) updates.push({ section: key, adjustment: a.number, field: 'inicio', value: a.inicio })
        if (a.fin) updates.push({ section: key, adjustment: a.number, field: 'fin', value: a.fin })
      })
    }

    const res = await IntelligenceService.updateTaskSchedule(props.projectId, localTask.value.id, {
      updates,
      statuses,
      responsible
    })
    localTask.value = { ...localTask.value, schedule: res.data.schedule }
    emit('task-updated')
  } catch (err) {
    saveError.value = err?.response?.data?.error || err?.message || 'No se pudo guardar el cronograma.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="task-detail-overlay pm-view-root" role="dialog" aria-modal="true" @click="emit('close')">
    <div class="task-detail-panel" @click.stop>
      <div class="panel-header">
        <div>
          <span class="eyebrow">{{ localTask.kanban_column }}</span>
          <h2>{{ localTask.moduleDescription || 'Tarea sin título' }}</h2>
        </div>
        <button class="close-btn" type="button" @click="emit('close')" aria-label="Cerrar">
          <X :size="22" />
        </button>
      </div>

      <div class="panel-body">
        <section class="detail-section">
          <p class="task-description">{{ localTask.description || 'Sin descripción.' }}</p>
          <div class="meta-grid">
            <div class="meta-item"><span class="label">Cliente</span><span>{{ localTask.clientName || '-' }}</span></div>
            <div class="meta-item"><span class="label">Dev</span><span>{{ localTask.systemOwner || '-' }}</span></div>
            <div class="meta-item"><span class="label">PO</span><span>{{ localTask.implementer || '-' }}</span></div>
          </div>
        </section>

        <section v-if="sourceIssue" class="detail-section">
          <h3><Bug :size="15" /> Issue de origen</h3>
          <div class="linked-card">
            <span class="severity-badge" :class="sourceIssue.severity">{{ sourceIssue.severity }}</span>
            <span class="status-badge" :class="sourceIssue.status">{{ sourceIssue.status }}</span>
            <span>{{ sourceIssue.title }}</span>
          </div>
        </section>

        <section v-if="relatedDecisions.length" class="detail-section">
          <h3><Landmark :size="15" /> Decisiones relacionadas</h3>
          <div v-for="dec in relatedDecisions" :key="dec.id" class="linked-card">
            <span class="dec-status-badge" :class="dec.status">{{ dec.status }}</span>
            <span>{{ dec.title }}</span>
            <span v-if="dec.chosen" class="dec-chosen">→ {{ dec.chosen }}</span>
          </div>
        </section>

        <section v-if="bitacoraMentions.length" class="detail-section">
          <h3><BookOpen :size="15" /> Menciones en bitácora</h3>
          <div v-for="m in bitacoraMentions" :key="m.date" class="linked-card">
            <span class="note-date">{{ m.date }}</span>
          </div>
        </section>

        <section class="detail-section">
          <h3>Cronograma</h3>
          <div class="schedule-editor">
            <div v-for="segment in PLANNER_SEGMENTS" :key="segment.key" class="stage-block">
              <div class="stage-block-header">
                <strong>{{ segment.label }}</strong>
                <select v-model="scheduleDraft[segment.section].estado">
                  <option value="N">Pendiente</option>
                  <option value="S">Terminado</option>
                </select>
              </div>
              <label class="stage-field">
                <span class="label">Responsable</span>
                <input v-model.trim="scheduleDraft[segment.section].responsable" type="text" />
              </label>
              <div class="adjustments-grid">
                <div v-for="a in scheduleDraft[segment.section].ajustes.slice(0, SECTION_MAX_ADJUSTMENTS[segment.section])" :key="a.number" class="adjustment-row">
                  <span class="adj-number">#{{ a.number }}</span>
                  <input v-model="a.inicio" type="date" />
                  <input v-model="a.fin" type="date" />
                </div>
              </div>
            </div>
          </div>
          <p v-if="saveError" class="save-error">{{ saveError }}</p>
          <button class="save-btn" type="button" :disabled="isSaving" @click="saveSchedule">
            <Save :size="14" /> {{ isSaving ? 'Guardando...' : 'Guardar cronograma' }}
          </button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 17, 0.5);
}

.task-detail-panel {
  width: min(720px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 14px;
  background: var(--panel-bg);
  color: var(--text-main);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--border-color, #e5e5e5);
}

.panel-header h2 {
  margin: 4px 0 0;
}

.eyebrow {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, #6b6b6b);
}

.close-btn {
  border: 1px solid var(--border-color, #e5e5e5);
  background: transparent;
  color: var(--text-main);
  border-radius: 10px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}

.panel-body {
  display: grid;
  gap: 20px;
  padding: 22px;
}

.detail-section h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 0.85rem;
  color: var(--text-muted, #6b6b6b);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.task-description {
  margin: 0 0 12px;
  color: var(--text-muted, #6b6b6b);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.meta-item {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 10px;
}

.meta-item .label {
  font-size: 0.7rem;
  color: var(--text-muted, #6b6b6b);
  text-transform: uppercase;
}

.linked-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 10px;
  margin-bottom: 6px;
  font-size: 0.85rem;
}

.severity-badge, .status-badge, .dec-status-badge {
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #e5e5e5);
  text-transform: uppercase;
  font-weight: 700;
}

.dec-chosen {
  color: var(--accent-blue);
  font-weight: 600;
}

.schedule-editor {
  display: grid;
  gap: 12px;
}

.stage-block {
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 10px;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.stage-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stage-block-header select {
  background: var(--panel-bg);
  border: 1px solid var(--border-color, #e5e5e5);
  color: var(--text-main);
  border-radius: 8px;
  padding: 4px 8px;
}

.stage-field {
  display: grid;
  gap: 4px;
}

.stage-field .label {
  font-size: 0.7rem;
  color: var(--text-muted, #6b6b6b);
}

.stage-field input {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 8px;
  background: var(--bg-color, transparent);
  color: var(--text-main);
}

.adjustments-grid {
  display: grid;
  gap: 6px;
}

.adjustment-row {
  display: grid;
  grid-template-columns: 32px 1fr 1fr;
  gap: 6px;
  align-items: center;
}

.adjustment-row input {
  padding: 6px 8px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 8px;
  background: var(--bg-color, transparent);
  color: var(--text-main);
}

.adj-number {
  font-size: 0.75rem;
  color: var(--text-muted, #6b6b6b);
}

.save-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  background: var(--accent-blue);
  color: #fff;
  border: none;
  padding: 9px 16px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

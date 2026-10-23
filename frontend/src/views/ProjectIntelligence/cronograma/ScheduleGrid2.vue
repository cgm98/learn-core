<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  Clock,
} from 'lucide-vue-next'
import { RecycleScroller } from 'vue-virtual-scroller'
import { IntelligenceService } from '../../../services/intelligence.service'
import '../kanban/pm-theme.css'

// Subcomponentes y composables
import { useTimelineMath, getTaskKey, sameTaskKey, startOfDay, addDays, getTaskBounds, SECTION_LABELS, parseTaskDate } from './useTimelineMath'
import TimelineHeader from './TimelineHeader.vue'
import TimelineRow from './TimelineRow2.vue'
import AdjustmentPanel from './AdjustmentPanel.vue'

const TIMELINE_DAY_MIN_WIDTH = 46
const DEFAULT_ROW_HEIGHT = 64
const PLANNER_ROW_HEIGHT = 54
const COMPACT_ROW_HEIGHT = 48
const ADJUSTMENT_PANEL_WIDTH = 402
const ADJUSTMENT_PANEL_MAX_HEIGHT = 430
const ADJUSTMENT_PANEL_MIN_HEIGHT = 220
const ADJUSTMENT_PANEL_MARGIN = 12

const WINDOW_OPTIONS = [
  { value: 14, label: '14 días' },
  { value: 28, label: '28 días' },
  { value: 42, label: '42 días' },
]

const props = defineProps({
  projectId: { type: String, required: true },
  tasks: { type: Array, default: () => [] },
  users: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  lastSyncedAt: { type: String, default: '' },
  stageBars: { type: Boolean, default: false },
})

// Adapta el contrato taskService.updatePlannerSchedule(taskId, payload) de
// why/MIGRACION/kanban al endpoint real de LEARN (scopeado por proyecto, y con
// nombres de sección en vez de columnas de tabla) sin tocar los call sites de
// más abajo (handleSaveAllChanges, handleUpdateResponsible, etc).
const RESPONSIBLE_FIELD_TO_SECTION = {
  responsable_sistemas: 'sistemas',
  revisor_diseno: 'diseno',
  responsable_proyecto: 'proyecto',
}

const taskService = {
  async updatePlannerSchedule(taskId, payload) {
    const responsible = payload.responsible
      ? Object.fromEntries(
        Object.entries(payload.responsible).map(([field, value]) => [
          RESPONSIBLE_FIELD_TO_SECTION[field] || field,
          value,
        ]),
      )
      : undefined

    const res = await IntelligenceService.updateTaskSchedule(props.projectId, taskId, {
      updates: payload.updates,
      statuses: payload.statuses,
      responsible,
      kanban_column: payload.taskStatus,
    })
    return res.data
  },
}

const emit = defineEmits(['refresh', 'add', 'update-task', 'delete-task', 'load-more', 'select-task'])

// Click en el título/info de la fila: además del scroll-to que ya hacía
// focusTaskRange, abre el panel de detalle unificado (ver TaskDetailPanel.vue).
const handleFocusTask = (taskReference) => {
  focusTaskRange(taskReference)
  emit('select-task', taskReference)
}

const scrollerRef = ref(null)
const compactMode = ref(false)
const focusedTaskKey = ref('')
const adjustmentPanelRef = ref(null)
const baseDate = ref(startOfDay(new Date()))
const windowDays = ref(28)
const searchTerm = ref('')

const adjustmentPanel = ref({
  open: false,
  task: null,
  segment: null,
  x: 0,
  y: 0,
  maxHeight: ADJUSTMENT_PANEL_MAX_HEIGHT,
  color: 'var(--schedule-primary)',
})

const isSavingSchedule = ref(false)
const scheduleError = ref('')
const completionNotice = ref({ open: false, message: '' })
let completionNoticeTimer = null
let deferredPanelTimer = null

const stageBarsRef = computed(() => props.stageBars)

// Composables de cálculo de línea de tiempo
const {
  timelineRange,
  visibleWindowLabel,
  timelineDays,
  monthSegments,
  toEnhancedTask,
} = useTimelineMath(baseDate, windowDays, focusedTaskKey, stageBarsRef)

const rowSize = computed(() => {
  if (compactMode.value) return COMPACT_ROW_HEIGHT
  return props.stageBars ? PLANNER_ROW_HEIGHT : DEFAULT_ROW_HEIGHT
})

const containerStyle = computed(() => ({
  '--task-row-height': `${rowSize.value}px`,
  '--timeline-days-width': `${windowDays.value * TIMELINE_DAY_MIN_WIDTH}px`,
}))

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const query = computed(() => normalizeText(searchTerm.value))

const visibleTasks = computed(() => {
  const all = props.tasks ?? []
  if (!query.value) return all
  return all.filter((task) => {
    const searchable = [
      task.moduleDescription,
      task.systemOwner,
      task.implementer,
      task.moduleCode,
      task.clientName,
      task.status,
    ]
    return searchable.some((val) => normalizeText(val).includes(query.value))
  })
})

const tasksWithStyle = computed(() => {
  return visibleTasks.value.map((task) => toEnhancedTask(task))
})

const focusedTask = computed(() => {
  if (!focusedTaskKey.value) return null
  return tasksWithStyle.value.find((t) => t.taskKey === focusedTaskKey.value) || null
})

const scrollTaskRowIntoView = async (taskKey) => {
  const index = tasksWithStyle.value.findIndex((task) => sameTaskKey(task, taskKey))
  if (index < 0) return
  await nextTick()
  if (scrollerRef.value?.scrollToItem) scrollerRef.value.scrollToItem(index)
}

const closeAdjustmentPanel = () => {
  scheduleError.value = ''
  adjustmentPanel.value = {
    open: false,
    task: null,
    segment: null,
    x: 0,
    y: 0,
    maxHeight: ADJUSTMENT_PANEL_MAX_HEIGHT,
    color: 'var(--schedule-primary)',
  }
}

const openAdjustmentPanelAt = ({ task, segment, x, y, maxHeight }) => {
  scheduleError.value = ''
  adjustmentPanel.value = {
    open: true,
    task,
    segment,
    x,
    y,
    maxHeight,
    color: segment?.color || segment?.style?.backgroundColor || 'var(--schedule-primary)',
  }
}

const getSafePanelPosition = (event) => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720

  const rawX = Number(event?.clientX ?? ADJUSTMENT_PANEL_MARGIN) + ADJUSTMENT_PANEL_MARGIN
  const rawY = Number(event?.clientY ?? ADJUSTMENT_PANEL_MARGIN) + ADJUSTMENT_PANEL_MARGIN

  const maxX = Math.max(
    ADJUSTMENT_PANEL_MARGIN,
    viewportWidth - ADJUSTMENT_PANEL_WIDTH - ADJUSTMENT_PANEL_MARGIN,
  )
  const maxY = Math.max(
    ADJUSTMENT_PANEL_MARGIN,
    viewportHeight - ADJUSTMENT_PANEL_MAX_HEIGHT - ADJUSTMENT_PANEL_MARGIN,
  )

  const x = Math.max(ADJUSTMENT_PANEL_MARGIN, Math.min(rawX, maxX))
  const y = Math.max(ADJUSTMENT_PANEL_MARGIN, Math.min(rawY, maxY))
  const availableHeight = viewportHeight - y - ADJUSTMENT_PANEL_MARGIN
  const maxHeight = Math.min(
    ADJUSTMENT_PANEL_MAX_HEIGHT,
    Math.max(ADJUSTMENT_PANEL_MIN_HEIGHT, availableHeight),
  )

  return { x, y, maxHeight }
}

const openAdjustmentPanel = ({ event, task, segment }) => {
  event?.stopPropagation?.()
  const { x, y, maxHeight } = getSafePanelPosition(event)
  focusedTaskKey.value = getTaskKey(task)
  openAdjustmentPanelAt({
    task,
    segment,
    x,
    y,
    maxHeight,
  })
}

const openStageDetailPanel = ({ event, task, detail }) => {
  event?.stopPropagation?.()
  const section = detail?.key
  if (!task || !section) return

  const segment = task.segments?.find((item) => item.section === section || item.key === section) || {
    key: section,
    section,
    label: SECTION_LABELS[section] || detail?.stageLabel || section,
    color: detail?.color || 'var(--schedule-primary)',
    scheduleSection: task.schedule?.[section] || null,
  }

  openAdjustmentPanel({
    event,
    task,
    segment,
  })
}

const updateSchedule = async (payload, options = {}) => {
  const task = adjustmentPanel.value.task
  if (!task || isSavingSchedule.value) return null

  try {
    isSavingSchedule.value = true
    scheduleError.value = ''
    const updated = await taskService.updatePlannerSchedule(getTaskKey(task), payload)

    if (updated) {
      adjustmentPanel.value = {
        ...adjustmentPanel.value,
        task: updated,
      }
      emit('update-task', updated)
    }

    if (options.closePanel) closeAdjustmentPanel()
    return updated
  } catch (error) {
    console.error('Error actualizando cronograma:', error)
    scheduleError.value = error?.response?.data?.error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.message || 'No se pudo guardar el cambio.'
    return null
  } finally {
    isSavingSchedule.value = false
  }
}

const handleSaveAdjustment = ({ section, adjustment, value }) => {
  updateSchedule({
    updates: [
      { section, adjustment, field: 'inicio', value: value.inicio },
      { section, adjustment, field: 'fin', value: value.fin },
    ],
  })
}

const handleAssignNext = ({ section, adjustment, value }) => {
  updateSchedule({
    updates: [
      { section, adjustment, field: 'inicio', value: value.inicio },
      { section, adjustment, field: 'fin', value: value.fin },
    ],
  })
}

const handleUpdateResponsible = ({ section, value }) => {
  const fieldBySection = {
    sistemas: 'responsable_sistemas',
    diseno: 'revisor_diseno',
    proyecto: 'responsable_proyecto',
  }
  const field = fieldBySection[section]
  if (!field || !value) return

  updateSchedule({
    responsible: {
      [field]: value,
    },
  })
}

const handleAssignNextSection = ({ currentSection, nextSection, suggestedDate }) => {
  const position = {
    x: adjustmentPanel.value.x,
    y: adjustmentPanel.value.y,
    maxHeight: adjustmentPanel.value.maxHeight,
  }

  updateSchedule({
    updates: [
      { section: nextSection, adjustment: 1, field: 'inicio', value: suggestedDate },
    ],
    statuses: [
      { section: currentSection, value: 'S' },
    ],
  }).then(async (updated) => {
    if (!updated || !nextSection) return
    closeAdjustmentPanel()
    await nextTick()
    window.clearTimeout(deferredPanelTimer)
    deferredPanelTimer = window.setTimeout(() => {
      const enhancedTask = toEnhancedTask(updated)
      const nextSegment = enhancedTask.segments.find((segment) => segment.section === nextSection)
      if (!nextSegment) return
      focusedTaskKey.value = getTaskKey(enhancedTask)
      openAdjustmentPanelAt({
        task: enhancedTask,
        segment: nextSegment,
        x: position.x,
        y: position.y,
        maxHeight: position.maxHeight,
      })
    }, 170)
  })
}

const handleSaveAllChanges = async (payload) => {
  const taskKey = focusedTaskKey.value
  if (!taskKey || isSavingSchedule.value) return

  try {
    isSavingSchedule.value = true
    scheduleError.value = ''

    const isProyectoFinished = payload.statuses?.some(item => item.section === 'proyecto' && item.value === 'S')
    const generalStatus = isProyectoFinished ? 'S' : undefined
    const taskStatus = isProyectoFinished ? 'finalizado' : undefined

    const updated = await taskService.updatePlannerSchedule(taskKey, {
      usuario_de_modificacion: 'CMATAMOROS',
      updates: payload.updates,
      statuses: payload.statuses,
      responsible: payload.responsible,
      generalStatus,
      taskStatus,
    })

    if (updated) {
      emit('update-task', updated)
      closeAdjustmentPanel()

      completionNotice.value = {
        open: true,
        message: 'Cambios guardados con éxito',
      }
      window.clearTimeout(completionNoticeTimer)
      completionNoticeTimer = window.setTimeout(() => {
        completionNotice.value = { open: false, message: '' }
      }, 1700)
    }
  } catch (error) {
    console.error('Error al guardar todos los cambios:', error)
    scheduleError.value = error?.response?.data?.error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.message || 'No se pudo guardar los cambios.'
  } finally {
    isSavingSchedule.value = false
  }
}

const handleDocumentClick = (event) => {
  if (event.target?.closest?.('[data-schedule-task-row]')) return
  if (event.target?.closest?.('[data-schedule-adjustment-panel]')) return
  focusedTaskKey.value = ''
  if (!adjustmentPanel.value.open) return
  if (event.target?.closest?.('[data-schedule-adjustment-panel]')) return
  closeAdjustmentPanel()
}

const handleKeydown = (event) => {
  if (event.key === 'Escape') closeAdjustmentPanel()
}

const focusTaskRange = async (taskReference) => {
  const taskKey = typeof taskReference === 'object' ? getTaskKey(taskReference) : String(taskReference)
  const task = tasksWithStyle.value.find((t) => t.taskKey === taskKey)
  if (!task) return

  let targetDate = null
  if (props.stageBars) {
    const sections = ['sistemas', 'diseno', 'proyecto']
    for (const key of sections) {
      const sec = task.schedule?.[key]
      if (sec?.ajustes) {
        const firstStart = sec.ajustes.find(a => a.inicio)?.inicio
        if (firstStart) {
          const parsed = parseTaskDate(firstStart)
          if (parsed) {
            targetDate = parsed
            break
          }
        }
      }
    }
  } else {
    const bounds = getTaskBounds(task)
    if (bounds?.start) {
      targetDate = bounds.start
    }
  }

  if (targetDate) {
    baseDate.value = startOfDay(targetDate)
  }

  focusedTaskKey.value = taskKey
  closeAdjustmentPanel()
  await scrollTaskRowIntoView(taskKey)
}

const handleNavigate = (days) => {
  closeAdjustmentPanel()
  baseDate.value = addDays(baseDate.value, days)
}

const goToToday = () => {
  closeAdjustmentPanel()
  baseDate.value = startOfDay(new Date())
  focusedTaskKey.value = ''
}

const refreshTasks = () => {
  closeAdjustmentPanel()
  emit('refresh')
}

const handleScroll = (event) => {
  closeAdjustmentPanel()
  const target = event.target
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 400) {
    emit('load-more')
  }
}

const handleExternalFocusTask = (event) => {
  const detail = event.detail ?? {}
  focusTaskRange(detail.task ?? detail.taskId ?? detail.id)
}

onMounted(() => {
  window.addEventListener('focus-schedule-task', handleExternalFocusTask)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', closeAdjustmentPanel)
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  window.clearTimeout(completionNoticeTimer)
  window.clearTimeout(deferredPanelTimer)
  window.removeEventListener('focus-schedule-task', handleExternalFocusTask)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', closeAdjustmentPanel)
  document.removeEventListener('click', handleDocumentClick)
})

defineExpose({ focusTaskRange, focusedTask })
</script>

<template>
  <div class="pm-view-root" :class="$style.container" :style="containerStyle">
    <div :class="$style.timelineShell">
      <div ref="timelineRef" :class="$style.timelineSurface">

        <TimelineHeader
          v-model:searchTerm="searchTerm"
          v-model:windowDays="windowDays"
          :stageBars="props.stageBars"
          :isLoading="props.isLoading"
          :visibleWindowLabel="visibleWindowLabel"
          :focusedTask="focusedTask"
          :monthSegments="monthSegments"
          :timelineDays="timelineDays"
          :timelineRange="timelineRange"
          :windowOptions="WINDOW_OPTIONS"
          @navigate="handleNavigate"
          @today="goToToday"
          @refresh="refreshTasks"
        />

        <div ref="timelineBodyRef" :class="$style.timelineBody">
          <div v-if="props.isLoading" :class="$style.loading">
            <Clock :size="32" :class="$style.spin" />
            <span>Cargando cronograma...</span>
          </div>

          <div v-if="!props.isLoading && !tasksWithStyle.length" :class="$style.emptyState">
            <AlertTriangle :size="28" />
            <strong>No hay actividades visibles</strong>
            <span>Ajusta los filtros para ver resultados.</span>
          </div>

          <RecycleScroller v-else-if="tasksWithStyle.length" ref="scrollerRef" :items="tasksWithStyle" :item-size="rowSize" key-field="taskKey"
            :class="$style.scroller" @scroll.passive="handleScroll" v-slot="{ item: task }">

            <TimelineRow
              :task="task"
              :stageBars="props.stageBars"
              :timelineDays="timelineDays"
              @focusTask="handleFocusTask"
              @clickSegment="openAdjustmentPanel"
              @clickStageDetail="openStageDetailPanel"
            />

          </RecycleScroller>
        </div>

        <Transition name="schedule-adjustments">
          <AdjustmentPanel
            v-if="adjustmentPanel.open"
            ref="adjustmentPanelRef"
            :task="adjustmentPanel.task"
            :segment="adjustmentPanel.segment"
            :x="adjustmentPanel.x"
            :y="adjustmentPanel.y"
            :maxHeight="adjustmentPanel.maxHeight"
            :color="adjustmentPanel.color"
            :users="props.users"
            :isSavingSchedule="isSavingSchedule"
            :error-message="scheduleError"
            @close="closeAdjustmentPanel"
            @saveAll="handleSaveAllChanges"
          />
        </Transition>

        <Transition name="schedule-completion">
          <div v-if="completionNotice.open" :class="$style.completionNotice" role="status" aria-live="polite">
            <span :class="$style.completionIcon">✓</span>
            <strong>{{ completionNotice.message }}</strong>
          </div>
        </Transition>

      </div>
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;

  --schedule-surface: var(--panel-bg);
  --schedule-surface-alt: color-mix(in srgb, var(--panel-bg) 88%, var(--bg-color));
  --schedule-border: var(--border-color);
  --schedule-text: var(--text-main);
  --schedule-muted: var(--text-muted);
  --schedule-soft-text: color-mix(in srgb, var(--text-muted) 75%, var(--text-main));
  --schedule-primary: var(--accent-blue);
  --schedule-stage-orange: #ff7a1a;
  --schedule-stage-blue: #4246d7;
  --schedule-stage-green: #24ad4f;
  --schedule-stage-bar-gap: 4px;
  --schedule-stage-transition-gap: 3px;
  --schedule-stage-single-day-width: 23px;
}

.timelineShell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.timelineSurface {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.timelineBody {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.scroller {
  height: 100%;
  overflow-y: auto;
}

.emptyState {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--schedule-muted);
}

.loading {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--schedule-primary);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

:global(.schedule-adjustments-enter-active),
:global(.schedule-adjustments-leave-active) {
  transition: opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1), transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.schedule-adjustments-enter-from),
:global(.schedule-adjustments-leave-to) {
  opacity: 0;
  transform: translateY(8px) scale(0.975);
}

.completionNotice {
  position: fixed;
  left: 50%;
  top: 22%;
  z-index: 10000;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, var(--schedule-stage-green) 34%, var(--schedule-border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--schedule-surface) 93%, var(--schedule-stage-green));
  color: var(--schedule-text);
  box-shadow:
    0 22px 54px rgba(15, 23, 42, 0.18),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  transform: translateX(-50%);
}

.completionIcon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--schedule-stage-green);
  color: #fff;
  font-size: 14px;
  font-weight: 900;
}

.completionNotice strong {
  font-size: 14px;
  font-weight: 900;
}

:global(.schedule-completion-enter-active),
:global(.schedule-completion-leave-active) {
  transition: opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.schedule-completion-enter-from),
:global(.schedule-completion-leave-to) {
  opacity: 0;
  transform: translate(-50%, 12px) scale(0.96);
}
</style>

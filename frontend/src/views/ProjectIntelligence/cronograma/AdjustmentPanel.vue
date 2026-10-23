<script setup>
import { computed, ref, watch } from 'vue'
import {
  getStartedSectionAdjustments,
  getSectionAdjustments,
  isSectionFinished,
  getStartedAdjustmentCount,
  parseTaskDate,
  toInputDate,
  getNextSuggestedDateForTask,
  getSegmentStartForPanel,
  getSegmentDurationForPanel,
  formatFullDate,
  formatShortDate,
  addDays,
  SECTION_LABELS,
  NEXT_SECTION,
  getSectionStatus,
} from './useTimelineMath'

const props = defineProps({
  task: { type: Object, required: true },
  segment: { type: Object, required: true },
  users: { type: Array, default: () => [] },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  maxHeight: { type: Number, required: true },
  color: { type: String, required: true },
  isSavingSchedule: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const emit = defineEmits([
  'close',
  'saveAll',
])

const adjustmentDrafts = ref({})
const nextAdjustmentDraft = ref({ inicio: '', fin: '' })
const responsibleQuery = ref('')
const selectedResponsible = ref('')
const isResponsiblePickerOpen = ref(false)
const showAllResponsibleOptions = ref(false)
const ADJUSTMENT_LABELS = ['Primera', 'Segunda', 'Tercera', 'Cuarta']

const responsibleDraft = ref('')
const statusDraft = ref('N')

const getCurrentSectionKey = () =>
  props.segment?.section || props.segment?.key || ''

const syncAdjustmentDrafts = () => {
  const sectionKey = getCurrentSectionKey()
  const drafts = {}

  getStartedSectionAdjustments(props.task, sectionKey).forEach((item) => {
    drafts[`${sectionKey}-${item.number}`] = {
      inicio: toInputDate(parseTaskDate(item.inicio)),
      fin: toInputDate(parseTaskDate(item.fin)),
    }
  })

  getSectionAdjustments(props.task, sectionKey).forEach((item) => {
    const key = `${sectionKey}-${item.number}`
    if (!drafts[key]) {
      drafts[key] = {
        inicio: toInputDate(parseTaskDate(item.inicio)) || '',
        fin: toInputDate(parseTaskDate(item.fin)) || '',
      }
    }
  })

  adjustmentDrafts.value = drafts
  
  const suggestedStart = getNextSuggestedDateForTask(props.task, sectionKey)
  nextAdjustmentDraft.value = {
    inicio: suggestedStart,
    fin: suggestedStart,
  }

  let initialName = ''
  let initialCode = ''
  if (sectionKey === 'sistemas') {
    initialName = props.task?.systemOwner || ''
    initialCode = props.task?.systemOwnerCode || ''
  } else if (sectionKey === 'diseno') {
    initialName = props.task?.implementer || ''
    initialCode = props.task?.designReviewerCode || props.task?.implementerCode || ''
  } else if (sectionKey === 'proyecto') {
    initialName = props.task?.projectOwner || ''
    initialCode = props.task?.projectOwnerCode || ''
  }
  
  responsibleDraft.value = initialCode
  responsibleQuery.value = initialName
  selectedResponsible.value = initialName

  const currentStatus = props.task?.schedule?.[sectionKey]?.estado || 'N'
  statusDraft.value = currentStatus === 'S' ? 'S' : 'N'
}

watch(
  () => [props.task, props.segment],
  () => {
    syncAdjustmentDrafts()
  },
  { immediate: true }
)

const currentSectionFinished = computed(() => {
  const sectionKey = getCurrentSectionKey()
  return Boolean(props.task && sectionKey && isSectionFinished(props.task, sectionKey))
})

const getAdjustmentDraft = (item) =>
  adjustmentDrafts.value[item.key] || {
    inicio: toInputDate(parseTaskDate(item.inicio)),
    fin: toInputDate(parseTaskDate(item.fin)),
  }

const setAdjustmentDraftValue = (item, field, value) => {
  adjustmentDrafts.value = {
    ...adjustmentDrafts.value,
    [item.key]: {
      ...getAdjustmentDraft(item),
      [field]: value,
    },
  }
}

const hasValidRange = (draft) => {
  const start = parseTaskDate(draft?.inicio)
  const end = parseTaskDate(draft?.fin)
  return Boolean(start && end && end.getTime() >= start.getTime())
}

const adjustmentItems = computed(() => {
  const sectionKey = getCurrentSectionKey()
  if (!props.task || !sectionKey) return []

  return getStartedSectionAdjustments(props.task, sectionKey).map((item) => {
    const key = `${sectionKey}-${item.number}`
    const draft = adjustmentDrafts.value[key] || {
      inicio: toInputDate(parseTaskDate(item.inicio)),
      fin: toInputDate(parseTaskDate(item.fin)),
    }

    return {
      key,
      number: item.number,
      title: `Ajuste ${item.number}`,
      inicio: item.inicio,
      fin: item.fin,
      draft,
      isStarted: Boolean(item.inicio),
      isFinished: Boolean(item.fin),
      canSave: Boolean(!currentSectionFinished.value && hasValidRange(draft)),
      canFinish: Boolean(item.inicio && !item.fin && !currentSectionFinished.value && hasValidRange(draft)),
    }
  })
})

const startedAdjustmentCount = computed(() => adjustmentItems.value.length)

const usedAdjustmentLabel = computed(() => {
  const count = startedAdjustmentCount.value
  if (!count) return 'sin fechas asignadas'
  return count === 1 ? '1 ajuste usado' : `${count} ajustes usados`
})

const nextSectionKey = computed(() => NEXT_SECTION[getCurrentSectionKey()] || null)
const nextSectionLabel = computed(() => SECTION_LABELS[nextSectionKey.value] || '')
const currentSectionLabel = computed(() => SECTION_LABELS[getCurrentSectionKey()] || 'bloque')

const currentResponsibleLabel = computed(() => {
  const sectionKey = getCurrentSectionKey()
  if (sectionKey === 'sistemas') return props.task?.systemOwner || props.task?.systemOwnerCode || '-'
  if (sectionKey === 'diseno') return props.task?.designReviewerCode || props.task?.designReviewer || props.task?.implementerCode || props.task?.implementer || '-'
  if (sectionKey === 'proyecto') return props.task?.projectOwnerCode || props.task?.projectOwner || props.task?.createdByCode || props.task?.createdBy || '-'
  return '-'
})

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const userOptions = computed(() => {
  const values = props.users.map((user) => {
    if (typeof user === 'string') return user
    return user?.nombre || user?.name || user?.code || user?.id || ''
  })

  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
})

const filteredResponsibleOptions = computed(() => {
  const query = normalizeText(responsibleQuery.value)
  const options = userOptions.value
  if (showAllResponsibleOptions.value || !query) return options
  return options
    .filter((value) => normalizeText(value).includes(query))
})

const syncResponsibleQuery = () => {
  const value = currentResponsibleLabel.value === '-' ? '' : currentResponsibleLabel.value
  responsibleQuery.value = value
  selectedResponsible.value = value
  isResponsiblePickerOpen.value = false
  showAllResponsibleOptions.value = false
}

watch(
  currentResponsibleLabel,
  () => {
    syncResponsibleQuery()
  },
  { immediate: true }
)

const currentStatusLabel = computed(() =>
  statusDraft.value === 'S' ? 'Terminado' : 'Pendiente',
)

const handleStatusChange = (value) => {
  statusDraft.value = value
}

const reviewRows = computed(() => {
  const sectionKey = getCurrentSectionKey()
  if (!props.task || !sectionKey) return []

  const startedByNumber = new Map(adjustmentItems.value.map((item) => [item.number, item]))

  return getSectionAdjustments(props.task, sectionKey).map((item) => {
    const startedItem = startedByNumber.get(item.number)
    const key = `${sectionKey}-${item.number}`
    const draft = adjustmentDrafts.value[key] || { inicio: '', fin: '' }

    return {
      key,
      number: item.number,
      label: ADJUSTMENT_LABELS[item.number - 1] || `Ajuste ${item.number}`,
      draft,
      isStarted: Boolean(startedItem),
      isFinished: Boolean(startedItem?.isFinished),
    }
  })
})

const selectedSegmentRangeLabel = computed(() => {
  if (!props.task || !props.segment) return ''

  const sectionKey = getCurrentSectionKey()
  const adjustment = props.segment.adjustmentNumber
    ? getSectionAdjustments(props.task, sectionKey).find((item) => item.number === props.segment.adjustmentNumber)
    : null
  const start = parseTaskDate(adjustment?.inicio) || getSegmentStartForPanel(props.segment, props.task)
  if (!start) return 'Sin fecha'

  const end = parseTaskDate(adjustment?.fin) || addDays(start, getSegmentDurationForPanel(props.segment) - 1)

  if (start.getTime() === end.getTime()) return formatFullDate(start)

  return `${formatShortDate(start)} - ${formatFullDate(end)}`
})

const setReviewRowDraftValue = (row, field, value) => {
  setAdjustmentDraftValue(row, field, value)
}

const selectResponsible = (value) => {
  const selected = String(value || '').trim()
  if (!selected) {
    isResponsiblePickerOpen.value = false
    return
  }

  responsibleQuery.value = selected
  selectedResponsible.value = selected

  const matchedUser = props.users.find(u => u.nombre === selected || u.codigo === selected)
  responsibleDraft.value = matchedUser ? matchedUser.codigo : selected

  isResponsiblePickerOpen.value = false
  showAllResponsibleOptions.value = false
}

const toggleResponsibleList = () => {
  if (props.isSavingSchedule) return
  showAllResponsibleOptions.value = true
  isResponsiblePickerOpen.value = !isResponsiblePickerOpen.value
}

const handleResponsibleInput = (value) => {
  responsibleQuery.value = value
  selectedResponsible.value = ''
  showAllResponsibleOptions.value = false
  isResponsiblePickerOpen.value = true
}

const handleSaveAll = () => {
  const sectionKey = getCurrentSectionKey()
  const updates = []

  getSectionAdjustments(props.task, sectionKey).forEach((item) => {
    const key = `${sectionKey}-${item.number}`
    const draft = adjustmentDrafts.value[key]
    if (draft && draft.inicio && draft.fin) {
      updates.push({ section: sectionKey, adjustment: item.number, field: 'inicio', value: draft.inicio })
      updates.push({ section: sectionKey, adjustment: item.number, field: 'fin', value: draft.fin })
    }
  })

  const fieldBySection = {
    sistemas: 'responsable_sistemas',
    diseno: 'revisor_diseno',
    proyecto: 'responsable_proyecto',
  }
  const respField = fieldBySection[sectionKey]

  emit('saveAll', {
    responsible: respField && responsibleDraft.value ? { [respField]: responsibleDraft.value } : null,
    statuses: [
      { section: sectionKey, value: statusDraft.value }
    ],
    updates,
  })
}
</script>

<template>
  <div data-schedule-adjustment-panel :class="$style.adjustmentPanel" :style="{
    top: `${props.y}px`,
    left: `${props.x}px`,
    maxHeight: `${props.maxHeight}px`,
    '--adjustment-color': props.color,
  }" @click.stop>
    <div :class="$style.adjustmentHeader">
      <div :class="$style.adjustmentHeaderText">
        <span :class="$style.adjustmentEyebrow">{{ currentSectionLabel }}</span>
        <strong>{{ props.task.moduleDescription || 'Actividad' }}</strong>
        <div :class="$style.responsibleEditor">
          <div :class="$style.responsiblePicker">
            <div :class="$style.responsibleControl">
              <input
                :value="responsibleQuery"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :disabled="props.isSavingSchedule"
                :placeholder="`Buscar encargado de ${currentSectionLabel}`"
                @focus="isResponsiblePickerOpen = true"
                @input="handleResponsibleInput($event.target.value)"
                @keydown.enter.prevent="selectResponsible(filteredResponsibleOptions[0] || responsibleQuery)"
              />
              <button
                type="button"
                :class="$style.responsibleToggle"
                :disabled="props.isSavingSchedule"
                aria-label="Mostrar encargados"
                @click="toggleResponsibleList"
              >
                ▼
              </button>
            </div>
            <div v-if="isResponsiblePickerOpen" :class="$style.responsibleList">
              <button
                v-for="option in filteredResponsibleOptions"
                :key="option"
                type="button"
                :class="[
                  $style.responsibleOption,
                  option === selectedResponsible && $style.responsibleOptionSelected,
                ]"
                @click="selectResponsible(option)"
              >
                {{ option }}
              </button>
              <span v-if="!filteredResponsibleOptions.length" :class="$style.responsibleEmpty">
                Sin coincidencias
              </span>
            </div>
          </div>
        </div>
        <small>
          {{ selectedSegmentRangeLabel }}
          ·
          {{ usedAdjustmentLabel }}
        </small>
      </div>

      <button type="button" :class="$style.adjustmentClose" @click="emit('close')">
        ×
      </button>
    </div>

    <div :class="$style.adjustmentBody">
      <p v-if="props.errorMessage" :class="$style.panelError">{{ props.errorMessage }}</p>

      <div :class="$style.modalSummary">
        <span>{{ selectedSegmentRangeLabel }}</span>
        <strong>{{ usedAdjustmentLabel }}</strong>
      </div>

      <div :class="$style.reviewTable">
        <div :class="[$style.reviewRow, $style.reviewHead]">
          <span>Revision</span>
          <span>F. inicial</span>
          <span>F. final</span>
        </div>

        <div v-for="row in reviewRows" :key="row.key" :class="[
          $style.reviewRow,
          row.isFinished && $style.reviewRowDone,
        ]">
          <strong :class="$style.reviewLabel">{{ row.label }}</strong>

          <input type="date" :value="row.draft.inicio"
            :disabled="props.isSavingSchedule"
            @input="setReviewRowDraftValue(row, 'inicio', $event.target.value)" />

          <input type="date" :value="row.draft.fin"
            :disabled="props.isSavingSchedule"
            @input="setReviewRowDraftValue(row, 'fin', $event.target.value)" />
        </div>

        <div :class="[$style.reviewRow, $style.reviewStatusRow]">
          <span>Estado</span>
          <select 
            :value="statusDraft"
            :disabled="props.isSavingSchedule"
            @change="handleStatusChange($event.target.value)"
          >
            <option value="N">Pendiente</option>
            <option value="S">Terminado</option>
          </select>
          <span></span>
        </div>
      </div>

      <div :class="$style.adjustmentActions">
        <button type="button" :class="$style.adjustmentSaveAllBtn"
          :disabled="props.isSavingSchedule" @click="handleSaveAll">
          {{ props.isSavingSchedule ? 'Grabando...' : 'Grabar cambios' }}
        </button>

        <button type="button" :class="$style.adjustmentExitBtn" @click="emit('close')">
          Salir
        </button>
      </div>
    </div>
  </div>
</template>

<style module>
.adjustmentPanel {
  position: fixed;
  z-index: 9999;
  width: min(430px, calc(100vw - 24px));
  max-height: min(430px, calc(100vh - 24px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 42%, var(--schedule-border));
  border-radius: 14px;
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--adjustment-color) 11%, var(--schedule-surface)) 0%,
      color-mix(in srgb, var(--schedule-surface) 96%, var(--adjustment-color)) 100%);
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.18),
    0 0 0 1px color-mix(in srgb, var(--adjustment-color) 10%, transparent);
  color: var(--schedule-text);
}

.adjustmentPanel::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--adjustment-color);
  pointer-events: none;
}

.adjustmentHeader {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: start;
  gap: 10px;
  padding: 11px 12px 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--adjustment-color) 20%, var(--schedule-border));
}

.adjustmentHeaderIcon {
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--adjustment-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--adjustment-color) 13%, transparent);
}

.adjustmentHeaderText {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.adjustmentEyebrow {
  color: color-mix(in srgb, var(--adjustment-color) 86%, var(--schedule-text));
  font-size: 10px;
  line-height: 1;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.adjustmentHeaderText strong {
  color: var(--schedule-text);
  font-size: 13px;
  line-height: 1.15;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adjustmentHeaderText small {
  color: var(--schedule-muted);
  font-size: 10px;
  line-height: 1.2;
  font-weight: 700;
}

.responsibleEditor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 7px;
  width: min(330px, 100%);
  margin-top: 1px;
}

.responsiblePicker {
  position: relative;
  min-width: 0;
}

.responsibleControl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 25px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 28%, var(--schedule-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--schedule-surface) 86%, var(--adjustment-color));
}

.responsibleControl:focus-within {
  border-color: color-mix(in srgb, var(--adjustment-color) 70%, var(--schedule-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--adjustment-color) 14%, transparent);
}

.responsiblePicker input {
  width: 100%;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--schedule-surface) 86%, var(--adjustment-color));
  color: color-mix(in srgb, var(--adjustment-color) 86%, var(--schedule-text));
  font-size: 11px;
  line-height: 1;
  font-weight: 850;
  outline: none;
  text-transform: uppercase;
}

.responsiblePicker input:focus {
  box-shadow: none;
}

.responsibleToggle {
  width: 25px;
  height: 24px;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--adjustment-color) 24%, var(--schedule-border));
  background: color-mix(in srgb, var(--adjustment-color) 11%, var(--schedule-surface));
  color: color-mix(in srgb, var(--adjustment-color) 86%, var(--schedule-text));
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.responsibleToggle:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.responsibleUpdateBtn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 42%, var(--schedule-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--adjustment-color) 16%, var(--schedule-surface));
  color: color-mix(in srgb, var(--adjustment-color) 88%, var(--schedule-text));
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;
}

.responsibleUpdateBtn:not(:disabled):hover {
  background: color-mix(in srgb, var(--adjustment-color) 26%, var(--schedule-surface));
}

.responsibleUpdateBtn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.responsibleList {
  position: absolute;
  z-index: 2;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 154px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 30%, var(--schedule-border));
  border-radius: 9px;
  background: var(--schedule-surface);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
}

.responsibleOption {
  width: 100%;
  min-height: 26px;
  padding: 5px 8px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--adjustment-color) 10%, var(--schedule-border));
  background: transparent;
  color: var(--schedule-text);
  font-size: 11px;
  font-weight: 750;
  text-align: left;
  cursor: pointer;
}

.responsibleOption:hover {
  background: color-mix(in srgb, var(--adjustment-color) 10%, var(--schedule-surface));
  color: color-mix(in srgb, var(--adjustment-color) 82%, var(--schedule-text));
}

.responsibleOptionSelected {
  background: color-mix(in srgb, var(--adjustment-color) 14%, var(--schedule-surface));
  color: color-mix(in srgb, var(--adjustment-color) 84%, var(--schedule-text));
}

.responsibleEmpty {
  display: block;
  padding: 8px;
  color: var(--schedule-muted);
  font-size: 11px;
  font-weight: 700;
}

.adjustmentClose {
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 24%, var(--schedule-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--schedule-surface) 90%, var(--adjustment-color));
  color: color-mix(in srgb, var(--adjustment-color) 82%, var(--schedule-text));
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.adjustmentClose:hover {
  background: color-mix(in srgb, var(--adjustment-color) 13%, var(--schedule-surface));
}

.adjustmentBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 9px 14px 12px 16px;
}

.panelError {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, #dc2626 28%, var(--schedule-border));
  border-radius: 8px;
  background: color-mix(in srgb, #dc2626 9%, var(--schedule-surface));
  color: #b91c1c;
  font-size: 0.76rem;
  font-weight: 700;
}

.modalSummary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--schedule-muted);
  font-size: 10px;
  line-height: 1.1;
  font-weight: 800;
}

.modalSummary strong {
  color: color-mix(in srgb, var(--adjustment-color) 84%, var(--schedule-text));
  white-space: nowrap;
}

.reviewTable {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 28%, var(--schedule-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--schedule-surface) 92%, var(--adjustment-color));
}

.reviewRow {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 1.2fr) minmax(0, 1.2fr);
  align-items: center;
  gap: 0;
  min-height: 32px;
  border-bottom: 1px solid color-mix(in srgb, var(--adjustment-color) 18%, var(--schedule-border));
}

.reviewRow:last-child {
  border-bottom: 0;
}

.reviewHead {
  min-height: 26px;
  background: color-mix(in srgb, var(--adjustment-color) 12%, var(--schedule-surface));
  color: color-mix(in srgb, var(--adjustment-color) 80%, var(--schedule-text));
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.reviewRow > span,
.reviewRow > strong,
.reviewRow > input,
.reviewRow > button {
  min-width: 0;
  height: 100%;
  border-right: 1px solid color-mix(in srgb, var(--adjustment-color) 16%, var(--schedule-border));
}

.reviewRow > :last-child {
  border-right: 0;
}

.reviewRow > span,
.reviewLabel,
.reviewStatusRow strong {
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.reviewLabel {
  color: var(--schedule-text);
  font-size: 11px;
  font-weight: 900;
}

.reviewRow input {
  width: 100%;
  padding: 0 6px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--adjustment-color) 16%, var(--schedule-border));
  border-radius: 0;
  background: color-mix(in srgb, var(--schedule-surface) 96%, var(--adjustment-color));
  color: var(--schedule-text);
  font-size: 10px;
  font-weight: 800;
  outline: none;
}

.reviewRow input:focus {
  background: #fff;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--adjustment-color) 42%, transparent);
}

.reviewRow input:disabled {
  background: color-mix(in srgb, var(--schedule-surface-alt) 88%, var(--schedule-surface));
  color: var(--schedule-muted);
}

.reviewRowNext {
  background: color-mix(in srgb, var(--adjustment-color) 8%, transparent);
}

.reviewRowDone .reviewLabel {
  color: color-mix(in srgb, var(--adjustment-color) 78%, var(--schedule-text));
}

.reviewSaveBtn {
  border: 0;
  background: color-mix(in srgb, var(--adjustment-color) 88%, var(--schedule-text));
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  cursor: pointer;
  transition: background 0.18s cubic-bezier(0.22, 1, 0.36, 1), transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.reviewSaveBtn:hover {
  transform: translateY(-1px);
  background: var(--adjustment-color);
}

.reviewSaveBtn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.reviewStateDot {
  justify-content: center;
}

.reviewStateDot::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--schedule-muted) 38%, transparent);
}

.reviewStatusRow {
  min-height: 30px;
  background: color-mix(in srgb, var(--schedule-surface) 95%, var(--adjustment-color));
  color: var(--schedule-muted);
  font-size: 11px;
  font-weight: 900;
}

.reviewStatusRow select {
  grid-column: span 2;
  width: 100%;
  height: 100%;
  padding: 0 8px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--adjustment-color) 16%, var(--schedule-border));
  background: color-mix(in srgb, var(--schedule-surface) 96%, var(--adjustment-color));
  color: var(--schedule-text);
  font-size: 11px;
  font-weight: 800;
  outline: none;
  cursor: pointer;
}

.reviewStatusRow select:focus {
  background: #fff;
}

.adjustmentList {
  display: grid;
  gap: 8px;
  padding-right: 2px;
}

.adjustmentItem {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 22%, var(--schedule-border));
  border-radius: 13px;
  background: color-mix(in srgb, var(--schedule-surface) 83%, var(--adjustment-color));
}

.adjustmentItemActive {
  border-color: color-mix(in srgb, var(--adjustment-color) 46%, var(--schedule-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--adjustment-color) 12%, transparent);
}

.adjustmentItemDone {
  background: color-mix(in srgb, var(--schedule-surface) 72%, var(--adjustment-color));
  opacity: 0.92;
}

.adjustmentEmpty {
  padding: 10px 11px;
  border: 1px dashed color-mix(in srgb, var(--adjustment-color) 34%, var(--schedule-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--adjustment-color) 6%, transparent);
  color: var(--schedule-muted);
  font-size: 12px;
  font-weight: 800;
}

.adjustmentBadge {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--adjustment-color);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--adjustment-color) 24%, transparent);
}

.adjustmentItemText {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.adjustmentItemText strong {
  color: color-mix(in srgb, var(--adjustment-color) 78%, var(--schedule-text));
  font-size: 11px;
  line-height: 1.1;
  font-weight: 900;
}

.adjustmentDateGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 4px;
}

.adjustmentRangeRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  min-width: 0;
}

.adjustmentDateGrid label {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.adjustmentDateGrid label span {
  color: var(--schedule-muted);
  font-size: 8.5px;
  font-weight: 900;
  line-height: 1;
  text-transform: uppercase;
}

.adjustmentDateGrid input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 28%, var(--schedule-border));
  border-radius: 8px;
  background: var(--schedule-surface);
  color: var(--schedule-text);
  font-size: 10px;
  font-weight: 800;
  outline: none;
}

.adjustmentDateGrid input:focus {
  border-color: color-mix(in srgb, var(--adjustment-color) 68%, var(--schedule-border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--adjustment-color) 14%, transparent);
}

.nextAdjustmentBox {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 9px;
  border: 1px dashed color-mix(in srgb, var(--adjustment-color) 34%, var(--schedule-border));
  border-radius: 13px;
  background: color-mix(in srgb, var(--adjustment-color) 7%, transparent);
}

.nextAdjustmentBox strong {
  color: color-mix(in srgb, var(--adjustment-color) 82%, var(--schedule-text));
  font-size: 11px;
  font-weight: 900;
}

.adjustmentActionBtn,
.adjustmentSecondaryBtn,
.adjustmentPrimaryBtn,
.adjustmentExitBtn {
  border: 0;
  border-radius: 9px;
  font-size: 10.5px;
  font-weight: 900;
  line-height: 1.1;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.adjustmentActionBtn:hover,
.adjustmentSecondaryBtn:hover,
.adjustmentPrimaryBtn:hover,
.adjustmentExitBtn:hover {
  transform: translateY(-1px);
}

.adjustmentActionBtn:disabled,
.adjustmentSecondaryBtn:disabled,
.adjustmentPrimaryBtn:disabled,
.adjustmentExitBtn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
  transform: none;
}

.adjustmentActionBtn {
  align-self: center;
  min-height: 26px;
  padding: 0 8px;
  background: transparent;
  color: color-mix(in srgb, var(--adjustment-color) 92%, var(--schedule-text));
  font-size: 10.8px;
  white-space: nowrap;
}

.adjustmentActionBtn:hover {
  background: color-mix(in srgb, var(--adjustment-color) 10%, transparent);
}

.adjustmentActions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.adjustmentPrimaryBtn {
  flex: 1 1 220px;
  min-height: 33px;
  padding: 8px 10px;
}

.adjustmentSecondaryBtn {
  align-self: end;
  min-width: 104px;
  min-height: 28px;
  padding: 6px 10px;
  border: 2px solid color-mix(in srgb, var(--adjustment-color) 84%, var(--schedule-border));
  background: color-mix(in srgb, var(--schedule-surface) 94%, var(--adjustment-color));
  color: color-mix(in srgb, var(--adjustment-color) 92%, var(--schedule-text));
}

.adjustmentPrimaryBtn {
  background: var(--adjustment-color);
  color: #fff;
  font-size: 12px;
  box-shadow: 0 8px 16px color-mix(in srgb, var(--adjustment-color) 22%, transparent);
}

.adjustmentExitBtn {
  flex: 0 0 86px;
  min-height: 33px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--adjustment-color) 28%, var(--schedule-border));
  background: var(--schedule-surface);
  color: var(--schedule-muted);
}

.adjustmentExitBtn:hover {
  color: var(--schedule-text);
  background: color-mix(in srgb, var(--adjustment-color) 7%, var(--schedule-surface));
}

.adjustmentSaveAllBtn {
  flex: 1;
  border: 1px solid color-mix(in srgb, var(--schedule-primary) 84%, #fff);
  background: var(--schedule-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  min-height: 33px;
  padding: 8px 10px;
  border-radius: 9px;
  cursor: pointer;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--schedule-primary) 18%, transparent);
  transition: transform 0.16s ease, filter 0.16s ease;
}

.adjustmentSaveAllBtn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.adjustmentSaveAllBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
</style>

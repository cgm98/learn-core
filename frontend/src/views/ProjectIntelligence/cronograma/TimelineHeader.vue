<script setup>
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  Focus,
  Target,
} from 'lucide-vue-next'
import { PLANNER_SEGMENTS } from './useTimelineMath'

const props = defineProps({
  stageBars: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  searchTerm: { type: String, default: '' },
  windowDays: { type: Number, default: 28 },
  visibleWindowLabel: { type: String, required: true },
  focusedTask: { type: Object, default: null },
  monthSegments: { type: Array, required: true },
  timelineDays: { type: Array, required: true },
  timelineRange: { type: Object, required: true },
  windowOptions: { type: Array, required: true },
})

const emit = defineEmits([
  'update:searchTerm',
  'update:windowDays',
  'navigate',
  'today',
  'refresh',
])

const handleSearchInput = (e) => {
  emit('update:searchTerm', e.target.value)
}

const handleWindowSelect = (e) => {
  emit('update:windowDays', Number(e.target.value))
}

const isToday = (date) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const compare = new Date(date)
  compare.setHours(0, 0, 0, 0)
  return today.getTime() === compare.getTime()
}

const isWeekend = (date) => {
  const day = new Date(date).getDay()
  return day === 0 || day === 6
}

const getDayName = (date) => {
  const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']
  return dayNames[new Date(date).getDay()]
}
</script>

<template>
  <div>
    <div :class="$style.timelineNav">
      <div :class="$style.gutterSpacer">
        <div :class="$style.searchWrapper">
          <Search :size="14" />
          <input :value="props.searchTerm" @input="handleSearchInput" type="search" placeholder="Filtrar..." />
        </div>
      </div>

      <div v-if="props.stageBars" :class="$style.stageLegendInline" aria-label="Leyenda de etapas">
        <span v-for="segment in PLANNER_SEGMENTS" :key="segment.key" :class="$style.stageLegendItem"
          :style="{ '--stage-color': segment.color }">
          <span :class="$style.stageLegendSwatch"></span>
          <span>{{ segment.label }}</span>
        </span>
      </div>

      <div :class="$style.timelineRangeDisplay">
        <div :class="$style.navGroup">
          <button type="button" :class="$style.navBtn" @click="emit('navigate', -7)">
            <ChevronLeft :size="16" />
          </button>

          <button type="button" :class="$style.todayBtn" @click="emit('today')">
            Hoy
          </button>

          <button type="button" :class="$style.navBtn" @click="emit('navigate', 7)">
            <ChevronRight :size="16" />
          </button>
        </div>

        <div :class="$style.rangeInfoInline">
          <CalendarRange :size="15" />
          <strong>{{ props.visibleWindowLabel }}</strong>
        </div>

        <select :value="props.windowDays" @change="handleWindowSelect" :class="$style.windowSelect">
          <option v-for="opt in props.windowOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <button type="button" :class="$style.iconBtn" :disabled="props.isLoading" @click="emit('refresh')">
          <RotateCcw :size="15" :class="props.isLoading ? $style.spin : ''" />
        </button>
      </div>
    </div>

    <div :class="$style.monthsHeader">
      <div :class="$style.gutterSpacer">
        <div v-if="props.focusedTask" :class="$style.focusInfoInline">
          <Focus :size="13" />
          <strong>{{ props.focusedTask.moduleDescription }}</strong>
        </div>
      </div>

      <div :class="$style.monthsGrid">
        <div v-for="(segment, index) in props.monthSegments" :key="index" :class="$style.monthCell"
          :style="{ flex: `0 0 calc(${segment.span} * (100% / ${props.timelineRange.totalDays}))` }">
          {{ segment.name }}
        </div>
      </div>
    </div>

    <div :class="$style.daysHeader">
      <div :class="$style.taskInfoGutter">
        <Target :size="15" />
        <span>Actividad</span>
      </div>

      <div :class="$style.daysGrid">
        <div v-for="day in props.timelineDays" :key="day.getTime()"
          :class="[$style.dayCell, isToday(day) && $style.isToday, isWeekend(day) && $style.isWeekend]">
          <span :class="$style.dayName">{{ getDayName(day) }}</span>
          <span :class="$style.dayNum">{{ day.getDate() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.timelineNav {
  display: flex;
  height: 48px;
  border-bottom: 1px solid var(--schedule-border);
  background: var(--schedule-surface-alt);
}

.gutterSpacer {
  width: 400px;
  flex-shrink: 0;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--schedule-border);
}

.gutterSpacer strong {
  font-size: 13px;
  color: var(--schedule-text);
}

.searchWrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--schedule-border);
  border-radius: 8px;
  background: var(--schedule-surface);
}

.searchWrapper input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  font-size: 12px;
  color: var(--schedule-text);
  background: transparent;
}

.stageLegendInline {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-left: 4px;
}

.stageLegendItem {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--stage-color) 26%, var(--schedule-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--stage-color) 7%, var(--schedule-surface));
  color: color-mix(in srgb, var(--stage-color) 78%, var(--schedule-text));
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.stageLegendSwatch {
  width: 18px;
  height: 8px;
  border-radius: 999px;
  background: var(--stage-color);
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.1);
}

.timelineRangeDisplay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 14px;
  min-width: 0;
}

.navGroup {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--schedule-surface);
  border: 1px solid var(--schedule-border);
  border-radius: 6px;
  padding: 2px;
}

.navBtn,
.todayBtn {
  height: 28px;
  border: 0;
  background: none;
  cursor: pointer;
  font-weight: 600;
  color: var(--schedule-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.navBtn {
  width: 28px;
}

.todayBtn {
  padding: 0 10px;
  border-left: 1px solid var(--schedule-border);
  border-right: 1px solid var(--schedule-border);
}

.windowSelect {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--schedule-border);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--schedule-primary);
  background: var(--schedule-surface);
  outline: none;
}

.iconBtn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--schedule-border);
  border-radius: 6px;
  background: var(--schedule-surface);
  color: var(--schedule-muted);
  cursor: pointer;
}

.iconBtn:hover:not(:disabled) {
  color: var(--schedule-primary);
  border-color: var(--schedule-primary);
}

.focusInfoInline {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--schedule-primary);
  width: 100%;
  overflow: hidden;
}

.focusInfoInline strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.rangeInfoInline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--schedule-text);
  font-weight: 600;
  white-space: nowrap;
}

.paginationInline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
  padding-left: 10px;
  border-left: 1px solid var(--schedule-border);
  min-width: 0;
}

.paginationMeta,
.pageSizeSelect {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.paginationMeta {
  color: var(--schedule-muted);
  font-size: 11px;
}

.paginationMeta strong {
  color: var(--schedule-text);
  font-weight: 600;
}

.pageSizeSelect span {
  color: var(--schedule-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.pageSizeSelect select {
  height: 30px;
  min-width: 64px;
  padding: 0 8px;
  border: 1px solid var(--schedule-border);
  border-radius: 6px;
  background: var(--schedule-surface);
  color: var(--schedule-text);
  font-size: 12px;
  font-weight: 600;
  outline: none;
}

.pageBtn {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--schedule-primary) 34%, var(--schedule-border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--schedule-primary) 7%, var(--schedule-surface));
  color: var(--schedule-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.pageBtn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.monthsHeader {
  display: flex;
  height: 32px;
  background: var(--schedule-surface-alt);
  border-bottom: 1px solid var(--schedule-border);
}

.monthsGrid {
  flex: 1 0 var(--timeline-days-width);
  display: flex;
  min-width: var(--timeline-days-width);
}

.monthCell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--schedule-soft-text);
  border-right: 1px solid var(--schedule-border);
}

.daysHeader {
  display: flex;
  height: 40px;
  background: var(--schedule-surface);
  border-bottom: 1px solid var(--schedule-border);
}

.taskInfoGutter {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-right: 1px solid var(--schedule-border);
  font-size: 12px;
  font-weight: 700;
  color: var(--schedule-muted);
}

.daysGrid {
  flex: 1 0 var(--timeline-days-width);
  display: flex;
  min-width: var(--timeline-days-width);
}

.dayCell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--schedule-border);
  min-width: 46px;
}

.dayName {
  font-size: 11px;
  color: var(--schedule-muted);
  font-weight: 500;
  text-transform: uppercase;
}

.dayNum {
  font-size: 13px;
  font-weight: 600;
  color: var(--schedule-soft-text);
}

.isToday {
  background: color-mix(in srgb, var(--schedule-primary) 14%, transparent);
}

.isToday .dayNum {
  color: var(--schedule-primary);
}

.isWeekend {
  background: var(--schedule-surface-alt);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

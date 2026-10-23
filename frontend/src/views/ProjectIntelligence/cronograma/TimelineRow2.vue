<script setup>
const props = defineProps({
  task: { type: Object, required: true },
  stageBars: { type: Boolean, default: false },
  timelineDays: { type: Array, required: true },
})

const emit = defineEmits(['focusTask', 'clickSegment', 'clickStageDetail'])

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
</script>

<template>
  <div :class="[
    $style.taskRow,
    props.stageBars && $style.taskRowPlanner,
    props.task.isFocused && $style.isFocusedRow,
    props.task.isOutOfRange && $style.isOutOfRangeRow,
  ]" :data-task-id="props.task.taskKey" data-schedule-task-row @click="emit('focusTask', props.task)">
    <div :class="[$style.taskInfo, props.stageBars && $style.taskInfoPlanner]" role="button" tabindex="0"
      @click.stop="emit('focusTask', props.task)" @keydown.enter.stop="emit('focusTask', props.task)"
      @keydown.space.prevent.stop="emit('focusTask', props.task)">
      <span :class="$style.taskTitle">{{ props.task.description || 'Actividad sin título' }}</span>

      <span v-if="props.stageBars" :class="$style.taskStageDetails" aria-label="Responsables por etapa">
        <button v-for="detail in props.task.stageDetails" :key="detail.key" type="button"
          :class="$style.taskStageDetail" :style="{ '--stage-color': detail.color }"
          :title="`${detail.stageLabel || detail.key} - ${detail.label || 'Sin responsable'}`"
          @click.stop="emit('clickStageDetail', { event: $event, task: props.task, detail })">
          <span :class="$style.taskStageLabel">{{ detail.label || '—' }}</span>
          <span :class="[$style.taskStageStatus, detail.isFinished && $style.taskStageStatusDone]">
            {{ detail.statusLabel }}
          </span>
        </button>
      </span>

    </div>

    <div :class="$style.barContainer">
      <div :class="$style.gridLines">
        <div v-for="day in props.timelineDays" :key="day.getTime()" :class="[
          $style.gridLine,
          isToday(day) && $style.gridLineToday,
          isWeekend(day) && $style.gridLineWeekend,
        ]"></div>
      </div>

      <div v-for="segment in props.task.segments" :key="segment.key"
        :class="[$style.taskBar, props.task.isFocused && $style.focusedBar]" :style="segment.style"
        :title="`${segment.label} - ${props.task.moduleDescription || 'Actividad'}`" aria-hidden="true">
        <div v-if="!props.stageBars" :class="$style.barContent">
          <span :class="$style.barLabel">{{ props.task.moduleDescription }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.taskRow {
  display: flex;
  border-bottom: 1px solid var(--schedule-border);
  height: var(--task-row-height);
  transition: var(--transition-smooth);
}

.taskRow:hover {
  background: var(--schedule-surface-alt);
}

.isFocusedRow {
  background: color-mix(in srgb, var(--schedule-primary) 9%, transparent);
}

.isFocusedRow .taskInfo {
  background: color-mix(in srgb, var(--schedule-primary) 10%, transparent);
}

.isOutOfRangeRow {
  opacity: 0.65;
}

.taskInfo {
  width: 400px;
  flex-shrink: 0;
  padding: 10px 16px;
  border: 0;
  border-right: 1px solid var(--schedule-border);
  background: none;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
}

.taskInfoPlanner {
  padding: 2px 12px;
  justify-content: center;
  gap: 0;
}

.taskTitle {
  font-size: 15px;
  font-weight: 550;
  line-height: 1;
  color: var(--schedule-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.taskMeta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  line-height: 1;
  color: var(--schedule-muted);
}

.taskInfoPlanner .taskMeta {
  gap: 6px;
}

.taskStageDetails {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  margin-top: 4px;
}

.taskStageDetail {
  position: relative;
  height: 28px;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  justify-content: stretch;
  gap: 1px;
  min-width: 0;
  padding: 2px 0;
  border: 1px solid color-mix(in srgb, var(--stage-color) 32%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--stage-color) 9%, #fff);
  color: color-mix(in srgb, var(--stage-color) 82%, #111827);
  font-family: inherit;
  line-height: 1;
  font-weight: 500;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  appearance: none;
  transition: var(--transition-smooth);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.taskStageDetail::before {
  content: none;
}

.taskStageDetail:hover {
  background: color-mix(in srgb, var(--stage-color) 12%, #fff);
  transform: none;
}

.taskStageLabel {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding-inline: 1px;
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-align: center;
  color: color-mix(in srgb, var(--stage-color) 84%, #111827);
}

.taskStageStatus {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: stretch;
  max-width: 100%;
  overflow: hidden;
  padding: 0 1px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--stage-color) 88%, #111827);
  font-size: 6.5px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  box-shadow: none;
}

.taskStageStatusDone {
  background: transparent;
  color: color-mix(in srgb, var(--stage-color) 90%, #111827);
}

.barContainer {
  flex: 1 0 var(--timeline-days-width);
  min-width: var(--timeline-days-width);
  position: relative;
}

.barContainer::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1), background 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.isFocusedRow .barContainer::before {
  opacity: 1;
  background: color-mix(in srgb, var(--schedule-primary) 8%, transparent);
}

.gridLines {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: none;
  z-index: 0;
}

.gridLine {
  flex: 1;
  border-right: 1px solid var(--schedule-border);
  min-width: 46px;
}

.gridLineToday {
  background: color-mix(in srgb, var(--schedule-primary) 8%, transparent);
  border-right-color: color-mix(in srgb, var(--schedule-primary) 32%, var(--schedule-border));
}

.gridLineWeekend {
  background: var(--schedule-surface-alt);
}

.taskBar {
  position: absolute;
  z-index: 2;
  top: 12px;
  bottom: 12px;
  border-radius: 9px;
  cursor: pointer;
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.24s cubic-bezier(0.22, 1, 0.36, 1), filter 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  min-width: 4px;
  overflow: hidden;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

.taskRowPlanner .taskBar {
  top: 15px;
  bottom: 15px;
  min-height: 12px;
  cursor: default;
}

.taskBar:hover {
  transform: scaleY(1.08);
  filter: saturate(1.08);
  box-shadow:
    inset 0 -1px 0 rgba(0, 0, 0, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.12);
}

.taskRowPlanner .taskBar:hover {
  transform: none;
  filter: none;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

.focusedBar {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--schedule-primary) 32%, transparent),
    0 4px 12px rgba(0, 0, 0, 0.12);
}

.barContent {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
}

.barLabel {
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
</style>

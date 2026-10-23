import { computed } from 'vue'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const TIMELINE_START_OFFSET = -3

export const DAY_NAMES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa']

export const PLANNER_SEGMENTS = Object.freeze([
  { key: 'sistemas', section: 'sistemas', label: 'Programador', color: 'var(--schedule-stage-orange)' },
  { key: 'diseno', section: 'diseno', label: 'Diseño', color: 'var(--schedule-stage-blue)' },
  { key: 'proyecto', section: 'proyecto', label: 'Proyecto', color: 'var(--schedule-stage-green)' },
])

export const SECTION_LABELS = Object.freeze({
  sistemas: 'Programador',
  diseno: 'Diseño',
  proyecto: 'Proyecto',
})

export const SECTION_MAX_ADJUSTMENTS = Object.freeze({
  sistemas: 4,
  diseno: 2,
  proyecto: 4,
})

export const NEXT_SECTION = Object.freeze({
  sistemas: 'diseno',
  diseno: 'proyecto',
  proyecto: null,
})

export const startOfDay = (date) => {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

export const addDays = (date, amount) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

export const toInputDate = (date) => {
  if (!date) return ''
  const value = startOfDay(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parseTaskDate = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateOnly) {
      const [, year, month, day] = dateOnly
      return startOfDay(new Date(Number(year), Number(month) - 1, Number(day)))
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : startOfDay(date)
}

export const getTaskDuration = (task) => Math.max(1, 1)
export const getTaskKey = (task) => String(task?.id ?? task?.uuid ?? task?.codigo ?? '')
export const sameTaskKey = (task, taskKey) => getTaskKey(task) === String(taskKey)

export const getTaskBounds = (task) => {
  const start = parseTaskDate(task?.requestDate)
  if (!start) return null
  const durationDays = getTaskDuration(task)
  return {
    start,
    endExclusive: addDays(start, durationDays),
    endInclusive: addDays(start, durationDays - 1),
    durationDays,
  }
}

export const rangesOverlap = (firstStart, firstEndExclusive, secondStart, secondEndExclusive) =>
  firstEndExclusive.getTime() > secondStart.getTime() &&
  firstStart.getTime() < secondEndExclusive.getTime()

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })
const fullDateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

export const formatShortDate = (date) => shortDateFormatter.format(date).replace('.', '')
export const formatFullDate = (date) => fullDateFormatter.format(date).replace('.', '')

export const formatDateRange = (bounds) => {
  if (!bounds) return 'Sin fecha'
  if (bounds.start.getTime() === bounds.endInclusive.getTime()) return formatFullDate(bounds.start)
  return `${formatShortDate(bounds.start)} - ${formatFullDate(bounds.endInclusive)}`
}

export const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const getSeedNumber = (seed) => {
  if (!seed) return 0
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

const PALETTE_LIGHT = [
  '#2f6feb', // Azul
  '#0d9488', // Teal
  '#4f46e5', // Indigo
  '#d97706', // Amber/Orange
  '#059669', // Emerald/Green
  '#db2777', // Pink
  '#7c3aed', // Violet
  '#2563eb'  // Blue dark
]

const PALETTE_DARK = [
  '#3b82f6', // Light Blue
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#f59e0b', // Amber/Orange
  '#10b981', // Emerald/Green
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#60a5fa'  // Blue light
]

const isLightTheme = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme')

export const getTaskColor = (task) => {
  const key = task.moduleDescription || task.systemOwner || 'default'
  const seed = getSeedNumber(key)
  const palette = isLightTheme() ? PALETTE_LIGHT : PALETTE_DARK
  return palette[seed % palette.length]
}

export const getStatusTone = (task) => {
  const rawStatus = normalizeText(`${task?.status ?? ''} ${task?.statusRaw ?? ''} ${task?.urgency ?? ''}`)
  if (rawStatus.includes('urg') || rawStatus.includes('bloq') || rawStatus.includes('venc')) return 'Danger'
  if (rawStatus.includes('final') || rawStatus.includes('complet') || rawStatus.includes('done')) return 'Success'
  if (rawStatus.includes('qa') || rawStatus.includes('curso') || rawStatus.includes('proceso')) return 'Info'
  if (!task?.systemOwner) return 'Warning'
  return 'Neutral'
}

export const firstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export const shortStageText = (value, fallback) => {
  const text = firstText(value, fallback)
  return text.length > 14 ? `${text.slice(0, 13)}...` : text
}

export const getPlannerStageDetails = (task) => {
  return [
    {
      key: 'sistemas',
      label: task?.systemOwnerCode || '',
      color: 'var(--schedule-stage-orange)',
      statusLabel: isSectionFinished(task, 'sistemas') ? 'Terminado' : 'Pendiente',
      isFinished: isSectionFinished(task, 'sistemas'),
    },
    {
      key: 'diseno',
      label: task?.designReviewerCode || task?.implementerCode || '',
      color: 'var(--schedule-stage-blue)',
      statusLabel: isSectionFinished(task, 'diseno') ? 'Terminado' : 'Pendiente',
      isFinished: isSectionFinished(task, 'diseno'),
    },
    {
      key: 'proyecto',
      label: task?.projectOwnerCode || task?.createdBy || '',
      color: 'var(--schedule-stage-green)',
      statusLabel: isSectionFinished(task, 'proyecto') ? 'Terminado' : 'Pendiente',
      isFinished: isSectionFinished(task, 'proyecto'),
    },
  ]
}

export const getScheduleSection = (task, sectionKey) => task?.schedule?.[sectionKey] || null

export const getSectionAdjustments = (task, sectionKey) => {
  const section = getScheduleSection(task, sectionKey)
  const max = SECTION_MAX_ADJUSTMENTS[sectionKey] || 1
  const ajustes = Array.isArray(section?.ajustes) ? section.ajustes : []

  return Array.from({ length: max }, (_, index) => {
    const found = ajustes.find((item) => Number(item?.number) === index + 1) || ajustes[index] || {}
    return {
      number: index + 1,
      inicio: found?.inicio || null,
      fin: found?.fin || null,
    }
  })
}

export const getSectionStatus = (task, sectionKey) =>
  String(getScheduleSection(task, sectionKey)?.estado || '').trim().toUpperCase()

export const isSectionFinished = (task, sectionKey) => getSectionStatus(task, sectionKey) === 'S'

export const getStartedSectionAdjustments = (task, sectionKey) =>
  getSectionAdjustments(task, sectionKey).filter((item) => item.inicio || item.fin)

export const getStartedAdjustmentCount = (task, sectionKey) =>
  getStartedSectionAdjustments(task, sectionKey).length

export const getSectionRangeFromDb = (task, sectionKey) => {
  const adjustments = getStartedSectionAdjustments(task, sectionKey)
  const dates = []

  adjustments.forEach((item) => {
    const start = parseTaskDate(item.inicio)
    const end = parseTaskDate(item.fin) || start
    if (start) dates.push(start)
    if (end) dates.push(end)
  })

  if (!dates.length) return null

  const startMs = Math.min(...dates.map((date) => date.getTime()))
  const endMs = Math.max(...dates.map((date) => date.getTime()))
  const start = new Date(startMs)
  const endInclusive = new Date(endMs)
  const durationDays = Math.max(Math.round((endInclusive.getTime() - start.getTime()) / DAY_IN_MS) + 1, 1)

  return {
    start,
    endInclusive,
    endExclusive: addDays(endInclusive, 1),
    durationDays,
    isPlaceholder: false,
  }
}

export const getLastRealDateUntilSection = (task, sectionKey) => {
  const targetIndex = PLANNER_SEGMENTS.findIndex((segment) => segment.section === sectionKey)
  const dates = []

  PLANNER_SEGMENTS.forEach((segment, index) => {
    if (targetIndex >= 0 && index > targetIndex) return
    getStartedSectionAdjustments(task, segment.section).forEach((item) => {
      const start = parseTaskDate(item.inicio)
      const end = parseTaskDate(item.fin)
      if (start) dates.push(start)
      if (end) dates.push(end)
    })
  })

  if (!dates.length) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

export const getTaskBaseScheduleDate = (task) =>
  parseTaskDate(task?.requestDate) ||
  parseTaskDate(task?.createdAt) ||
  parseTaskDate(task?.systemDate) ||
  startOfDay(new Date())

export const getActiveSectionKey = (task) => {
  for (const segment of PLANNER_SEGMENTS) {
    const sectionKey = segment.section
    const status = getSectionStatus(task, sectionKey)
    const hasDates = getStartedAdjustmentCount(task, sectionKey) > 0
    if (status !== 'S') return sectionKey
    if (!hasDates) return sectionKey
  }
  return 'proyecto'
}

export const getPlaceholderRange = (task, sectionKey) => {
  if (getSectionRangeFromDb(task, sectionKey)) return null
  if (getActiveSectionKey(task) !== sectionKey) return null

  const previousDate = getLastRealDateUntilSection(task, sectionKey)
  const start = previousDate ? addDays(previousDate, 1) : getTaskBaseScheduleDate(task)

  return {
    start,
    endInclusive: start,
    endExclusive: addDays(start, 1),
    durationDays: 1,
    isPlaceholder: true,
  }
}

export const getSegmentBarStyle = (segmentStart, durationDays, color, range, options = {}) => {
  const timelineStartMs = range.start.getTime()
  const timelineEndMs = range.endExclusive.getTime()
  const segmentEnd = addDays(segmentStart, durationDays)
  const segmentStartMs = segmentStart.getTime()
  const segmentEndMs = segmentEnd.getTime()

  if (!rangesOverlap(segmentStart, segmentEnd, range.start, range.endExclusive)) return null

  const visibleStartMs = Math.max(segmentStartMs, timelineStartMs)
  const visibleEndMs = Math.min(segmentEndMs, timelineEndMs)
  const startOffsetDays = (visibleStartMs - timelineStartMs) / DAY_IN_MS
  const visibleDurationDays = Math.max((visibleEndMs - visibleStartMs) / DAY_IN_MS, 0.5)
  const isClippedStart = segmentStartMs < timelineStartMs
  const isClippedEnd = segmentEndMs > timelineEndMs

  if (options.alignToCellCenters) {
    const segmentStartOffsetDays = (segmentStartMs - timelineStartMs) / DAY_IN_MS
    const segmentEndOffsetDays = (segmentEndMs - timelineStartMs) / DAY_IN_MS
    const hasSharedStart = Boolean(options.sharedStart) && !isClippedStart
    const hasSharedEnd = Boolean(options.sharedEnd) && !isClippedEnd
    const startAnchorDays = isClippedStart ? 0 : segmentStartOffsetDays + 0.5
    const endAnchorDays = isClippedEnd ? range.totalDays : segmentEndOffsetDays - 0.5
    const anchorDurationDays = Math.max(endAnchorDays - startAnchorDays, 0)
    const isSingleDaySegment = durationDays <= 1 && !isClippedStart && !isClippedEnd
    const startGap = isClippedStart
      ? '0px'
      : hasSharedStart
        ? 'var(--schedule-stage-transition-gap)'
        : 'var(--schedule-stage-bar-gap)'
    const endGap = isClippedEnd
      ? '0px'
      : hasSharedEnd
        ? 'var(--schedule-stage-transition-gap)'
        : 'var(--schedule-stage-bar-gap)'
    const singleSharedWidth = `max(16px, calc((100% / ${range.totalDays} / 2) - var(--schedule-stage-transition-gap) - var(--schedule-stage-bar-gap)))`

    if (isSingleDaySegment && hasSharedStart && !hasSharedEnd) {
      return {
        left: `calc(${startAnchorDays} * (100% / ${range.totalDays}) + var(--schedule-stage-transition-gap))`,
        width: singleSharedWidth,
        backgroundColor: color,
        borderTopLeftRadius: isClippedStart ? '0' : '999px',
        borderBottomLeftRadius: isClippedStart ? '0' : '999px',
        borderTopRightRadius: isClippedEnd ? '0' : '999px',
        borderBottomRightRadius: isClippedEnd ? '0' : '999px',
        display: 'flex',
      }
    }

    if (isSingleDaySegment && hasSharedEnd && !hasSharedStart) {
      return {
        left: `calc(${startAnchorDays} * (100% / ${range.totalDays}) - ${singleSharedWidth} - var(--schedule-stage-transition-gap))`,
        width: singleSharedWidth,
        backgroundColor: color,
        borderTopLeftRadius: isClippedStart ? '0' : '999px',
        borderBottomLeftRadius: isClippedStart ? '0' : '999px',
        borderTopRightRadius: isClippedEnd ? '0' : '999px',
        borderBottomRightRadius: isClippedEnd ? '0' : '999px',
        display: 'flex',
      }
    }

    return {
      left: isSingleDaySegment
        ? `calc(${startAnchorDays} * (100% / ${range.totalDays}) - (var(--schedule-stage-single-day-width) / 2))`
        : `calc(${startAnchorDays} * (100% / ${range.totalDays}) + ${startGap})`,
      width: isSingleDaySegment
        ? 'var(--schedule-stage-single-day-width)'
        : `max(18px, calc(${anchorDurationDays} * (100% / ${range.totalDays}) - ${startGap} - ${endGap}))`,
      backgroundColor: color,
      borderTopLeftRadius: isClippedStart ? '0' : '999px',
      borderBottomLeftRadius: isClippedStart ? '0' : '999px',
      borderTopRightRadius: isClippedEnd ? '0' : '999px',
      borderBottomRightRadius: isClippedEnd ? '0' : '999px',
      display: 'flex',
    }
  }

  return {
    left: `calc(${startOffsetDays} * (100% / ${range.totalDays}))`,
    width: `calc(${visibleDurationDays} * (100% / ${range.totalDays}))`,
    backgroundColor: color,
    borderTopLeftRadius: isClippedStart ? '0' : '9px',
    borderBottomLeftRadius: isClippedStart ? '0' : '9px',
    borderTopRightRadius: isClippedEnd ? '0' : '9px',
    borderBottomRightRadius: isClippedEnd ? '0' : '9px',
    display: 'flex',
  }
}

export const getPlannerSegments = (task, range) => {
  const stagedRanges = PLANNER_SEGMENTS.map((segment) => {
    const sectionKey = segment.section || segment.key
    const rangeItem = getSectionRangeFromDb(task, sectionKey)
    return { segment, sectionKey, rangeItem }
  }).filter((item) => item.rangeItem)

  return stagedRanges.flatMap((item, index) => {
    const { segment, sectionKey, rangeItem } = item
    const previousRange = stagedRanges[index - 1]?.rangeItem
    const nextRange = stagedRanges[index + 1]?.rangeItem
    const style = getSegmentBarStyle(rangeItem.start, rangeItem.durationDays, segment.color, range, {
      alignToCellCenters: true,
      sharedStart: previousRange?.endInclusive?.getTime() === rangeItem.start.getTime(),
      sharedEnd: nextRange?.start?.getTime() === rangeItem.endInclusive.getTime(),
    })

    if (!style) return []

    if (rangeItem.isPlaceholder) {
      style.opacity = 0.62
      style.outline = '1px dashed color-mix(in srgb, currentColor 35%, transparent)'
    }

    return [
      {
        ...segment,
        key: segment.key,
        adjustmentNumber: null,
        adjustmentCount: getStartedAdjustmentCount(task, sectionKey),
        durationDays: rangeItem.durationDays,
        startDate: rangeItem.start,
        endDate: rangeItem.endInclusive,
        endExclusive: rangeItem.endExclusive,
        isPlaceholder: rangeItem.isPlaceholder,
        scheduleSection: getScheduleSection(task, sectionKey),
        style,
      },
    ]
  })
}

export const getSingleTaskSegment = (task, range) => {
  const bounds = getTaskBounds(task)
  if (!bounds) return []
  const color = getTaskColor(task)
  const style = getSegmentBarStyle(bounds.start, bounds.durationDays, color, range)

  if (!style) return []

  return [
    {
      key: 'principal',
      label: 'Actividad',
      color,
      durationDays: bounds.durationDays,
      startDate: bounds.start,
      endDate: bounds.endInclusive,
      endExclusive: bounds.endExclusive,
      style,
    },
  ]
}

export const useTimelineMath = (baseDate, windowDays, focusedTaskKey, stageBars) => {
  const timelineRange = computed(() => {
    const start = addDays(baseDate.value, TIMELINE_START_OFFSET)
    const endExclusive = addDays(start, windowDays.value)
    return {
      start,
      endExclusive,
      endInclusive: addDays(endExclusive, -1),
      totalDays: windowDays.value,
    }
  })

  const visibleWindowLabel = computed(
    () => `${formatShortDate(timelineRange.value.start)} - ${formatFullDate(timelineRange.value.endInclusive)}`,
  )

  const timelineDays = computed(() =>
    Array.from({ length: timelineRange.value.totalDays }, (_, index) =>
      addDays(timelineRange.value.start, index),
    ),
  )

  const monthSegments = computed(() => {
    if (timelineDays.value.length === 0) return []
    const segments = []
    let segmentStart = timelineDays.value[0]
    let currentMonth = segmentStart.getMonth()
    let currentYear = segmentStart.getFullYear()
    let span = 0

    for (const day of timelineDays.value) {
      const month = day.getMonth()
      const year = day.getFullYear()

      if (month !== currentMonth || year !== currentYear) {
        segments.push({ name: monthFormatter.format(segmentStart), span })
        segmentStart = day
        currentMonth = month
        currentYear = year
        span = 1
        continue
      }
      span += 1
    }
    segments.push({ name: monthFormatter.format(segmentStart), span })
    return segments
  })

  const toEnhancedTask = (task) => {
    const bounds = getTaskBounds(task)
    const taskKey = getTaskKey(task)
    const isInTimeline = bounds && rangesOverlap(bounds.start, bounds.endExclusive, timelineRange.value.start, timelineRange.value.endExclusive)

    return {
      ...task,
      taskKey,
      taskDuration: getTaskDuration(task),
      segments: stageBars.value ? getPlannerSegments(task, timelineRange.value) : getSingleTaskSegment(task, timelineRange.value),
      rangeLabel: formatDateRange(bounds),
      statusTone: getStatusTone(task),
      clientLabel: task.clientName || 'Sin cliente',
      stageDetails: stageBars.value ? getPlannerStageDetails(task) : [],
      moduleLabel: task.moduleDescription || 'Sin módulo',
      isFocused: focusedTaskKey.value === taskKey,
      isOutOfRange: Boolean(bounds && !isInTimeline),
      hasSchedule: Boolean(bounds),
    }
  }

  return {
    timelineRange,
    visibleWindowLabel,
    timelineDays,
    monthSegments,
    toEnhancedTask,
  }
}

export const getSectionLastDateForTask = (task, sectionKey) => {
  const adjustments = getSectionAdjustments(task, sectionKey)
  const dates = adjustments
    .flatMap((item) => [item.fin, item.inicio])
    .map(parseTaskDate)
    .filter(Boolean)

  if (!dates.length) return null
  return new Date(Math.max(...dates.map((date) => date.getTime())))
}

export const getNextSuggestedDateForTask = (task, sectionKey, referenceSectionKey = sectionKey) => {
  const lastDate = getSectionLastDateForTask(task, referenceSectionKey)
  if (lastDate) return toInputDate(addDays(lastDate, 1))

  const previousDate = getLastRealDateUntilSection(task, sectionKey)
  if (previousDate) return toInputDate(addDays(previousDate, 1))

  return toInputDate(getTaskBaseScheduleDate(task))
}

export const getSegmentStartForPanel = (segment, task) => {
  const segmentStart = parseTaskDate(segment?.startDate)
  if (segmentStart) return segmentStart

  const sectionKey = segment?.section || segment?.key || ''
  const rangeFromDb = sectionKey ? getSectionRangeFromDb(task, sectionKey) : null
  if (rangeFromDb?.start) return rangeFromDb.start

  const bounds = getTaskBounds(task)
  return bounds?.start ?? null
}

export const getSegmentDurationForPanel = (segment) =>
  Math.max(Number.parseInt(segment?.durationDays, 10) || 1, 1)

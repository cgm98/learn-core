<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, Search, X } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import KanbanColumn from './KanbanColumn.vue'
import TaskCard from './TaskCard.vue'
import TaskFilters from './TaskFilters.vue'
import { useKanbanBoardState } from './useKanbanBoardState'
import { useTasks } from './useTasks'
import './pm-theme.css'

const props = defineProps({
    projectId: { type: String, required: true }
})

const emit = defineEmits(['select-task'])

const defaultColumns = ['planeacion', 'por hacer', 'en progreso', 'en revision', 'finalizado']
const COLUMN_ORDER_KEY = 'business-kanban-columns:v1'
const LOCKED_COLUMNS_KEY = 'business-kanban-locked-columns:v1'
const orderedColumns = ref([...defaultColumns])
const lockedColumns = ref([])

const {
    tasks,
    filters,
    globalUrgencyFilter,
    loadTasks,
    getUnique,
    getTasksByStatus,
    createTask,
    updateTask,
    reorderTaskOptimistic,
    deleteTaskOptimistic
} = useTasks(() => props.projectId)

const filterOptions = computed(() => ({
    dev: getUnique('systemOwner'),
    po: getUnique('implementer'),
    client: getUnique('clientName')
}))

const {
    searchQuery,
    visibleTasksByStatus,
    totalTaskCount,
    visibleTaskCount,
    activeFilterCount,
    hasActiveFilters,
    hydratePreferences,
    resetFilters
} = useKanbanBoardState({
    columns: defaultColumns,
    filters,
    globalUrgencyFilter,
    getTasksByStatus
})

const normalizeColumnOrder = (incoming) => {
    const source = Array.isArray(incoming) ? incoming : []
    const uniqueColumns = source.filter(
        (column, index) => defaultColumns.includes(column) && source.indexOf(column) === index
    )

    return [...uniqueColumns, ...defaultColumns.filter((column) => !uniqueColumns.includes(column))]
}

const readStoredArray = (key) => {
    if (typeof window === 'undefined') return []

    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

const writeStoredArray = (key, values) => {
    if (typeof window === 'undefined') return

    try {
        window.localStorage.setItem(key, JSON.stringify(values))
    } catch {
        // localStorage can fail on private/embedded contexts.
    }
}

const persistColumnPreferences = () => {
    writeStoredArray(COLUMN_ORDER_KEY, orderedColumns.value)
    writeStoredArray(LOCKED_COLUMNS_KEY, lockedColumns.value)
}

const hydrateColumnPreferences = () => {
    const storedOrder = readStoredArray(COLUMN_ORDER_KEY)
    const storedLocks = readStoredArray(LOCKED_COLUMNS_KEY)

    orderedColumns.value = normalizeColumnOrder(storedOrder)
    lockedColumns.value = storedLocks.filter((status) => orderedColumns.value.includes(status))
}

const boardSummary = computed(() => {
    if (!hasActiveFilters.value) return `${totalTaskCount.value} tareas`
    return `${visibleTaskCount.value} de ${totalTaskCount.value} tareas`
})

const isColumnLocked = (status) => lockedColumns.value.includes(status)

const toggleColumnLock = (status) => {
    if (!orderedColumns.value.includes(status)) return

    if (isColumnLocked(status)) {
        lockedColumns.value = lockedColumns.value.filter((column) => column !== status)
    } else {
        lockedColumns.value = [...lockedColumns.value, status]
    }

    persistColumnPreferences()
}

const revertColumnMove = (oldIndex, newIndex) => {
    const nextOrder = [...orderedColumns.value]
    const [movedColumn] = nextOrder.splice(newIndex, 1)
    if (!movedColumn) return
    nextOrder.splice(oldIndex, 0, movedColumn)
    orderedColumns.value = nextOrder
}

const isMoveCrossingLockedColumn = (oldIndex, newIndex, movedColumn) => {
    const start = Math.min(oldIndex, newIndex)
    const end = Math.max(oldIndex, newIndex)

    for (let index = start; index <= end; index += 1) {
        const column = orderedColumns.value[index]
        if (!column || column === movedColumn) continue
        if (isColumnLocked(column)) return true
    }

    return false
}

const handleColumnOrderChange = (evt) => {
    const moved = evt?.moved
    if (!moved) return

    const { oldIndex, newIndex, element } = moved
    if (typeof oldIndex !== 'number' || typeof newIndex !== 'number') return

    if (isColumnLocked(element) || isMoveCrossingLockedColumn(oldIndex, newIndex, element)) {
        revertColumnMove(oldIndex, newIndex)
        return
    }

    persistColumnPreferences()
}

const taskForm = ref(null)

const emptyTaskForm = () => ({
    id: null,
    title: '',
    description: '',
    clientName: '',
    systemOwner: '',
    implementer: '',
    progress: 2
})

const openAddTask = () => {
    taskForm.value = emptyTaskForm()
}

const openEditTask = (task) => {
    taskForm.value = {
        id: task.id,
        title: task.moduleDescription || '',
        description: task.description || '',
        clientName: task.clientName || '',
        systemOwner: task.systemOwner || '',
        implementer: task.implementer || '',
        progress: task.progress || 2
    }
}

const closeTaskForm = () => {
    taskForm.value = null
}

const submitTaskForm = async () => {
    const form = taskForm.value
    if (!form?.title?.trim()) return

    const payload = { ...form, title: form.title.trim() }
    if (payload.id) {
        await updateTask(payload.id, payload)
    } else {
        await createTask(payload)
    }
    closeTaskForm()
}

const handleDraggableChange = (evt, targetStatus) => {
    const change = evt.added ?? evt.moved
    if (change?.element?.id == null || typeof change.newIndex !== 'number') return

    reorderTaskOptimistic(change.element.id, targetStatus, change.newIndex)
}

const handleDelete = (taskId) => {
    if (taskId == null) return

    if (confirm('¿Estás seguro de que deseas eliminar esta tarea?')) {
        deleteTaskOptimistic(taskId)
    }
}

const handleKeydown = (event) => {
    if (event.key === 'Escape') {
        closeTaskForm()
    }
}

onMounted(() => {
    hydrateColumnPreferences()
    hydratePreferences()
    loadTasks()
    window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
})

defineExpose({ loadTasks })
</script>

<template>
    <div class="board-view pm-view-root">
        <header class="view-header">

            <div class="header-top">
                <div class="header-meta-row">
                    <span class="eyebrow">Gestion empresarial</span>
                    <span class="summary-pill">{{ boardSummary }}</span>
                </div>
                <div class="title-area">
                    <span class="eyebrow">Gestión empresarial</span>
                    <div class="title-row">
                        <h1>Tablero del Proyecto</h1>
                    </div>
                </div>

                <div class="header-actions">
                    <button class="btn-primary" type="button" @click="openAddTask">
                        <Plus :size="18" aria-hidden="true" />
                        <span>Nueva tarea</span>
                    </button>
                    <!-- <div class="sprint-info" aria-label="Información del sprint">
                        <strong>Sprint 1: La Cura del Burnout</strong>
                        <div class="timer">
                            <Clock :size="16" aria-hidden="true" />
                            <span>12 días restantes</span>
                        </div>
                    </div> -->
                </div>
            </div>
        </header>

        <section class="board-workspace" aria-label="Área de trabajo del tablero">
            <div class="header-bottom">
                <div class="search-filter-row">
                    <label class="search-control">
                        <Search :size="16" aria-hidden="true" />
                        <input v-model.trim="searchQuery" type="search"
                            placeholder="Buscar tarea, cliente, modulo o responsable" />
                    </label>
                    <div class="filters-wrapper">
                        <TaskFilters :filters="filters" v-model:globalUrgencyFilter="globalUrgencyFilter"
                            :filterOptions="filterOptions" :hasActiveFilters="hasActiveFilters"
                            :activeFilterCount="activeFilterCount" @reset="resetFilters" />
                    </div>
                </div>
            </div>

            <draggable :list="orderedColumns" :item-key="(status) => status" tag="section" class="board"
                aria-label="Columnas del tablero Kanban" handle=".column-drag-handle:not(.disabled)"
                ghost-class="column-ghost" :animation="180" :delay="120" :delay-on-touch-only="true"
                :touch-start-threshold="6" @change="handleColumnOrderChange">
                <template #item="{ element: status }">
                    <KanbanColumn :key="status" :title="status" :is-locked="isColumnLocked(status)"
                        :tasks="visibleTasksByStatus[status] || []" :page-size="30" @toggle-lock="toggleColumnLock"
                        @change="(evt) => handleDraggableChange(evt, status)">
                        <template #default="{ task }">
                            <TaskCard :task="task" @delete="handleDelete" @edit="openEditTask"
                                @click="emit('select-task', task)" />
                        </template>
                    </KanbanColumn>
                </template>
            </draggable>
        </section>

        <div v-if="taskForm" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="task-form-title"
            @click="closeTaskForm">
            <div class="modal-content" @click.stop>
                <div class="modal-header">
                    <h2 id="task-form-title">{{ taskForm.id ? 'Editar tarea' : 'Nueva tarea' }}</h2>
                    <button class="close-btn" type="button" aria-label="Cerrar" @click="closeTaskForm">
                        <X :size="24" aria-hidden="true" />
                    </button>
                </div>
                <form class="modal-body" @submit.prevent="submitTaskForm">
                    <div class="fields-grid">
                        <label class="field-item">
                            <span class="field-label">Título</span>
                            <input v-model.trim="taskForm.title" type="text" required class="form-field-input" />
                        </label>
                        <label class="field-item">
                            <span class="field-label">Cliente</span>
                            <input v-model.trim="taskForm.clientName" type="text" class="form-field-input" />
                        </label>
                        <label class="field-item">
                            <span class="field-label">Desarrollador (Dev)</span>
                            <input v-model.trim="taskForm.systemOwner" type="text" class="form-field-input" />
                        </label>
                        <label class="field-item">
                            <span class="field-label">Product Owner (PO)</span>
                            <input v-model.trim="taskForm.implementer" type="text" class="form-field-input" />
                        </label>
                        <label class="field-item">
                            <span class="field-label">Urgencia</span>
                            <select v-model.number="taskForm.progress" class="form-field-input">
                                <option :value="1">Alta</option>
                                <option :value="2">Media</option>
                                <option :value="3">Baja</option>
                            </select>
                        </label>
                    </div>
                    <div class="description-section">
                        <h3>Descripción</h3>
                        <textarea v-model.trim="taskForm.description" rows="3" class="form-field-input"></textarea>
                    </div>
                    <div class="header-actions">
                        <button type="button" class="btn-secondary" @click="closeTaskForm">Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped>
.board-view {
    display: flex;
    flex-direction: column;
    gap: calc(10px * var(--ui-scale));
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: scroll;
    color: var(--text-main);
}

.board-workspace {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    min-width: 0;
    gap: calc(10px * var(--ui-scale));
    padding: 0 0 calc(14px * var(--ui-scale));
    background: transparent;
}

.view-header {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 0;
    gap: calc(10px * var(--ui-scale));
    padding: 0;
    background: transparent;
    flex-shrink: 0;
}

.header-bottom {
    display: grid;
    width: 100%;
    min-width: 0;
    gap: calc(10px * var(--ui-scale));
    min-height: 0;
    padding: 0;
    position: relative;
    z-index: 20;
}

.filters-panel-enter-active,
.filters-panel-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.filters-panel-enter-from,
.filters-panel-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.header-top {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(clamp(360px, 34vw, 430px), clamp(430px, 40vw, 540px));
    grid-template-areas:
        "meta meta"
        "title actions";
    align-items: center;
    gap: clamp(8px, 0.9vw, 12px) clamp(18px, 2.2vw, 30px);
    padding:
        clamp(17px, 1.35vw, 22px) clamp(18px, 1.8vw, 26px) clamp(16px, 1.25vw, 21px) clamp(24px, 2vw, 30px);
    border: 1px solid color-mix(in srgb, var(--border-color) 90%, var(--accent-blue));
    border-radius: calc(14px * var(--ui-scale));
    background: var(--panel-bg);
    overflow: hidden;
}

.header-top::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 0;
    border-top-left-radius: inherit;
    border-bottom-left-radius: inherit;
    background: color-mix(in srgb, var(--accent-blue) 62%, var(--panel-bg));
    pointer-events: none;
}

.header-meta-row {
    position: relative;
    z-index: 1;
    grid-area: meta;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
}

.title-area {
    position: relative;
    z-index: 1;
    grid-area: title;
    display: grid;
    align-content: center;
    gap: calc(5px * var(--ui-scale));
    min-width: 0;
}

.title-area>.eyebrow {
    display: none;
}

.eyebrow {
    display: block;
    margin-bottom: 4px;
    color: var(--text-muted, #6b6b6b);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.header-meta-row .eyebrow {
    margin-bottom: 0;
}

.title-row {
    display: flex;
    align-items: center;
    min-width: 0;
}

.title-area h1 {
    margin: 0;
    min-width: 0;
    font-size: clamp(1.9rem, 1.45rem + 1.1vw, 2.25rem);
    line-height: 1.15;
    letter-spacing: -0.01em;
}

.title-meta {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    color: var(--text-muted, #6b6b6b);
    font-size: 0.78rem;
    font-weight: 650;
}

.meta-divider {
    width: 1px;
    height: 14px;
    background: var(--border-color, #e5e5e5);
}

.title-context {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.summary-pill {
    flex: 0 0 auto;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--accent-blue) 22%, var(--border-color));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent-blue) 8%, var(--panel-bg));
    color: color-mix(in srgb, var(--accent-blue) 76%, var(--text-main));
    font-size: 0.74rem;
    font-weight: 700;
}

.header-actions {
    position: relative;
    z-index: 1;
    grid-area: actions;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    align-items: center;
    align-content: center;
    align-self: stretch;
    gap: 8px;
    min-width: 0;
}

.header-actions .sprint-info {
    order: 1;
}

.header-actions .btn-primary {
    order: 2;
    justify-self: end;
    width: auto;
}

.btn-primary,
.btn-secondary {
    min-height: 40px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
    white-space: nowrap;
}

.btn-primary {
    background: var(--accent-blue, #2f6feb);
    color: #ffffff;
    border: 1px solid color-mix(in srgb, var(--accent-blue) 86%, #ffffff);
    min-height: 44px;
    border-radius: 11px;
    padding: 0 14px;
    box-shadow: 0 6px 14px color-mix(in srgb, var(--accent-blue) 18%, transparent);
}

.btn-primary:hover {
    transform: translateY(-1px);
    filter: brightness(1.04);
}

.btn-secondary {
    background: transparent;
    color: var(--text-main);
    border: 1px solid var(--border-color, #e5e5e5);
    padding: 9px 12px;
}

.btn-secondary:hover {
    border-color: var(--accent-blue, #2f6feb);
}

.btn-secondary strong {
    min-width: 20px;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--accent-blue, #2f6feb);
    color: #ffffff;
    font-size: 0.75rem;
    line-height: 1.2;
}

.filters-shell {
    display: grid;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
    background: color-mix(in srgb, var(--panel-bg) 96%, var(--bg-color));
}

.search-filter-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: calc(10px * var(--ui-scale));
    min-width: 0;
}

.filters-toggle {
    display: flex;
    width: 100%;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-main);
    padding: 10px 12px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
}

.filters-toggle-title,
.filters-toggle-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.filters-toggle strong {
    min-width: 20px;
    padding: 2px 6px;
    border-radius: 999px;
    background: var(--accent-blue, #2f6feb);
    color: #ffffff;
    font-size: 0.75rem;
    line-height: 1.2;
}

.filters-toggle-icon {
    transition: transform 0.2s ease;
}

.filters-toggle-icon.is-open {
    transform: rotate(180deg);
}

.filters-content {
    padding: 10px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
    background: color-mix(in srgb, var(--panel-bg) 96%, var(--bg-color));
}

.sprint-info {
    display: grid;
    align-content: center;
    gap: 2px;
    min-height: 44px;
    padding: 6px 11px;
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--accent-blue) 28%, var(--border-color));
    border-radius: 11px;
    background: color-mix(in srgb, var(--accent-blue) 8%, var(--panel-bg));
    color: color-mix(in srgb, var(--accent-blue) 56%, var(--text-main));
    font-size: 0.8rem;
    text-align: left;
}

.sprint-info strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8rem;
    line-height: 1.2;
    font-weight: 750;
}

.timer {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    color: color-mix(in srgb, var(--accent-blue) 46%, var(--text-muted));
    font-size: 0.73rem;
    font-weight: 650;
}

.filters-bar {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    backdrop-filter: none;
}

.search-control,
.filter-group {
    min-height: 42px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
    background: color-mix(in srgb, var(--panel-bg) 90%, var(--bg-color));
}

.filter-group {
    padding: 12px;
}

.date-filter-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    white-space: nowrap;
}

.date-filter {
    min-width: 0;
}

@media (min-width: 768px) {
    .date-filter {
        flex: 0 0 115px;
        width: 115px;
    }
}

@media (max-width: 767px) {
    .date-filter-row {
        flex: 1 1 100%;
    }

    .date-filter {
        flex: 1 1 0;
        width: 100%;
    }
}

.search-control {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    padding: 0 12px;
    color: var(--text-muted, #6b6b6b);
}

.search-control input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-main);
    font: inherit;
    font-size: 0.92rem;
}

.board {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: clamp(calc(248px * var(--ui-scale)), 24vw, calc(320px * var(--ui-scale)));
    grid-auto-rows: minmax(0, 1fr);
    align-items: stretch;
    align-content: stretch;
    gap: calc(12px * var(--ui-scale));
    flex: 1;
    min-height: 0;
    padding: 0;
    margin: 0;
    max-width: none;
    background: transparent;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color) transparent;
}

.board>* {
    min-width: 0;
    min-height: 0;
}

.board :deep(.column) {
    height: 100%;
    max-height: 100%;
    min-height: 0;
}

.column-ghost {
    opacity: 0.5;
    transform: scale(0.98);
}

.board::-webkit-scrollbar {
    height: 9px;
}

.board::-webkit-scrollbar-track {
    background: transparent;
}

.board::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--border-color) 70%, var(--accent-blue));
    border-radius: 999px;
}

.modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(17, 17, 17, 0.48);
}

.modal-content {
    width: min(720px, 100%);
    max-height: min(760px, calc(100vh - 48px));
    overflow: auto;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 14px;
    background: var(--panel-bg);
}

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px;
    border-bottom: 1px solid var(--border-color, #e5e5e5);
}

.modal-header h2,
.description-section h3 {
    margin: 0;
}

.close-btn {
    width: 40px;
    height: 40px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
    background: transparent;
    color: var(--text-main);
    cursor: pointer;
}

.modal-body {
    display: grid;
    gap: 20px;
    padding: 22px;
}

.description-section {
    display: grid;
    gap: 10px;
}

.description-section p {
    margin: 0;
    color: var(--text-muted, #6b6b6b);
    line-height: 1.55;
}

.fields-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.field-item {
    display: grid;
    gap: 6px;
    padding: 14px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
}

.field-label {
    color: var(--text-muted, #6b6b6b);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
}

.field-value {
    min-width: 0;
    overflow-wrap: anywhere;
}

.form-field-input {
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 8px;
    background: var(--bg-color, transparent);
    color: var(--text-main);
    font: inherit;
    resize: vertical;
}

.form-field-input:focus {
    outline: none;
    border-color: var(--accent-blue, #2f6feb);
}

@media (max-width: 1100px) {

    .header-top,
    .header-actions,
    .filters-bar,
    .filter-group {
        align-items: stretch;
    }

    .header-top {
        grid-template-columns: 1fr;
        grid-template-areas:
            "meta"
            "title"
            "actions";
        align-items: stretch;
        padding: 16px 18px;
    }

    .header-actions {
        grid-template-columns: minmax(220px, 1fr) auto;
        width: 100%;
    }

    .sprint-info {
        text-align: left;
    }

    .timer {
        justify-content: flex-start;
    }

    .filters-bar {
        grid-template-columns: 1fr;
    }

    .filter-group {
        flex-wrap: wrap;
    }

    .filter-group select {
        flex: 1 1 180px;
        max-width: none;
    }
}

@media (max-width: 640px) {
    .board-view {
        --kanban-mobile-gap: 10px;
        align-self: stretch;
        width: auto;
        height: auto;
        min-height: 100%;
        overflow: visible;
        gap: var(--kanban-mobile-gap);
    }

    .board-workspace {
        grid-template-rows: auto auto;
        flex: 0 0 auto;
        gap: var(--kanban-mobile-gap);
        width: 100%;
        min-height: auto;
        padding: 0 0 var(--kanban-mobile-gap);
        overflow: visible;
    }

    .view-header {
        gap: var(--kanban-mobile-gap);
        padding: 0;
    }

    .header-top,
    .header-actions {
        gap: var(--kanban-mobile-gap);
    }

    .header-top {
        padding: 16px 18px;
        border-radius: 12px;
    }

    .header-actions {
        grid-template-columns: minmax(0, 1fr) minmax(128px, 40%);
    }

    .title-area {
        min-height: 0;
    }

    .title-row {
        flex-wrap: wrap;
        gap: 8px;
    }

    .title-meta {
        flex-wrap: wrap;
        gap: 7px;
    }

    .meta-divider {
        display: none;
    }

    .title-context {
        white-space: normal;
    }

    .eyebrow {
        margin-bottom: 4px;
        font-size: 0.68rem;
    }

    .title-area h1 {
        font-size: 1.8rem;
        line-height: 1.05;
        letter-spacing: -0.02em;
    }

    .summary-pill {
        padding: 2px 7px;
        font-size: 0.72rem;
    }

    .btn-primary {
        width: 100%;
        min-height: 46px;
        padding: 0 14px;
        border-radius: 10px;
        font-size: 0.94rem;
    }

    .sprint-info {
        width: 100%;
        gap: 3px;
        min-height: 44px;
        padding: 9px 12px;
        font-size: 0.88rem;
    }

    .timer {
        font-size: 0.82rem;
    }

    .header-bottom {
        display: grid;
        width: 100%;
        gap: var(--kanban-mobile-gap);
        min-height: auto;
        visibility: visible;
        opacity: 1;
    }

    .search-filter-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--kanban-mobile-gap);
    }

    .search-control,
    .filters-toggle,
    .filter-group {
        min-height: 44px;
    }

    .search-control {
        display: flex;
        width: 100%;
        padding-inline: 11px;
    }

    .filters-shell {
        display: grid;
        width: 100%;
        min-width: 0;
    }

    .filters-toggle {
        padding: 9px 10px;
        font-size: 0.92rem;
    }

    .filters-content {
        padding: 8px;
    }

    .filter-group {
        gap: var(--kanban-mobile-gap);
        padding: var(--kanban-mobile-gap);
    }

    .filter-group select,
    .date-filter {
        min-height: 38px;
        font-size: 0.84rem;
    }

    .board {
        flex: 0 0 auto;
        grid-auto-flow: row;
        grid-template-columns: minmax(0, 1fr);
        grid-auto-columns: unset;
        grid-auto-rows: auto;
        align-items: start;
        gap: var(--kanban-mobile-gap);
        padding: 0;
        overflow-x: hidden;
        overflow-y: visible;
    }

    .board :deep(.column) {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        height: auto;
        max-height: none;
        overflow: visible;
    }

    .board :deep(.task-list) {
        flex: 0 0 auto;
        overflow-y: visible;
    }

    .fields-grid {
        grid-template-columns: 1fr;
    }
}
</style>

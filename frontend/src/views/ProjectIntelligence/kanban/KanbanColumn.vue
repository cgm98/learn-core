<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Lock, Unlock } from 'lucide-vue-next'
import draggable from 'vuedraggable'

const props = defineProps({
    title: {
        type: String,
        required: true
    },
    tasks: {
        type: Array,
        default: () => []
    },
    pageSize: {
        type: Number,
        default: 10
    },
    isLocked: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['change', 'toggle-lock'])

const currentPage = ref(1)
const sentinel = ref(null)
let observer = null

const loadedLimit = computed(() => currentPage.value * props.pageSize)
const displayedTasks = computed(() => props.tasks.slice(0, loadedLimit.value))
const hasMoreTasks = computed(() => displayedTasks.value.length < props.tasks.length)

const taskSignature = computed(() => {
    const firstTask = props.tasks[0]
    const lastTask = props.tasks[props.tasks.length - 1]
    return `${props.title}:${props.tasks.length}:${firstTask?.id ?? ''}:${lastTask?.id ?? ''}`
})

const columnId = computed(() => {
    return `column-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
})

const columnToneClass = computed(() => {
    const normalizedTitle = props.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

    if (normalizedTitle.includes('planeacion')) return 'is-planning'
    if (normalizedTitle.includes('por hacer')) return 'is-todo'
    if (normalizedTitle.includes('progreso')) return 'is-progress'
    if (normalizedTitle.includes('revision')) return 'is-review'
    if (normalizedTitle.includes('finalizado')) return 'is-done'
    return 'is-default'
})

const loadMore = () => {
    if (hasMoreTasks.value) currentPage.value += 1
}

const cleanupObserver = () => {
    if (observer) {
        observer.disconnect()
        observer = null
    }
}

const setupObserver = async () => {
    cleanupObserver()
    await nextTick()

    if (!sentinel.value || typeof IntersectionObserver === 'undefined') return

    observer = new IntersectionObserver(
        (entries) => {
            if (entries[0]?.isIntersecting) loadMore()
        },
        { rootMargin: '120px 0px', threshold: 0.01 }
    )

    observer.observe(sentinel.value)
}

const resetPagination = () => {
    currentPage.value = 1
    setupObserver()
}

const onChange = (evt) => {
    emit('change', {
        ...evt,
        status: props.title,
        visibleCount: displayedTasks.value.length,
        totalCount: props.tasks.length
    })
}

onMounted(setupObserver)
onBeforeUnmount(cleanupObserver)
watch(taskSignature, resetPagination)
</script>

<template>
    <section class="column" :class="columnToneClass" :aria-labelledby="columnId">
        <div class="column-header">
            <h3 :id="columnId">
                <span class="column-title-text" :title="title">{{ title }}</span>
                <span class="count">{{ tasks.length }}</span>
            </h3>
            <div class="column-actions">
                <span v-if="hasMoreTasks" class="loaded-count" :title="`${displayedTasks.length} tareas cargadas de ${tasks.length}`">
                    {{ displayedTasks.length }}/{{ tasks.length }}
                </span>
                <button type="button" class="column-lock-btn" :class="{ locked: isLocked }"
                    :aria-label="isLocked ? `Desbloquear columna ${title}` : `Bloquear columna ${title}`"
                    @click="emit('toggle-lock', title)">
                    <Lock v-if="isLocked" :size="13" />
                    <Unlock v-else :size="13" />
                </button>
                <span class="column-drag-handle" :class="{ disabled: isLocked }"
                    :aria-hidden="isLocked ? 'true' : 'false'" :title="isLocked ? 'Columna bloqueada' : 'Arrastra para mover'">
                    :::
                </span>
            </div>
        </div>

        <div class="task-list">
            <draggable :model-value="displayedTasks" item-key="id" group="kanban" ghost-class="ghost" drag-class="drag"
                :animation="200" :delay="120" :delay-on-touch-only="true" :touch-start-threshold="6"
                class="draggable-container" @change="onChange">
                <template #item="{ element }">
                    <div class="draggable-item">
                        <slot :task="element"></slot>
                    </div>
                </template>

                <template #footer>
                    <div v-if="!tasks.length" class="empty-state">
                        Sin tareas en esta etapa
                    </div>
                </template>
            </draggable>

            <button v-if="hasMoreTasks" type="button" class="load-more" @click="loadMore">
                Cargar más tareas
            </button>

            <div ref="sentinel" class="sentinel" aria-hidden="true"></div>
        </div>
    </section>
</template>

<style scoped>
.column {
    --column-accent: var(--accent-blue, #2f6feb);
    --column-border: color-mix(in srgb, var(--column-accent) 42%, var(--border-color, #e5e5e5));
    --column-header-border: color-mix(in srgb, var(--column-accent) 24%, var(--border-color, #e5e5e5));

    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100%;
    max-height: 100%;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    flex-shrink: 1;
    padding: 0;
    overflow: hidden;
    border: 1.5px solid var(--column-border);
    border-radius: calc(12px * var(--ui-scale));
    background: var(--panel-bg);
    box-shadow: inset 0 3px 0 var(--column-accent);
}

.column.is-planning {
    --column-accent: #2563eb;
}

.column.is-todo {
    --column-accent: #4f46e5;
}

.column.is-progress {
    --column-accent: #0284c7;
}

.column.is-review {
    --column-accent: #d97706;
}

.column.is-done {
    --column-accent: #16a34a;
}

.column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(8px * var(--ui-scale));
    padding: calc(10px * var(--ui-scale));
    min-width: 0;
}

.column-header h3 {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: calc(6px * var(--ui-scale));
    min-width: 0;
    margin: 0;
    color: var(--text-main);
    font-size: 0.88rem;
    line-height: 1.2;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
}

.column-title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex-shrink: 1;
}

.count {
    flex-shrink: 0;
    min-width: 20px;
    padding: 2px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--column-accent) 12%, var(--border-color));
    color: color-mix(in srgb, var(--column-accent) 85%, var(--text-main));
    font-size: 0.78rem;
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
}

.loaded-count {
    white-space: nowrap;
    font-size: 0.72rem;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--border-color) 30%, transparent);
    padding: 2px 6px;
    border-radius: 6px;
    flex-shrink: 0;
}

.column-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
    flex-shrink: 0;
}

.column-lock-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--panel-bg) 88%, var(--bg-color));
    color: var(--text-main);
    cursor: pointer;
    padding: 0;
}

.column-lock-btn.locked {
    border-color: color-mix(in srgb, var(--accent-blue) 40%, var(--border-color));
    color: var(--accent-blue);
}

.column-drag-handle {
    display: inline-grid;
    place-items: center;
    width: 28px;
    min-height: 28px;
    border: 1px dashed var(--border-color);
    border-radius: 8px;
    color: var(--text-muted);
    line-height: 1;
    letter-spacing: 1px;
    font-weight: 700;
    cursor: grab;
    user-select: none;
}

.column-drag-handle.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.task-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: calc(10px * var(--ui-scale));
    gap: calc(8px * var(--ui-scale));
}

.draggable-container {
    display: grid;
    align-content: start;
    gap: calc(10px * var(--ui-scale));
    min-height: 0;
}

.draggable-item {
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
}

.draggable-item:active {
    cursor: grabbing;
}

.empty-state {
    display: grid;
    min-height: 96px;
    place-items: center;
    border: 1px dashed var(--border-color, #e5e5e5);
    border-radius: 10px;
    color: var(--text-muted, #6b6b6b);
    font-size: 0.9rem;
}

.load-more {
    margin-top: 2px;
    min-height: 38px;
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: 10px;
    background: transparent;
    color: var(--text-main);
    cursor: pointer;
    font-weight: 700;
}

.load-more:hover {
    border-color: var(--accent-blue, #2f6feb);
}

.sentinel {
    width: 100%;
    height: 1px;
    opacity: 0;
}

.task-list::-webkit-scrollbar {
    width: 9px;
}

.task-list::-webkit-scrollbar-track {
    background: color-mix(in srgb, var(--panel-bg) 80%, transparent);
}

.task-list::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--border-color) 75%, var(--accent-blue));
    border-radius: 999px;
}

.ghost {
    border: 2px dashed var(--accent-blue, #2f6feb);
    border-radius: 10px;
    background: var(--panel-bg);
    opacity: 0.55;
}

.drag {
    opacity: 1;
}

@media (max-width: 640px) {
    .column {
        height: auto;
        max-height: none;
        overflow: visible;
        border-radius: 10px;
    }

    .column-header {
        gap: var(--kanban-mobile-gap, 8px);
        padding: var(--kanban-mobile-gap, 8px);
    }

    .column-header h3 {
        gap: 6px;
        font-size: 0.88rem;
        letter-spacing: 0.5px;
    }

    .count {
        font-size: 0.75rem;
    }

    .column-actions {
        gap: calc(var(--kanban-mobile-gap, 8px) - 2px);
    }

    .column-lock-btn {
        min-height: 32px;
        padding: 0 10px;
        border-radius: 8px;
        font-size: 0.74rem;
    }

    .column-drag-handle {
        width: 32px;
        min-height: 32px;
        border-radius: 8px;
    }

    .task-list {
        flex: 0 0 auto;
        overflow-y: visible;
        gap: var(--kanban-mobile-gap, 8px);
        padding: var(--kanban-mobile-gap, 8px);
    }

    .draggable-container {
        gap: var(--kanban-mobile-gap, 8px);
    }

    .empty-state {
        min-height: 82px;
        border-radius: 9px;
        font-size: 0.82rem;
    }
}
</style>

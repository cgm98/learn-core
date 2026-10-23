<script setup>
import { computed } from 'vue'
import { Briefcase, ClipboardList, Code2, Edit, Trash2 } from 'lucide-vue-next'
import { getActiveSectionKey, isSectionFinished, SECTION_LABELS } from '../cronograma/useTimelineMath'

const props = defineProps({
    task: {
        type: Object,
        required: true
    }
})

// Chip de etapa del cronograma (sistemas/diseno/proyecto) — mismo cálculo que
// usa el Cronograma, para que el Tablero no sea una vista ciega a esa info.
const stageChip = computed(() => {
    if (!props.task.schedule || Object.keys(props.task.schedule).length === 0) return null
    const sectionKey = getActiveSectionKey(props.task)
    return {
        label: SECTION_LABELS[sectionKey] || sectionKey,
        finished: isSectionFinished(props.task, sectionKey)
    }
})

const emit = defineEmits(['delete', 'click', 'edit'])

const priorityMap = {
    1: { label: 'Alta', className: 'priority p1' },
    2: { label: 'Media', className: 'priority p2' },
    3: { label: 'Baja', className: 'priority p3' }
}

const priority = computed(() => {
    return priorityMap[props.task.progress] ?? {
        label: 'Sin asignar',
        className: 'priority p0'
    }
})

const title = computed(() => props.task.moduleDescription || 'Tarea sin título')
const description = computed(() => props.task.description || 'Sin descripción disponible')
const clientName = computed(() => props.task.clientName || 'Sin cliente')
const developerName = computed(() => props.task.systemOwner || 'N/A')
const ownerName = computed(() => props.task.implementer || 'N/A')

const openEdit = () => {
    emit('edit', props.task)
}

const openDetails = () => {
    emit('click', props.task)
}
</script>

<template>
    <article class="task-card" :class="{ 'is-high-priority': Number(task.progress) === 1 }" tabindex="0" role="button" :aria-label="`Abrir detalles de ${title}`"
        @click="openDetails" @keydown.enter.prevent="openDetails" @keydown.space.prevent="openDetails">
        <div class="card-actions" aria-label="Acciones de tarea" @keydown.stop>
            <button class="edit-task-btn" type="button" @click.stop="openEdit" :aria-label="`Editar ${title}`">
                <Edit :size="14" aria-hidden="true" />
            </button>
            <button class="delete-task-btn" type="button" @click.stop="emit('delete', task.id)"
                :aria-label="`Eliminar ${title}`">
                <Trash2 :size="14" aria-hidden="true" />
            </button>
        </div>

        <div class="card-header">
            <span :class="priority.className">{{ priority.label }}</span>
            <span v-if="stageChip" class="stage-chip" :class="{ 'is-finished': stageChip.finished }">
                {{ stageChip.label }}
            </span>
        </div>

        <div class="task-copy">
            <h4>{{ title }}</h4>
            <p>{{ description }}</p>
        </div>

        <div class="task-footer">
            <div class="task-meta">
                <div class="role-tag" title="Developer">
                    <Code2 :size="14" aria-hidden="true" />
                    <span class="name">{{ developerName }}</span>
                </div>
                <div class="role-tag" title="Product Owner">
                    <ClipboardList :size="14" aria-hidden="true" />
                    <span class="name">{{ ownerName }}</span>
                </div>
            </div>
            <div class="client-tag">
                <Briefcase :size="14" aria-hidden="true" />
                <span>{{ clientName }}</span>
            </div>
        </div>
    </article>
</template>

<style scoped>
.task-card {
    --task-chip-blue: var(--accent-blue, #2f6feb);
    --task-chip-bg: color-mix(in srgb, var(--task-chip-blue) 10%, var(--panel-bg));
    --task-chip-border: color-mix(in srgb, var(--task-chip-blue) 24%, var(--border-color, #e5e5e5));
    --task-chip-fg: color-mix(in srgb, var(--task-chip-blue) 72%, var(--text-main));
    --task-detail-bg: color-mix(in srgb, var(--panel-bg) 82%, var(--bg-color));
    --task-detail-border: transparent;
    --task-detail-fg: var(--text-main);
    --task-action-fg: var(--task-chip-blue);

    position: relative;
    display: grid;
    gap: calc(10px * var(--ui-scale));
    padding: calc(14px * var(--ui-scale));
    border: 1px solid var(--border-color, #e5e5e5);
    border-radius: calc(12px * var(--ui-scale));
    background: color-mix(in srgb, var(--panel-bg) 90%, var(--bg-color));
    color: var(--text-main);
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s ease, transform 0.2s ease;
}

.task-card:hover,
.task-card:focus-visible {
    border-color: var(--accent-blue, #2f6feb);
    transform: translateY(-1px);
}

.task-card.is-high-priority {
    --task-chip-blue: var(--danger, #dc2626);
    --task-chip-bg: color-mix(in srgb, var(--danger, #dc2626) 8%, var(--panel-bg));
    --task-chip-border: color-mix(in srgb, var(--danger, #dc2626) 34%, var(--border-color, #e5e5e5));
    --task-chip-fg: color-mix(in srgb, var(--danger, #dc2626) 82%, var(--text-main));
    --task-detail-bg: var(--task-chip-bg);
    --task-detail-border: var(--task-chip-border);
    --task-detail-fg: var(--task-chip-fg);
    --task-action-fg: var(--task-chip-fg);
    border-color: var(--danger, #dc2626);
}

.task-card.is-high-priority:hover,
.task-card.is-high-priority:focus-visible {
    border-color: var(--danger, #dc2626);
}

.card-actions {
    position: absolute;
    top: calc(10px * var(--ui-scale));
    right: calc(10px * var(--ui-scale));
    display: inline-flex;
    gap: calc(6px * var(--ui-scale));
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
}

.task-card:hover .card-actions,
.task-card:focus-within .card-actions {
    opacity: 1;
    pointer-events: auto;
}

.edit-task-btn,
.delete-task-btn {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: var(--panel-bg);
    border: 1px solid var(--border-color);
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    color: var(--task-action-fg);
    cursor: pointer;
}

.edit-task-btn:hover,
.delete-task-btn:hover {
    background: var(--bg-color);
    color: color-mix(in srgb, var(--task-action-fg) 86%, var(--text-main));
}

.card-header {
    display: flex;
    align-items: center;
    gap: calc(8px * var(--ui-scale));
}

.stage-chip {
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px dashed var(--border-color, #e5e5e5);
    color: var(--text-muted, #6b6b6b);
    font-size: 0.7rem;
    font-weight: 650;
}

.stage-chip.is-finished {
    border-style: solid;
    border-color: color-mix(in srgb, var(--success, #16a34a) 40%, var(--border-color));
    color: var(--success, #16a34a);
}

.priority,
.role-tag,
.client-tag {
    min-width: 0;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 500;
    line-height: 1.2;
}

.priority {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 8px;
    border: 1px solid transparent;
}

.priority {
    color: var(--text-main);
    background: color-mix(in srgb, var(--panel-bg) 82%, var(--bg-color));
}

.p1 {
    color: var(--danger, #dc2626);
}

.p2 {
    border-color: color-mix(in srgb, var(--warn, #b7791f) 28%, transparent);
    background: color-mix(in srgb, var(--warn, #b7791f) 12%, var(--panel-bg));
    color: color-mix(in srgb, var(--warn, #b7791f) 84%, var(--text-main));
}

.p3 {
    border-color: color-mix(in srgb, var(--success, #17a34a) 26%, transparent);
    background: color-mix(in srgb, var(--success, #17a34a) 11%, var(--panel-bg));
    color: color-mix(in srgb, var(--success, #17a34a) 82%, var(--text-main));
}

.task-card.is-high-priority .priority {
    border-color: var(--task-chip-border);
    background: var(--task-chip-bg);
    color: var(--task-chip-fg);
}

.task-copy {
    display: grid;
    gap: calc(5px * var(--ui-scale));
}

.task-card h4 {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-size: 0.98rem;
    line-height: 1.26;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.task-card.is-high-priority h4 {
    color: color-mix(in srgb, var(--danger, #dc2626) 82%, var(--text-main));
}

.task-card p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--text-muted, #6b6b6b);
    font-size: 0.88rem;
    line-height: 1.38;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}

.task-footer {
    display: grid;
    gap: calc(10px * var(--ui-scale));
}

.task-meta {
    display: grid;
    gap: calc(6px * var(--ui-scale));
}

.role-tag,
.client-tag {
    display: inline-flex;
    align-items: center;
    height: 24px;
    gap: 6px;
    border: 1px solid var(--task-detail-border);
    background: var(--task-detail-bg);
    color: var(--task-detail-fg);
}

.role-tag .name,
.client-tag span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.client-tag {
    width: fit-content;
    max-width: 100%;
    padding: 0 8px;
}

.role-tag {
    padding: 0 8px;
}
</style>

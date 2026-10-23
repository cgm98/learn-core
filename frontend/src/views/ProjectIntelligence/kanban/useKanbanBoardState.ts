import { computed, isRef, ref, unref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type FilterState = {
    dev?: string
    po?: string
    client?: string
}

type TaskRecord = Record<string, unknown> & {
    id?: string | number
    moduleDescription?: string
    description?: string
    clientName?: string
    systemOwner?: string
    implementer?: string
}

type MaybeRefValue<T> = T | Ref<T>

type UseKanbanBoardStateOptions = {
    columns: string[]
    filters: MaybeRefValue<FilterState>
    globalUrgencyFilter: MaybeRefValue<string>
    getTasksByStatus: (status: string) => ComputedRef<TaskRecord[]>
    storageKey?: string
}

const DEFAULT_STORAGE_KEY = 'business-kanban-board:v1'
const FILTER_KEYS: Array<keyof FilterState> = ['dev', 'po', 'client']

const normalize = (value: unknown) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()

const getFilterTarget = (filters: UseKanbanBoardStateOptions['filters']) =>
    isRef(filters) ? filters.value : filters

const getTasksArray = (
    getTasksByStatus: UseKanbanBoardStateOptions['getTasksByStatus'],
    status: string
) => {
    const tasks = getTasksByStatus(status).value
    return Array.isArray(tasks) ? tasks : []
}

const readStoredState = (storageKey: string) => {
    if (typeof window === 'undefined') return null

    try {
        const rawValue = window.localStorage.getItem(storageKey)
        return rawValue ? JSON.parse(rawValue) : null
    } catch {
        return null
    }
}

const writeStoredState = (storageKey: string, payload: unknown) => {
    if (typeof window === 'undefined') return

    try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {
        // Local storage can be unavailable in private or embedded contexts.
    }
}

export function useKanbanBoardState({
    columns,
    filters,
    globalUrgencyFilter,
    getTasksByStatus,
    storageKey = DEFAULT_STORAGE_KEY
}: UseKanbanBoardStateOptions) {
    const searchQuery = ref('')
    const hasHydratedPreferences = ref(false)

    const filterSnapshot = computed(() => {
        const target = getFilterTarget(filters) ?? {}

        return FILTER_KEYS.reduce<Required<FilterState>>((snapshot, key) => {
            snapshot[key] = String(target[key] ?? '')
            return snapshot
        }, { dev: '', po: '', client: '' })
    })

    const tasksByStatus = computed<Record<string, TaskRecord[]>>(() => {
        return columns.reduce<Record<string, TaskRecord[]>>((groups, status) => {
            groups[status] = getTasksArray(getTasksByStatus, status)
            return groups
        }, {})
    })

    const matchesSearch = (task: TaskRecord) => {
        const query = normalize(searchQuery.value)
        if (!query) return true

        return [
            task.moduleDescription,
            task.description,
            task.clientName,
            task.systemOwner,
            task.implementer
        ].some((value) => normalize(value).includes(query))
    }

    const visibleTasksByStatus = computed<Record<string, TaskRecord[]>>(() => {
        return columns.reduce<Record<string, TaskRecord[]>>((groups, status) => {
            groups[status] = (tasksByStatus.value[status] ?? []).filter(matchesSearch)
            return groups
        }, {})
    })

    const totalTaskCount = computed(() => {
        return columns.reduce((total, status) => total + (tasksByStatus.value[status]?.length ?? 0), 0)
    })

    const visibleTaskCount = computed(() => {
        return columns.reduce(
            (total, status) => total + (visibleTasksByStatus.value[status]?.length ?? 0),
            0
        )
    })

    const activeFilterCount = computed(() => {
        const baseFilters = Object.values(filterSnapshot.value).filter(Boolean).length
        const urgency = unref(globalUrgencyFilter)
        const urgencyCount = urgency && urgency !== 'todos' ? 1 : 0
        const searchCount = searchQuery.value.trim() ? 1 : 0

        return baseFilters + urgencyCount + searchCount
    })

    const hasActiveFilters = computed(() => activeFilterCount.value > 0)

    const hydratePreferences = () => {
        const storedState = readStoredState(storageKey)
        if (!storedState || typeof storedState !== 'object') {
            hasHydratedPreferences.value = true
            return
        }

        const target = getFilterTarget(filters)
        if (target && typeof target === 'object') {
            for (const key of FILTER_KEYS) {
                if (typeof storedState.filters?.[key] === 'string') {
                    target[key] = storedState.filters[key]
                }
            }
        }

        if (typeof storedState.globalUrgencyFilter === 'string' && isRef(globalUrgencyFilter)) {
            globalUrgencyFilter.value = storedState.globalUrgencyFilter
        }

        if (typeof storedState.searchQuery === 'string') {
            searchQuery.value = storedState.searchQuery
        }

        hasHydratedPreferences.value = true
    }

    const resetFilters = () => {
        const target = getFilterTarget(filters)
        if (target && typeof target === 'object') {
            for (const key of FILTER_KEYS) {
                target[key] = ''
            }
        }

        if (isRef(globalUrgencyFilter)) {
            globalUrgencyFilter.value = 'todos'
        }

        searchQuery.value = ''
    }

    watch(
        () => ({
            filters: filterSnapshot.value,
            globalUrgencyFilter: unref(globalUrgencyFilter),
            searchQuery: searchQuery.value
        }),
        (payload) => {
            if (!hasHydratedPreferences.value) return
            writeStoredState(storageKey, payload)
        },
        { deep: true }
    )

    return {
        searchQuery,
        tasksByStatus,
        visibleTasksByStatus,
        totalTaskCount,
        visibleTaskCount,
        activeFilterCount,
        hasActiveFilters,
        hydratePreferences,
        resetFilters
    }
}

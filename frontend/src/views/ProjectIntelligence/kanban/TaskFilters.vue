<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown, Filter, RotateCcw } from 'lucide-vue-next'

const props = defineProps({
  filters: { type: Object, required: true },
  globalUrgencyFilter: { type: String, required: true },
  filterOptions: { type: Object, required: true },
  hasActiveFilters: { type: Boolean, required: true },
  activeFilterCount: { type: Number, required: true }
})

const emit = defineEmits(['update:globalUrgencyFilter', 'reset'])

const containerRef = ref(null)
const areFiltersOpen = ref(false)

const handleOutsideClick = (event) => {
  if (areFiltersOpen.value && containerRef.value && !containerRef.value.contains(event.target)) {
    areFiltersOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})

const handleReset = () => {
  emit('reset')
  areFiltersOpen.value = false
}

const FILTER_SELECTS = [
  { key: 'dev', label: 'Desarrollador (Dev)' },
  { key: 'po', label: 'Product Owner (PO)' },
  { key: 'client', label: 'Cliente' },
]

const URGENCY_OPTIONS = [
  { value: 'todos', label: 'Todas las urgencias' },
  { value: 'urgente', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
]

const urgencyValue = computed({
  get: () => props.globalUrgencyFilter,
  set: (val) => emit('update:globalUrgencyFilter', val)
})
</script>

<template>
  <div class="filters-container" ref="containerRef">
    <div class="filter-controls-row">
      <button class="filters-toggle-btn" type="button" :class="{ 'is-active': areFiltersOpen }" @click="areFiltersOpen = !areFiltersOpen">
        <Filter :size="15" />
        <span>Filtros avanzados</span>
        <span v-if="hasActiveFilters" class="filter-badge">{{ activeFilterCount }}</span>
        <ChevronDown :size="15" class="chevron-icon" :class="{ 'is-open': areFiltersOpen }" />
      </button>
    </div>

    <Transition name="expand-filters">
      <div v-if="areFiltersOpen" class="filters-expanded-panel">
        <div class="filters-grid">
          <div class="filter-field">
            <span class="field-label">Fecha Inicio</span>
            <input type="date" v-model="filters.dateStart" class="filter-input-date" />
          </div>
          
          <div class="filter-field">
            <span class="field-label">Fecha Fin</span>
            <input type="date" v-model="filters.dateEnd" class="filter-input-date" />
          </div>

          <div v-for="config in FILTER_SELECTS" :key="config.key" class="filter-field">
            <span class="field-label">{{ config.label }}</span>
            <select v-model="filters[config.key]" class="filter-select">
              <option value="">Todos</option>
              <option v-for="opt in filterOptions[config.key]" :key="opt.value !== undefined ? opt.value : opt" :value="opt.value !== undefined ? opt.value : opt">
                {{ opt.label !== undefined ? opt.label : opt }}
              </option>
            </select>
          </div>

          <div class="filter-field">
            <span class="field-label">Urgencia</span>
            <select v-model="urgencyValue" class="filter-select">
              <option v-for="opt in URGENCY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <div v-if="hasActiveFilters" class="filter-field filter-actions">
            <span class="field-label">&nbsp;</span>
            <button class="reset-filters-btn-inline" type="button" @click="handleReset">
              <RotateCcw :size="13" />
              <span>Limpiar filtros</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.filters-container {
  position: relative;
  display: grid;
  gap: 12px;
  width: 100%;
}

.filter-controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filters-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filters-toggle-btn:hover,
.filters-toggle-btn.is-active {
  border-color: var(--accent-blue, #2f6feb);
  background: color-mix(in srgb, var(--accent-blue, #2f6feb) 6%, var(--panel-bg));
}

.chevron-icon {
  transition: transform 0.2s ease;
}

.chevron-icon.is-open {
  transform: rotate(180deg);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--accent-blue, #2f6feb);
  color: #fff;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}

.reset-filters-btn-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  box-sizing: border-box;
}

.reset-filters-btn-inline:hover {
  border-color: var(--danger, #dc2626);
  color: var(--danger, #dc2626);
  background: color-mix(in srgb, var(--danger, #dc2626) 6%, var(--panel-bg));
}

.filters-expanded-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: auto;
  z-index: 100;
  width: 720px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 16px;
  background: color-mix(in srgb, var(--panel-bg) 98%, var(--bg-color));
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.02);
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.filter-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.field-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.filter-input-date,
.filter-select {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 10px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
  font-size: 0.85rem;
  outline: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.filter-input-date:focus,
.filter-select:focus {
  border-color: var(--accent-blue, #2f6feb);
}

.expand-filters-enter-active,
.expand-filters-leave-active {
  transition: all 0.25s ease;
}

.expand-filters-enter-from,
.expand-filters-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

<script setup lang="ts">
// Agrupa el material de consulta/auditoría (no trabajo activo) que antes eran
// 4 tabs peer de Tablero: Bitácora, Decisiones, Historial y Grafo. Ver plan
// "Rediseño de IA de /intelligence".
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { NotebookPen, Landmark, History, Network } from 'lucide-vue-next';
import BitacoraView from './BitacoraView.vue';
import DecisionesView from './DecisionesView.vue';
import TimelineView from './TimelineView.vue';
import DualGraphView from './DualGraphView.vue';

const props = defineProps<{ projectId: string }>();
const route = useRoute();

const SUBTABS = [
  { id: 'bitacora', label: 'Bitácora', icon: NotebookPen },
  { id: 'decisiones', label: 'Decisiones', icon: Landmark },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'grafo', label: 'Grafo', icon: Network }
] as const;

// Desde Resumen: "Decisiones propuestas" navega con ?doc=decisiones para
// caer directo en ese subtab en vez del default.
const activeSubtab = ref<'bitacora' | 'decisiones' | 'historial' | 'grafo'>(
  (route.query.doc as any) || 'bitacora'
);
</script>

<template>
  <div class="documentacion-view">
    <div class="doc-subtabs">
      <button v-for="tab in SUBTABS" :key="tab.id" :class="{ active: activeSubtab === tab.id }" @click="activeSubtab = tab.id">
        <component :is="tab.icon" :size="15" />
        {{ tab.label }}
      </button>
    </div>

    <BitacoraView v-if="activeSubtab === 'bitacora'" :project-id="projectId" />
    <DecisionesView v-else-if="activeSubtab === 'decisiones'" :project-id="projectId" />
    <TimelineView v-else-if="activeSubtab === 'historial'" :project-id="projectId" />
    <DualGraphView v-else-if="activeSubtab === 'grafo'" :project-id="projectId" />
  </div>
</template>

<style scoped>
.documentacion-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.doc-subtabs {
  display: flex;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  padding: 4px;
  width: fit-content;
}

.doc-subtabs button {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 7px 16px;
  border-radius: var(--r-sm, 6px);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.15s;
}

.doc-subtabs button:hover {
  color: var(--fg);
}

.doc-subtabs button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
</style>

<script setup lang="ts">
// Grafo de ESTE proyecto (Project -> Tasks/Issues/Decisions/Memories). Antes
// tenía un toggle "Conocimiento general" que en realidad mostraba el grafo
// global de notas del vault (otro dominio de datos, sin relación con este
// proyecto) — se saca de acá; ese grafo ya vive en /graph. Ver plan
// "Rediseño de Grafo".
import { ref, onMounted, watch } from 'vue';
import { IntelligenceService, type GraphData, type GraphNode } from '../../services/intelligence.service.js';
import ProjectGraph from './ProjectGraph.vue';

const props = defineProps<{
  projectId: string;
}>();

const loading = ref(false);
const graph = ref<GraphData>({ nodes: [], edges: [] });
const selectedNode = ref<GraphNode | null>(null);

const LEGEND = [
  { type: 'project', label: 'Proyecto', color: '#6366f1' },
  { type: 'task', label: 'Tarea', color: '#2f6feb' },
  { type: 'issue', label: 'Issue', color: '#dc2626' },
  { type: 'decision', label: 'Decisión', color: '#d97706' },
  { type: 'memory', label: 'Memoria', color: '#6b7280' }
];

async function loadGraph() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await IntelligenceService.getLocalGraph(props.projectId);
    graph.value = res.data;
    selectedNode.value = null;
  } catch (err) {
    console.error('Error loading project graph:', err);
  } finally {
    loading.value = false;
  }
}

function selectNode(node: GraphNode) {
  selectedNode.value = node;
}

watch(() => props.projectId, () => {
  loadGraph();
});

onMounted(() => {
  loadGraph();
});
</script>

<template>
  <div class="dual-graph-view">
    <div class="graph-toolbar">
      <span class="graph-summary">
        Total nodos: <strong>{{ graph.nodes.length }}</strong> | Total relaciones: <strong>{{ graph.edges.length }}</strong>
      </span>
      <div class="graph-legend">
        <span v-for="item in LEGEND" :key="item.type" class="legend-item">
          <span class="legend-dot" :style="{ background: item.color }"></span>
          {{ item.label }}
        </span>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Construyendo grafo del proyecto...</p>
    </div>

    <div v-else class="graph-layout">
      <ProjectGraph :nodes="graph.nodes" :edges="graph.edges" @open="selectNode" />

      <div class="node-inspector">
        <div v-if="selectedNode" class="inspector-card">
          <h3>{{ selectedNode.label }}</h3>
          <div class="inspector-row">
            <span class="label">Tipo:</span>
            <span class="val">{{ selectedNode.type }}</span>
          </div>
          <div v-if="selectedNode.status" class="inspector-row">
            <span class="label">Estado:</span>
            <span class="val">{{ selectedNode.status }}</span>
          </div>

          <div class="connected-edges">
            <h4>Relaciones conectadas:</h4>
            <div class="edge-list">
              <div
                v-for="(edge, idx) in graph.edges.filter(e => e.source === selectedNode?.id || e.target === selectedNode?.id)"
                :key="idx"
                class="edge-item"
              >
                <span class="rel-tag">{{ edge.relation }}</span>
                <span class="rel-target">{{ edge.source === selectedNode?.id ? '→ ' + edge.target : '← ' + edge.source }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="inspector-placeholder">
          <p>Hacé click en un nodo del grafo para ver sus relaciones.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dual-graph-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.graph-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--surface);
  padding: 12px 18px;
  border-radius: var(--r-lg, 12px);
  border: 1px solid var(--border);
}

.graph-summary {
  font-size: 13px;
  color: var(--muted);
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.loading-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}

.graph-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  align-items: start;
}

.node-inspector {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 18px;
  min-height: 200px;
}

.inspector-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
  color: var(--fg);
}

.inspector-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.inspector-row .label {
  color: var(--muted);
}

.inspector-row .val {
  color: var(--fg);
  font-weight: 600;
  text-align: right;
}

.connected-edges {
  margin-top: 14px;
}

.connected-edges h4 {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.edge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edge-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 6px 8px;
  background: var(--bg);
  border-radius: var(--r-sm, 6px);
}

.rel-tag {
  font-family: var(--font-mono);
  color: var(--accent);
}

.rel-target {
  color: var(--muted);
}

.inspector-placeholder {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  padding: 40px 10px;
}

@media (max-width: 900px) {
  .graph-layout {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { IntelligenceService, type TimelineEvent } from '../../services/intelligence.service.js';

const props = defineProps<{
  projectId: string;
}>();

const loading = ref(false);
const events = ref<TimelineEvent[]>([]);
const selectedActor = ref<string>('all');
const selectedEntityType = ref<string>('all');
const expandedEventId = ref<string | null>(null);

async function loadTimeline() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await IntelligenceService.getTimeline(props.projectId, 100);
    events.value = res.data;
  } catch (err) {
    console.error('Error loading timeline events:', err);
  } finally {
    loading.value = false;
  }
}

const filteredEvents = computed(() => {
  return events.value.filter(evt => {
    const matchActor = selectedActor.value === 'all' || evt.actor === selectedActor.value;
    const matchType = selectedEntityType.value === 'all' || evt.entity_type === selectedEntityType.value;
    return matchActor && matchType;
  });
});

function toggleExpand(id: string) {
  expandedEventId.value = expandedEventId.value === id ? null : id;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

watch(() => props.projectId, () => {
  loadTimeline();
});

onMounted(() => {
  loadTimeline();
});
</script>

<template>
  <div class="timeline-view">
    <div class="timeline-controls">
      <div class="filter-group">
        <label>Actor:</label>
        <select v-model="selectedActor">
          <option value="all">Todos los Actores</option>
          <option value="human">Human</option>
          <option value="agent:pm">Agent: PM</option>
          <option value="agent:dev">Agent: Dev</option>
          <option value="system">System</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Entidad:</label>
        <select v-model="selectedEntityType">
          <option value="all">Todas las Entidades</option>
          <option value="task">Tasks</option>
          <option value="issue">Issues</option>
          <option value="decision">Decisions</option>
          <option value="daily_note">Daily Notes</option>
          <option value="project">Projects</option>
          <option value="report">Reports</option>
        </select>
      </div>

      <div class="event-count">
        <span>Mostrando <strong>{{ filteredEvents.length }}</strong> de {{ events.length }} eventos</span>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando log inmutable de eventos...</p>
    </div>

    <div v-else-if="filteredEvents.length === 0" class="empty-state">
      <p>No se encontraron eventos registrados para los filtros seleccionados.</p>
    </div>

    <div v-else class="event-stream">
      <div
        v-for="evt in filteredEvents"
        :key="evt.id"
        class="event-node"
        :class="{ expanded: expandedEventId === evt.id }"
        @click="toggleExpand(evt.id)"
      >
        <div class="event-rail">
          <div class="rail-point" :class="evt.entity_type"></div>
          <div class="rail-line"></div>
        </div>

        <div class="event-card">
          <div class="event-header">
            <div class="type-and-actor">
              <span class="event-type-badge">{{ evt.type }}</span>
              <span class="actor-badge" :class="evt.actor.replace(':', '-')">{{ evt.actor }}</span>
            </div>
            <div class="event-time">
              <span>{{ formatDate(evt.timestamp) }}</span>
              <span class="r13-tag">[EVENT#{{ evt.id }}]</span>
            </div>
          </div>

          <div class="event-summary">
            <span class="entity-ref">{{ evt.entity_type }}: <strong>{{ evt.entity_id }}</strong></span>
            <span v-if="evt.payload?.title" class="payload-title"> — "{{ evt.payload.title }}"</span>
            <span v-else-if="evt.payload?.name" class="payload-title"> — "{{ evt.payload.name }}"</span>
            <span v-else-if="evt.payload?.from_status" class="payload-title"> ({{ evt.payload.from_status }} → {{ evt.payload.to_status }})</span>
          </div>

          <div v-if="expandedEventId === evt.id" class="event-payload-inspector">
            <h4>Payload JSON Detallado:</h4>
            <pre>{{ JSON.stringify(evt.payload, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.timeline-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  background: var(--surface);
  padding: 14px 20px;
  border-radius: var(--r-lg, 12px);
  border: 1px solid var(--border);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-size: 13px;
  color: var(--muted);
}

.filter-group select {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 12px;
  border-radius: var(--r-sm, 6px);
  font-size: 13px;
}

.event-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--muted);
}

.loading-state, .empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}

.event-stream {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-node {
  display: flex;
  gap: 16px;
  cursor: pointer;
}

.event-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
}

.rail-point {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 3px solid var(--bg);
  margin-top: 6px;
}

.rail-point.task { background: var(--accent); }
.rail-point.issue { background: var(--danger); }
.rail-point.decision { background: var(--warning); }
.rail-point.daily_note { background: var(--success); }
.rail-point.project { background: var(--c-secondary, #8b5cf6); }

.rail-line {
  flex: 1;
  width: 2px;
  background: var(--border);
  margin-top: 4px;
}

.event-card {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  padding: 12px 16px;
  transition: border-color 0.15s;
}

.event-node:hover .event-card {
  border-color: var(--accent);
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.type-and-actor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-type-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}

.actor-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
}

.actor-badge.human { color: var(--accent); border-color: var(--accent); }
.actor-badge.agent-pm { color: var(--c-secondary, #8b5cf6); border-color: var(--c-secondary, #8b5cf6); }
.actor-badge.agent-dev { color: var(--success); border-color: var(--success); }

.event-time {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.r13-tag {
  font-family: var(--font-mono);
  color: var(--muted);
}

.event-summary {
  font-size: 13px;
  color: var(--fg);
}

.entity-ref {
  color: var(--muted);
}

.payload-title {
  color: var(--fg);
}

.event-payload-inspector {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.event-payload-inspector h4 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--muted);
}

.event-payload-inspector pre {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 10px;
  border-radius: var(--r-sm, 6px);
  font-size: 12px;
  color: var(--fg);
  overflow-x: auto;
}
</style>

<script setup lang="ts">
// Bitácora: reemplaza el hueco de "Conocimiento general" (sección 4 del plan
// de rediseño) — nota libre por día, la IA extrae menciones a tareas/issues/
// decisiones. El backend (createDailyNote) ya existía y no tenía ninguna UI.
import { ref, onMounted, watch, computed } from 'vue';
import { IntelligenceService, type DailyNote } from '../../services/intelligence.service.js';
import { ClipboardList, Bug, Landmark, Link2, BookOpen } from 'lucide-vue-next';

const props = defineProps<{
  projectId: string;
}>();

const ENTITY_ICON: Record<string, any> = {
  task: ClipboardList,
  issue: Bug,
  decision: Landmark,
  knowledge: Link2,
  memory: BookOpen
};

const loading = ref(false);
const saving = ref(false);
const notes = ref<DailyNote[]>([]);
const today = new Date().toISOString().slice(0, 10);
const noteDate = ref(today);
const noteText = ref('');

const todayNote = computed(() => notes.value.find(n => n.date === noteDate.value));

async function loadNotes() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const res = await IntelligenceService.getDailyNotes(props.projectId);
    notes.value = res.data;
    const existing = notes.value.find(n => n.date === noteDate.value);
    if (existing) noteText.value = existing.raw_markdown;
  } catch (err) {
    console.error('Error loading daily notes:', err);
  } finally {
    loading.value = false;
  }
}

async function saveNote() {
  if (!noteText.value.trim() || !props.projectId) return;
  saving.value = true;
  try {
    await IntelligenceService.createDailyNote(props.projectId, noteDate.value, noteText.value.trim());
    await loadNotes();
  } catch (err) {
    console.error('Error saving daily note:', err);
  } finally {
    saving.value = false;
  }
}

watch(noteDate, () => {
  const existing = notes.value.find(n => n.date === noteDate.value);
  noteText.value = existing?.raw_markdown || '';
});

watch(() => props.projectId, () => {
  loadNotes();
});

onMounted(() => {
  loadNotes();
});
</script>

<template>
  <div class="bitacora-view">
    <div class="note-editor">
      <div class="note-editor-header">
        <input v-model="noteDate" type="date" />
        <span v-if="todayNote" class="already-logged-tag">Ya hay una nota este día — guardar la reemplaza</span>
      </div>
      <textarea
        v-model="noteText"
        rows="4"
        placeholder="¿Qué se avanzó hoy? Mencioná @task: título, @issue: título o @decision: título para que quede vinculado, o [[Nombre]] para un link libre."
      ></textarea>
      <button :disabled="!noteText.trim() || saving" @click="saveNote">
        {{ saving ? 'Guardando...' : 'Guardar nota del día' }}
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando bitácora...</p>
    </div>

    <div v-else-if="notes.length === 0" class="empty-state">
      <p>Todavía no hay ninguna nota registrada para este proyecto.</p>
    </div>

    <div v-else class="notes-feed">
      <div v-for="note in notes" :key="note.id" class="note-card">
        <div class="note-header">
          <span class="note-date">{{ note.date }}</span>
          <span class="r13-tag">[DAILY_NOTE:{{ note.id }}]</span>
        </div>
        <p class="note-raw">{{ note.raw_markdown }}</p>
        <div v-if="note.extracted.length" class="extracted-list">
          <span v-for="(item, idx) in note.extracted" :key="idx" class="extracted-chip">
            <component :is="ENTITY_ICON[item.entity_type] || BookOpen" :size="12" />
            {{ item.summary }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bitacora-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.note-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 16px 18px;
}

.note-editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.note-editor-header input {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 8px 12px;
  border-radius: var(--r-md, 8px);
}

.already-logged-tag {
  font-size: 12px;
  color: var(--warning);
}

.note-editor textarea {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 10px 14px;
  border-radius: var(--r-md, 8px);
  font-family: inherit;
  resize: vertical;
}

.note-editor textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.note-editor button {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: var(--r-md, 8px);
  font-weight: 600;
  cursor: pointer;
}

.note-editor button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-state, .empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}

.notes-feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 16px;
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.note-date {
  font-weight: 700;
  color: var(--fg);
  font-size: 13px;
}

.r13-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

.note-raw {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
  white-space: pre-wrap;
}

.extracted-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.extracted-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--fg);
}
</style>

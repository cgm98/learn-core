<script setup lang="ts">
import { ref, watch } from 'vue';
import { History, Save } from 'lucide-vue-next';
import { usePlanStore } from '../../stores/plan.store';
import { useToast } from '../../composables/useToast';
import type { Plan, PlanStatus } from '../../types/plan.types';
import VersionHistory from '../../components/VersionHistory/Index.vue';

const props = defineProps<{ plan: Plan }>();

const planStore = usePlanStore();
const toast = useToast();

const title = ref(props.plan.title);
const content = ref(props.plan.content);
const status = ref<PlanStatus>(props.plan.status);
const saving = ref(false);
const showHistory = ref(false);

watch(() => props.plan.id, () => {
  title.value = props.plan.title;
  content.value = props.plan.content;
  status.value = props.plan.status;
  showHistory.value = false;
});

const dirty = () => title.value !== props.plan.title || content.value !== props.plan.content || status.value !== props.plan.status;

const handleSave = async () => {
  saving.value = true;
  try {
    await planStore.updatePlan(props.plan.id, { title: title.value, content: content.value, status: status.value });
    toast.success('Plan guardado');
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo guardar el plan');
  } finally {
    saving.value = false;
  }
};

const onRestored = (updated: Plan | { title: string; content?: string }) => {
  title.value = updated.title;
  if ('content' in updated && updated.content !== undefined) content.value = updated.content;
};
</script>

<template>
  <div class="plan-panel">
    <div class="plan-panel-header">
      <input v-model="title" class="plan-title-input" placeholder="Título del plan" />
      <select v-model="status" class="plan-status-select">
        <option value="draft">Borrador</option>
        <option value="active">Activo</option>
        <option value="completed">Completado</option>
        <option value="archived">Archivado</option>
      </select>
      <button class="btn-icon-add" title="Historial de versiones" @click="showHistory = true">
        <History :size="15" />
      </button>
      <button class="btn-modal-confirm" :disabled="!dirty() || saving" @click="handleSave">
        <Save :size="13" /> Guardar
      </button>
    </div>
    <textarea v-model="content" class="plan-content-textarea" placeholder="Contenido del plan (markdown)..."></textarea>

    <VersionHistory
      v-if="showHistory"
      kind="plan"
      :concept-id="plan.id"
      :current-content="content"
      :current-title="title"
      @close="showHistory = false"
      @restored="onRestored"
    />
  </div>
</template>

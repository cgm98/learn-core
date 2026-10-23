<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { IntelligenceService, type IntelligenceProject } from '../../services/intelligence.service.js';
import WorkspaceView from './WorkspaceView.vue';
import TrabajoView from './TrabajoView.vue';
import DocumentacionView from './DocumentacionView.vue';
import { Zap, LayoutDashboard, Kanban, BookMarked, FolderGit2 } from 'lucide-vue-next';

// 3 tabs por función, no por tipo de entidad — ver plan "Rediseño de IA de
// /intelligence". Tablero fusiona Kanban+Cronograma+triage de bugs;
// Documentación agrupa Bitácora/Decisiones/Historial/Grafo.
const TABS = [
  { id: 'workspace', label: 'Resumen', icon: LayoutDashboard },
  { id: 'kanban', label: 'Tablero', icon: Kanban },
  { id: 'documentacion', label: 'Documentación', icon: BookMarked }
] as const;

const router = useRouter();
const route = useRoute();

// La lista de proyectos es el mismo registro sandbox que administra /projects
// (ProjectSandbox) — no hay un "crear proyecto" acá; se registran allá.
const projects = ref<IntelligenceProject[]>([]);
const selectedProjectId = ref<string>('');
const currentViewTab = ref<'workspace' | 'kanban' | 'documentacion'>(
  (route.query.tab as any) || 'workspace'
);
const loading = ref(false);

// El grupo "PM" del sidebar (App.vue) linkea directo a /intelligence?tab=kanban
// y /intelligence?tab=documentacion — sincronizar la tab activa con el query
// param para que esos links caigan en la vista correcta.
watch(
  () => route.query.tab,
  (tab) => {
    if (tab) currentViewTab.value = tab as any;
  }
);

async function loadProjects() {
  loading.value = true;
  try {
    const res = await IntelligenceService.getProjects();
    projects.value = res.data;
    if (projects.value.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = projects.value[0].id;
    }
  } catch (err) {
    console.error('Error loading intelligence projects:', err);
  } finally {
    loading.value = false;
  }
}

function goToProjectSandbox() {
  router.push('/projects');
}

onMounted(() => {
  loadProjects();
});
</script>

<template>
  <div class="intelligence-hub">
    <!-- Header with Project Selector & Primary Tabs -->
    <header class="hub-header">
      <div class="header-left">
        <div class="hub-branding">
          <span class="hub-icon"><Zap :size="20" /></span>
          <div>
            <h1>Project Intelligence</h1>
            <span class="hub-sub">Estado, historial y conocimiento del proyecto</span>
          </div>
        </div>

        <div class="project-selector-wrapper">
          <label>Proyecto:</label>
          <select v-model="selectedProjectId" class="project-dropdown">
            <option v-for="p in projects" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
          <button class="add-proj-btn" title="Registrar un proyecto nuevo en Proyectos Sandbox" @click="goToProjectSandbox">
            <FolderGit2 :size="14" /> Proyectos
          </button>
        </div>
      </div>

      <nav class="hub-nav">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          :class="{ active: currentViewTab === tab.id }"
          @click="currentViewTab = tab.id"
        >
          <component :is="tab.icon" :size="15" />
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <!-- Main View Content -->
    <main class="hub-content">
      <div v-if="!selectedProjectId && !loading" class="empty-projects-state">
        <p>No tenés ningún proyecto registrado en Proyectos Sandbox todavía.</p>
        <button class="cta-btn" @click="goToProjectSandbox">Registrar mi primer proyecto</button>
      </div>

      <template v-else-if="selectedProjectId">
        <WorkspaceView v-if="currentViewTab === 'workspace'" :project-id="selectedProjectId" />
        <TrabajoView v-else-if="currentViewTab === 'kanban'" :project-id="selectedProjectId" />
        <DocumentacionView v-else-if="currentViewTab === 'documentacion'" :project-id="selectedProjectId" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.intelligence-hub {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  color: var(--fg);
}

.hub-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  padding: 20px 24px;
}

.header-left {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.hub-branding {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hub-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--accent);
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--r-md, 8px);
  flex-shrink: 0;
}

.hub-branding h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--fg);
}

.hub-sub {
  font-size: 13px;
  color: var(--muted);
}

.project-selector-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-selector-wrapper label {
  font-size: 13px;
  color: var(--muted);
}

.project-dropdown {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 8px 14px;
  border-radius: var(--r-md, 8px);
  font-size: 14px;
  min-width: 220px;
}

.add-proj-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: var(--r-md, 8px);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.15s;
}

.add-proj-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Un solo grupo de pestañas, en el orden en que se usan: primero el resumen,
   después dónde se trabaja (tablero), después el historial, y por último el
   grafo — que es exploración, no la tarea principal. Control segmentado:
   track con --bg, pestaña activa como chip elevado con --surface — solo
   tokens base, sin color-mix/oklch derivados que puedan no soportarse. */
.hub-nav {
  display: flex;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  padding: 4px;
  margin-top: 14px;
  width: fit-content;
}

.hub-nav button {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 7px 16px;
  border-radius: var(--r-sm, 6px);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.hub-nav button:hover {
  color: var(--fg);
}

.hub-nav button.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.empty-projects-state {
  text-align: center;
  padding: 80px 20px;
  background: var(--surface);
  border-radius: var(--r-lg, 12px);
  border: 1px dashed var(--border);
}

.empty-projects-state p {
  color: var(--muted);
}

.cta-btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: var(--r-md, 8px);
  font-weight: 600;
  cursor: pointer;
  margin-top: 12px;
}
</style>

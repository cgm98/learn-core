<script setup lang="ts">
import './style.css';
import { ref, computed, onMounted } from 'vue';
import { FolderGit2, Plus, FileText, Play, Square, RefreshCw, Bot, Trash2 } from 'lucide-vue-next';
import { useProjectMetadataStore } from '../../stores/project-metadata.store';
import { useDomainStore } from '../../stores/domain.store';
import { useAreaStore } from '../../stores/area.store';
import { usePlanStore } from '../../stores/plan.store';
import { useProjectActivityStore } from '../../stores/project-activity.store';
import { useProjectSkillStore } from '../../stores/project-skill.store';
import { useConceptStore } from '../../stores/concept.store';
import { useConfirm } from '../../composables/useConfirm';
import { useToast } from '../../composables/useToast';
import type { Plan } from '../../types/plan.types';
import PlanPanel from './PlanPanel.vue';
import WatcherBadge from '../../components/WatcherBadge/Index.vue';
import { useWatcherStatus } from '../../composables/useWatcherStatus';
import { CodeGraphService } from '../../services/code-graph.service';
import { ProjectMetadataService } from '../../services/project-metadata.service';

const projectStore = useProjectMetadataStore();
const domainStore = useDomainStore();
const areaStore = useAreaStore();
const planStore = usePlanStore();
const activityStore = useProjectActivityStore();
const skillStore = useProjectSkillStore();
const conceptStore = useConceptStore();
const { confirm: confirmDialog } = useConfirm();
const toast = useToast();

type Tab = 'plans' | 'activity' | 'skills';
const activeTab = ref<Tab>('plans');
const selectedDomainId = ref<string | null>(null);
const selectedPlanId = ref<string | null>(null);

const showNewProjectModal = ref(false);
const newProjectLocalPath = ref('');

// Convención de alta rápida: todo proyecto sandbox cuelga del área "PROYECTO"
// y su dominio es la carpeta final de la ruta local — sin pedirle al usuario
// que elija área/dominio a mano ni que los cree antes en Taxonomía.
const PROJECT_AREA_NAME = 'PROYECTO';
const norm = (s: string) => s.trim().toLowerCase();

const deriveDomainName = (path: string): string => {
  const parts = path.trim().split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path.trim();
};

const previewDomainName = computed(() => deriveDomainName(newProjectLocalPath.value));

const showNewPlanModal = ref(false);
const newPlanTitle = ref('');

const projectsWithDomain = computed(() =>
  projectStore.projects.map(p => ({
    ...p,
    domain: domainStore.domains.find(d => d.id === p.domain_id)
  }))
);

const selectedProject = computed(() => projectsWithDomain.value.find(p => p.domain_id === selectedDomainId.value) || null);

const selectedPlan = computed<Plan | null>(() => planStore.plans.find(p => p.id === selectedPlanId.value) || null);

const selectProject = async (domainId: string) => {
  selectedDomainId.value = domainId;
  selectedPlanId.value = null;
  activeTab.value = 'plans';
  await Promise.all([
    planStore.fetchPlans(domainId),
    activityStore.fetchForDomain(domainId),
    skillStore.fetchForDomain(domainId)
  ]);
};

const showNewSkillModal = ref(false);
const newSkillSource = ref<'catalog' | 'local'>('catalog');
const newSkillConceptId = ref('');
const newSkillLocalRef = ref('');

const conceptTitleById = computed(() => new Map(conceptStore.summaries.map(c => [c.id, c.title])));

const handleCreateSkill = async () => {
  if (!selectedDomainId.value) return;
  const skill_ref = newSkillSource.value === 'catalog' ? newSkillConceptId.value : newSkillLocalRef.value.trim();
  if (!skill_ref) return;
  try {
    await skillStore.create({ domain_id: selectedDomainId.value, skill_ref, source: newSkillSource.value });
    toast.success('Skill agregada');
    showNewSkillModal.value = false;
    newSkillConceptId.value = '';
    newSkillLocalRef.value = '';
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo agregar la skill');
  }
};

const handleRemoveSkill = async (id: string) => {
  const ok = await confirmDialog({ title: 'Quitar skill', message: '¿Quitar esta skill del proyecto?', confirmLabel: 'Quitar' });
  if (!ok) return;
  try {
    await skillStore.remove(id);
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo quitar la skill');
  }
};

const { byDomain: watcherByDomain, refresh: refreshWatchers } = useWatcherStatus();

// Prender/apagar el watcher es lo único que administra estado del indexado, y vive acá
// (la ficha del proyecto) en vez de en las vistas de consulta: consultar y administrar
// quedan separados a propósito.
// `alive` (lo que corre ahora en el server) y no `watch_enabled` (lo guardado): un
// proyecto habilitado cuyo watcher no arrancó tiene que dejar "Iniciar" disponible para
// reintentar, no bloquearlo por estar marcado como encendido.
const isWatcherAlive = (domainId: string) => !!watcherByDomain.value.get(domainId)?.alive;

const togglingWatch = ref(false);
const setWatch = async (domainId: string, enabled: boolean) => {
  togglingWatch.value = true;
  try {
    // El server responde 207 (éxito para axios) cuando guardó el cambio pero no pudo
    // arrancar el watcher — sin este chequeo diría "iniciado" sobre un fallo.
    const updated: any = await projectStore.update(domainId, { watch_enabled: enabled });
    await refreshWatchers();
    if (updated?.watcherError) toast.error(`Guardado, pero el watcher no arrancó: ${updated.watcherError}`);
    else toast.success(enabled ? 'Watcher iniciado' : 'Watcher detenido');
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo cambiar el estado del watcher');
    await refreshWatchers();
  } finally {
    togglingWatch.value = false;
  }
};

const startWatcher = (domainId: string) => setWatch(domainId, true);
const stopWatcher = (domainId: string) => setWatch(domainId, false);

// Escanear es independiente del watcher: sirve igual con el watcher apagado (poner el
// índice al día una vez) que encendido (recuperar cambios de cuando estuvo detenido).
// Resume el reporte del puente del agente en un toast: qué se instaló en el repo
// destino y qué ya estaba. Los warnings (p. ej. .env sin gitignorear) van en toast
// aparte para que no se pierdan entre los éxitos.
const summarizeBridge = (report: { steps: { item: string; action: string }[]; warnings: string[] } | undefined) => {
  if (!report) return;
  const done = report.steps.filter(s => s.action !== 'skipped').map(s => s.item);
  if (done.length > 0) toast.success(`Puente del agente: ${done.join(', ')} configurado(s) en el repo.`);
  else if (report.steps.length > 0) toast.success('Puente del agente: ya estaba configurado.');
  report.warnings.forEach(w => toast.error(w));
};

const provisioning = ref(false);
const provisionBridge = async (domainId: string) => {
  provisioning.value = true;
  try {
    summarizeBridge(await ProjectMetadataService.provision(domainId));
  } catch (e: any) {
    toast.error(e?.response?.data?.error || e?.message || 'No se pudo configurar el puente del agente.');
  } finally {
    provisioning.value = false;
  }
};

const scanning = ref(false);
const scanProject = async (domainId: string) => {
  scanning.value = true;
  try {
    const r = await CodeGraphService.reindex(domainId);
    const nada = r.filesProcessed === 0 && r.orphansRemoved === 0;
    toast.success(
      nada
        ? 'Escaneo completo: el índice ya estaba al día.'
        : `Escaneo completo: ${r.filesProcessed} archivo(s) indexado(s), ${r.orphansRemoved} eliminado(s) del índice.`
    );
    await refreshWatchers();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || e?.message || 'No se pudo escanear el proyecto.');
  } finally {
    scanning.value = false;
  }
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const sourceLabel: Record<string, string> = {
  watcher: 'Watcher',
  plan: 'Plan',
  concept: 'Nota',
  manual: 'Manual'
};

const ensureProjectArea = async () => {
  const existing = areaStore.areas.find(a => norm(a.name) === norm(PROJECT_AREA_NAME));
  if (existing) return existing;
  return areaStore.createArea({ name: PROJECT_AREA_NAME, description: 'Proyectos de código levantados como sandbox', color: '#f97316' });
};

const ensureProjectDomain = async (name: string, areaId: string) => {
  const existing = domainStore.domains.find(d => norm(d.name) === norm(name));
  if (existing) return existing;
  return domainStore.createDomain({ name, description: 'Proyecto sandbox', color: '#10b981', area_id: areaId });
};

const handleCreateProject = async () => {
  const path = newProjectLocalPath.value.trim();
  if (!path) return;
  try {
    const folderName = deriveDomainName(path);
    const area = await ensureProjectArea();
    const domain = await ensureProjectDomain(folderName, area.id);

    const already = projectStore.projects.find(p => p.domain_id === domain.id);
    if (already) {
      toast.error(`Ya existe un proyecto sandbox para "${folderName}" — abriéndolo.`);
      showNewProjectModal.value = false;
      newProjectLocalPath.value = '';
      await selectProject(domain.id);
      return;
    }

    const created: any = await projectStore.create({ domain_id: domain.id, local_path: path });
    toast.success(`Proyecto sandbox creado en "${PROJECT_AREA_NAME} / ${folderName}"`);
    // El server aprovisiona el puente del agente al crear; acá solo se informa qué hizo.
    summarizeBridge(created?.agentBridge);
    showNewProjectModal.value = false;
    newProjectLocalPath.value = '';
    await selectProject(domain.id);
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo crear el proyecto sandbox');
  }
};

const deletingProject = ref(false);
const handleDeleteProject = async (domainId: string, name: string) => {
  const ok = await confirmDialog({
    title: 'Eliminar proyecto sandbox',
    message: `Se va a dejar de observar/indexar "${name}". El dominio, sus notas y el código en disco NO se borran — solo el registro del proyecto sandbox.`,
    confirmLabel: 'Eliminar',
    destructive: true
  });
  if (!ok) return;

  deletingProject.value = true;
  try {
    // Sin esto el proceso del watcher queda huérfano, observando una carpeta
    // cuyo project_metadata ya no existe.
    if (isWatcherAlive(domainId)) await setWatch(domainId, false);
    await projectStore.remove(domainId);
    toast.success('Proyecto sandbox eliminado');
    if (selectedDomainId.value === domainId) {
      selectedDomainId.value = null;
      selectedPlanId.value = null;
      if (projectStore.projects.length > 0) await selectProject(projectStore.projects[0].domain_id);
    }
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo eliminar el proyecto sandbox');
  } finally {
    deletingProject.value = false;
  }
};

const handleCreatePlan = async () => {
  if (!selectedDomainId.value || !newPlanTitle.value.trim()) return;
  try {
    const plan = await planStore.createPlan({ domain_id: selectedDomainId.value, title: newPlanTitle.value.trim() });
    toast.success('Plan creado');
    showNewPlanModal.value = false;
    newPlanTitle.value = '';
    selectedPlanId.value = plan.id;
  } catch (e: any) {
    toast.error(e?.message || 'No se pudo crear el plan');
  }
};

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  completed: 'Completado',
  archived: 'Archivado'
};

onMounted(async () => {
  await Promise.all([projectStore.fetchAll(), domainStore.fetchDomains(), areaStore.fetchAreas()]);
  if (conceptStore.summaries.length === 0) conceptStore.fetchConceptSummaries();
  if (projectStore.projects.length > 0) {
    await selectProject(projectStore.projects[0].domain_id);
  }
});
</script>

<template>
  <div class="sandbox-container">
    <aside class="sandbox-sidebar">
      <div class="sandbox-sidebar-header">
        <h2><FolderGit2 :size="16" /> Proyectos & AST Indexer</h2>
        <button class="btn-icon-add" title="Nuevo proyecto sandbox" @click="showNewProjectModal = true">
          <Plus :size="15" />
        </button>
      </div>

      <div v-if="projectStore.loading && projectStore.projects.length === 0" class="sandbox-empty">Cargando…</div>
      <div v-else-if="projectsWithDomain.length === 0" class="sandbox-empty">
        <p>Sin proyectos sandbox todavía.</p>
        <button class="btn-add-dashed" @click="showNewProjectModal = true">+ Registrar proyecto</button>
      </div>
      <button
        v-for="p in projectsWithDomain" :key="p.domain_id"
        class="sandbox-project-row" :class="{ selected: p.domain_id === selectedDomainId }"
        @click="selectProject(p.domain_id)"
      >
        <span class="dot" :style="{ background: p.domain?.color || '#6b7280' }"></span>
        <div class="sandbox-project-info">
          <span class="sandbox-project-name">{{ p.domain?.name || p.domain_id }}</span>
          <span class="sandbox-project-path">{{ p.local_path }}</span>
        </div>
        <WatcherBadge :status="watcherByDomain.get(p.domain_id)" :domain-id="p.domain_id" compact />
      </button>
    </aside>

    <main class="sandbox-main">
      <div v-if="!selectedProject" class="sandbox-empty sandbox-empty-main">
        <p>Seleccioná un proyecto o registrá uno nuevo para empezar.</p>
      </div>
      <template v-else>
        <header class="sandbox-main-header">
          <h1>{{ selectedProject.domain?.name || selectedProject.domain_id }}</h1>
          <p class="sandbox-main-path">{{ selectedProject.local_path }}</p>
          <!-- Badge en modo compacto: sus acciones propias serían un duplicado de los
               botones de abajo, que son la forma explícita de operar el proyecto. -->
          <div class="sandbox-watch-row">
            <WatcherBadge :status="watcherByDomain.get(selectedProject.domain_id)" :domain-id="selectedProject.domain_id" compact />

            <div class="sandbox-watch-actions">
              <button
                class="btn-watch"
                :disabled="togglingWatch || isWatcherAlive(selectedProject.domain_id)"
                title="Observar la carpeta y reindexar sola ante cada cambio"
                @click="startWatcher(selectedProject.domain_id)"
              >
                <Play :size="13" /> Iniciar
              </button>

              <button
                class="btn-watch"
                :disabled="togglingWatch || !isWatcherAlive(selectedProject.domain_id)"
                title="Dejar de observar. El índice queda como está."
                @click="stopWatcher(selectedProject.domain_id)"
              >
                <Square :size="13" /> Detener
              </button>

              <button
                class="btn-watch"
                :disabled="scanning"
                title="Recorrer la carpeta ahora: indexa lo nuevo y limpia lo que ya no existe"
                @click="scanProject(selectedProject.domain_id)"
              >
                <RefreshCw :size="13" :class="{ 'is-spinning': scanning }" /> {{ scanning ? 'Escaneando…' : 'Escanear' }}
              </button>

              <RouterLink
                class="btn-watch"
                :to="{ path: '/code-graph', query: { domain: selectedProject.domain_id } }"
                title="Abrir este proyecto en Code Graph"
              >
                <FolderGit2 :size="13" /> Ver en Code Graph
              </RouterLink>

              <button
                class="btn-watch"
                :disabled="provisioning"
                title="Instalar/reparar el puente del agente en el repo: .mcp.json, CLAUDE.md, claves en .env y plan inicial. No pisa nada existente."
                @click="provisionBridge(selectedProject.domain_id)"
              >
                <Bot :size="13" /> {{ provisioning ? 'Configurando…' : 'Configurar agente' }}
              </button>

              <button
                class="btn-watch btn-watch-danger"
                :disabled="deletingProject"
                title="Eliminar el registro del proyecto sandbox. No borra el dominio, sus notas ni el código en disco."
                @click="handleDeleteProject(selectedProject.domain_id, selectedProject.domain?.name || selectedProject.domain_id)"
              >
                <Trash2 :size="13" /> {{ deletingProject ? 'Eliminando…' : 'Eliminar proyecto' }}
              </button>
            </div>
          </div>
        </header>

        <div class="sandbox-tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'plans' }" @click="activeTab = 'plans'">Planes</button>
          <button class="tab-btn" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">Actividad</button>
          <button class="tab-btn" :class="{ active: activeTab === 'skills' }" @click="activeTab = 'skills'">Skills</button>
        </div>

        <div class="sandbox-tab-content">
          <div v-if="activeTab === 'plans'" class="plans-tab">
            <div class="plans-layout">
              <div class="plans-list">
                <button class="btn-add-dashed" @click="showNewPlanModal = true">+ Nuevo plan</button>
                <div v-if="planStore.loading" class="sandbox-empty">Cargando…</div>
                <div v-else-if="planStore.plans.length === 0" class="sandbox-empty">
                  <FileText :size="20" />
                  <p>Sin planes todavía.</p>
                </div>
                <button
                  v-for="p in planStore.plans" :key="p.id"
                  class="plan-row" :class="{ selected: p.id === selectedPlanId }"
                  @click="selectedPlanId = p.id"
                >
                  <span class="plan-row-title">{{ p.title }}</span>
                  <span class="plan-status-badge" :class="p.status">{{ statusLabel[p.status] }}</span>
                </button>
              </div>
              <div class="plan-detail">
                <PlanPanel v-if="selectedPlan" :plan="selectedPlan" />
                <div v-else class="sandbox-empty sandbox-empty-main">Seleccioná un plan para verlo.</div>
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'activity'" class="activity-tab">
            <div v-if="activityStore.loading" class="sandbox-empty">Cargando…</div>
            <div v-else-if="activityStore.events.length === 0" class="sandbox-empty sandbox-empty-main">
              Sin actividad registrada todavía.
            </div>
            <ul v-else class="activity-timeline">
              <li v-for="e in activityStore.events" :key="e.id" class="activity-row">
                <span class="activity-source-badge" :class="e.source">{{ sourceLabel[e.source] }}</span>
                <div class="activity-row-info">
                  <span class="activity-row-summary">{{ e.summary }}</span>
                  <span class="activity-row-date">{{ formatDate(e.created_at) }}</span>
                </div>
              </li>
            </ul>
          </div>

          <div v-else class="skills-tab">
            <button class="btn-add-dashed" @click="showNewSkillModal = true">+ Agregar skill</button>
            <div v-if="skillStore.loading" class="sandbox-empty">Cargando…</div>
            <div v-else-if="skillStore.skills.length === 0" class="sandbox-empty">Sin skills registradas.</div>
            <ul v-else class="skills-list">
              <li v-for="s in skillStore.skills" :key="s.id" class="skill-row">
                <span class="skill-source-badge" :class="s.source">{{ s.source === 'catalog' ? 'Catálogo' : 'Local' }}</span>
                <span class="skill-ref">{{ s.source === 'catalog' ? (conceptTitleById.get(s.skill_ref) || s.skill_ref) : s.skill_ref }}</span>
                <button class="btn-unlink" title="Quitar" @click="handleRemoveSkill(s.id)">✕</button>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </main>

    <!-- Nuevo proyecto sandbox -->
    <div v-if="showNewProjectModal" class="modal-backdrop" @click.self="showNewProjectModal = false">
      <div class="modal-card">
        <h3>Registrar proyecto sandbox</h3>
        <div class="field-group">
          <label>Ruta local</label>
          <input v-model="newProjectLocalPath" type="text" placeholder="/home/usuario/proyectos/mi-repo" autofocus>
          <p v-if="newProjectLocalPath.trim()" class="modal-hint">
            Área <strong>{{ PROJECT_AREA_NAME }}</strong> → dominio <strong>{{ previewDomainName }}</strong>
            (se crean si no existen)
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" @click="showNewProjectModal = false">Cancelar</button>
          <button
            class="btn-modal-confirm"
            :disabled="!newProjectLocalPath.trim() || projectStore.loading"
            @click="handleCreateProject"
          >Registrar</button>
        </div>
      </div>
    </div>

    <!-- Nuevo plan -->
    <div v-if="showNewPlanModal" class="modal-backdrop" @click.self="showNewPlanModal = false">
      <div class="modal-card">
        <h3>Nuevo plan</h3>
        <div class="field-group">
          <label>Título</label>
          <input v-model="newPlanTitle" type="text" placeholder="ej. Migración a v2, Fase de auth...">
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" @click="showNewPlanModal = false">Cancelar</button>
          <button class="btn-modal-confirm" :disabled="!newPlanTitle.trim() || planStore.loading" @click="handleCreatePlan">Crear</button>
        </div>
      </div>
    </div>

    <!-- Nueva skill -->
    <div v-if="showNewSkillModal" class="modal-backdrop" @click.self="showNewSkillModal = false">
      <div class="modal-card">
        <h3>Agregar skill</h3>
        <div class="field-group">
          <label>Origen</label>
          <select v-model="newSkillSource">
            <option value="catalog">Catálogo (nota existente)</option>
            <option value="local">Local (.claude/skills/ del sandbox)</option>
          </select>
        </div>
        <div v-if="newSkillSource === 'catalog'" class="field-group">
          <label>Concepto</label>
          <select v-model="newSkillConceptId">
            <option value="" disabled selected>Selecciona un concepto...</option>
            <option v-for="c in conceptStore.summaries" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
        </div>
        <div v-else class="field-group">
          <label>Referencia local</label>
          <input v-model="newSkillLocalRef" type="text" placeholder="ej. .claude/skills/mi-skill" />
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" @click="showNewSkillModal = false">Cancelar</button>
          <button
            class="btn-modal-confirm"
            :disabled="(newSkillSource === 'catalog' ? !newSkillConceptId : !newSkillLocalRef.trim()) || skillStore.loading"
            @click="handleCreateSkill"
          >Agregar</button>
        </div>
      </div>
    </div>
  </div>
</template>

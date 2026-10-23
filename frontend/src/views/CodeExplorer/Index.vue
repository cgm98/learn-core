<script setup lang="ts">
// Explorador de código (plan 2026-08-03, Fase 3): navegar un proyecto sandbox como se
// navega el vault en /notes, pero de SOLO LECTURA — el disco es la fuente de verdad y
// LEARN no escribe código. Responde "¿cómo está organizado esto y qué depende de qué?",
// no "¿dónde pongo el cursor?": para eso está el IDE.
import './style.css';
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FolderGit2, Search, Network, X, Lightbulb, Sparkles, Users, Flame, Scissors, GitPullRequest, Radio } from 'lucide-vue-next';
import { CodeGraphService } from '../../services/code-graph.service';
import { ConceptService } from '../../services/concept.service';
import { useWatcherStatus } from '../../composables/useWatcherStatus';
import { useToast } from '../../composables/useToast';
import CodeTree from '../../components/CodeTree/Index.vue';
import WatcherBadge from '../../components/WatcherBadge/Index.vue';
import AtomMarkdown from '../../components/AtomMarkdown/AtomMarkdown.vue';
import { highlightToLines, resolveHighlightLanguage } from '../../lib/highlight';
import '../../assets/styles/code-highlight.css';
import type { CodeProject, ProjectTree, FileDetail, SymbolHit, RelatedConcept, CallerInfo, DebtHotspot } from '../../types/code-graph.types';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { byDomain: watcherByDomain } = useWatcherStatus();

const projects = ref<CodeProject[]>([]);
const domainId = ref('');
const tree = ref<ProjectTree | null>(null);
const treeLoading = ref(false);
const selectedPath = ref<string | null>(null);
const detail = ref<FileDetail | null>(null);
const detailLoading = ref(false);
const relatedConcepts = ref<RelatedConcept[]>([]);
const relatedLoading = ref(false);

const deadCodeList = ref<{ id: string; name: string; kind: string; file_path: string; start_line: number }[]>([]);
const deadCodeLoading = ref(false);
const showDeadCode = ref(false);

const gitForecast = ref<{ clean: boolean; modified_files_count: number; symbols_affected: number; total_callers_at_risk: number; risk_level?: string; files: any[] } | null>(null);
const forecastLoading = ref(false);
const showForecast = ref(false);

const crossRadar = ref<{ total_projects: number; projects: any[] } | null>(null);
const radarLoading = ref(false);
const showRadar = ref(false);

const loadGitForecast = async () => {
  if (!domainId.value) return;
  forecastLoading.value = true;
  try {
    gitForecast.value = await CodeGraphService.gitDiffForecast(domainId.value);
  } catch {
    gitForecast.value = null;
  } finally {
    forecastLoading.value = false;
  }
};

const toggleForecast = () => {
  showForecast.value = !showForecast.value;
  if (showForecast.value && !gitForecast.value) loadGitForecast();
};

const loadCrossRadar = async () => {
  radarLoading.value = true;
  try {
    crossRadar.value = await CodeGraphService.crossProjectRadar();
  } catch {
    crossRadar.value = null;
  } finally {
    radarLoading.value = false;
  }
};

const toggleRadar = () => {
  showRadar.value = !showRadar.value;
  if (showRadar.value && !crossRadar.value) loadCrossRadar();
};

const loadDeadCode = async () => {
  if (!domainId.value) return;
  deadCodeLoading.value = true;
  try {
    const res = await CodeGraphService.deadCode(domainId.value, 30);
    deadCodeList.value = res.orphans;
  } catch {
    deadCodeList.value = [];
  } finally {
    deadCodeLoading.value = false;
  }
};

const toggleDeadCode = () => {
  showDeadCode.value = !showDeadCode.value;
  if (showDeadCode.value && deadCodeList.value.length === 0) loadDeadCode();
};

const draft = ref<{ title: string; explanation: string } | null>(null);
const draftLoading = ref(false);
const draftSaving = ref(false);

const callersExpanded = ref<Record<string, boolean>>({});
const callersData = ref<Record<string, CallerInfo>>({});
const callersLoading = ref<Record<string, boolean>>({});

const hotspots = ref<DebtHotspot[]>([]);
const hotspotsLoading = ref(false);
const showHotspots = ref(false);

const searchQ = ref('');
const hits = ref<SymbolHit[]>([]);
const searching = ref(false);

const currentProject = computed(() => projects.value.find((p) => p.domainId === domainId.value));
const indexedCount = computed(() => tree.value?.entries.filter((e) => e.indexed).length ?? 0);

const loadTree = async () => {
  if (!domainId.value) return;
  treeLoading.value = true;
  try {
    tree.value = await CodeGraphService.tree(domainId.value);
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'No se pudo cargar el árbol del proyecto.');
    tree.value = null;
  } finally {
    treeLoading.value = false;
  }
};

const openFile = async (relPath: string) => {
  selectedPath.value = relPath;
  detailLoading.value = true;
  relatedConcepts.value = [];
  draft.value = null;
  callersExpanded.value = {};
  callersData.value = {};
  try {
    detail.value = await CodeGraphService.file(domainId.value, relPath);
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'No se pudo abrir el archivo.');
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
  loadRelatedConcepts();
};

// Convierte el path absoluto que devuelve la DB (callers/hotspots) a relativo al
// proyecto, que es lo que openFile espera — mismo criterio que usa el árbol.
const toRelPath = (absPath: string) => {
  const root = tree.value?.rootDir;
  if (root && absPath.startsWith(root)) return absPath.slice(root.length).replace(/^\/+/, '');
  return absPath;
};

const openLocation = async (absPath: string, line: number) => {
  await openFile(toRelPath(absPath));
  await nextTick();
  scrollToLine(line);
};

// Blast radius de un símbolo (edges CALLS/EXTENDS entrantes) — cargado a demanda por
// símbolo en vez de para todos los de golpe, para no pegarle N queries a cada apertura
// de archivo cuando el usuario solo quiere ver uno o dos.
const toggleCallers = async (symbolId: string) => {
  callersExpanded.value[symbolId] = !callersExpanded.value[symbolId];
  if (!callersExpanded.value[symbolId] || callersData.value[symbolId]) return;
  callersLoading.value[symbolId] = true;
  try {
    callersData.value[symbolId] = await CodeGraphService.callers(domainId.value, symbolId);
  } catch {
    // panel secundario: si falla, queda vacío en vez de tapar la lectura del archivo.
  } finally {
    callersLoading.value[symbolId] = false;
  }
};

const loadHotspots = async () => {
  if (!domainId.value) return;
  hotspotsLoading.value = true;
  try {
    hotspots.value = await CodeGraphService.debt(domainId.value, 10);
  } catch {
    hotspots.value = [];
  } finally {
    hotspotsLoading.value = false;
  }
};

const toggleHotspots = () => {
  showHotspots.value = !showHotspots.value;
  if (showHotspots.value && hotspots.value.length === 0) loadHotspots();
};

// Puente código↔conocimiento (búsqueda léxica contra concepts_fts, no una relación
// curada): silencioso si falla, es un panel secundario, no bloquea la lectura del archivo.
const loadRelatedConcepts = async () => {
  if (!detail.value) return;
  relatedLoading.value = true;
  try {
    const symbolNames = detail.value.symbols.map((s) => s.name);
    relatedConcepts.value = await CodeGraphService.relatedConcepts(domainId.value, detail.value.relPath, symbolNames);
  } catch {
    relatedConcepts.value = [];
  } finally {
    relatedLoading.value = false;
  }
};

// Debounce simple: el endpoint es un LIKE sobre unos miles de símbolos, pero no hace falta
// pegarle en cada tecla.
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchQ, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    hits.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      hits.value = await CodeGraphService.search(domainId.value, q.trim());
    } finally {
      searching.value = false;
    }
  }, 250);
});

watch(domainId, async (id) => {
  if (!id) return;
  selectedPath.value = null;
  detail.value = null;
  hits.value = [];
  searchQ.value = '';
  hotspots.value = [];
  showHotspots.value = false;
  await loadTree();
  // El proyecto abierto queda en la URL: hace la vista enlazable y sobrevive un refresh.
  router.replace({ query: { ...route.query, domain: id } });
});

// Ida y vuelta con el grafo: el explorador es para leer detalle, /code-graph para ver forma.
const openInGraph = () => {
  if (!selectedPath.value || !detail.value) return;
  router.push({ path: '/code-graph', query: { domain: domainId.value, file: detail.value.absPath } });
};

// Redacta con el modelo de chat local (Ollama). Solo devuelve texto — no crea nada
// todavía, para que un modelo chico (gemma:2b) que alucine no termine escribiendo
// directo en el vault sin que nadie lo revise.
const generateDraft = async () => {
  if (!detail.value?.content) return;
  draftLoading.value = true;
  try {
    draft.value = await ConceptService.generateDraft(detail.value.content, detail.value.relPath);
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'No se pudo generar el draft (¿Ollama está corriendo con el modelo de chat?).');
  } finally {
    draftLoading.value = false;
  }
};

const saveDraft = async () => {
  if (!draft.value) return;
  draftSaving.value = true;
  try {
    await ConceptService.create({ title: draft.value.title, explanation: draft.value.explanation, domain: domainId.value });
    toast.success('Nota creada.');
    draft.value = null;
    loadRelatedConcepts();
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'No se pudo guardar la nota.');
  } finally {
    draftSaving.value = false;
  }
};

const scrollToLine = (line: number) => {
  document.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

// Resaltado del archivo entero y recién ahí partido en líneas: un comentario de bloque o
// un template literal abarca varias, y resaltarlas por separado rompe el análisis.
// highlightToLines devuelve HTML ya escapado (hljs escapa la entrada), por eso es seguro
// pasarlo a v-html.
const contentLines = computed(() => {
  const d = detail.value;
  if (!d?.content) return [];
  return highlightToLines(d.content, resolveHighlightLanguage(d.relPath));
});

const isMarkdown = computed(() => /\.mdx?$/i.test(detail.value?.relPath ?? ''));

const symbolAtLine = computed(() => {
  const map = new Map<number, string>();
  detail.value?.symbols.forEach((s) => map.set(s.start_line, s.kind));
  return map;
});

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

onMounted(async () => {
  projects.value = await CodeGraphService.listProjects();
  const wanted = typeof route.query.domain === 'string' ? route.query.domain : undefined;
  domainId.value =
    (wanted && projects.value.some((p) => p.domainId === wanted) ? wanted : undefined) ??
    projects.value.find((p) => p.domainId === 'learn')?.domainId ??
    projects.value[0]?.domainId ??
    '';
  const wantedPath = typeof route.query.path === 'string' ? route.query.path : undefined;
  if (wantedPath) await openFile(wantedPath);
});
</script>

<template>
  <div class="cx">
    <aside class="cx-sidebar">
      <div class="cx-sidebar-head">
        <h2><FolderGit2 :size="15" /> Explorador</h2>
      </div>

      <select v-model="domainId" class="cx-project-select">
        <option v-if="projects.length === 0" value="" disabled>Sin proyectos indexados</option>
        <option v-for="p in projects" :key="p.domainId" :value="p.domainId">{{ p.name }}</option>
      </select>

      <div class="cx-search">
        <Search :size="13" />
        <input v-model="searchQ" type="text" placeholder="Buscar símbolo o ruta…">
        <button v-if="searchQ" class="cx-search-clear" @click="searchQ = ''"><X :size="12" /></button>
      </div>

      <button class="cx-hotspots-toggle" @click="toggleHotspots">
        <Flame :size="13" /> Deuda técnica <span class="cx-caret">{{ showHotspots ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showHotspots" class="cx-hotspots">
        <p v-if="hotspotsLoading" class="cx-hint">Calculando…</p>
        <p v-else-if="hotspots.length === 0" class="cx-hint">Sin hotspots (nada con callers indexado todavía).</p>
        <button v-for="h in hotspots" :key="h.id" class="cx-hotspot" @click="openLocation(h.file_path, h.start_line)">
          <span class="cx-hotspot-name">{{ h.name }}</span>
          <span class="cx-hotspot-meta">{{ h.fan_in }} caller(s) · {{ h.staleness_days }}d</span>
        </button>
      </div>

      <!-- UNFAIR ADVANTAGE: Dead Code & Orphan Pruner -->
      <button class="cx-hotspots-toggle cx-deadcode-toggle" @click="toggleDeadCode">
        <Scissors :size="13" /> Código Muerto & Huérfanos <span class="cx-caret">{{ showDeadCode ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showDeadCode" class="cx-hotspots cx-deadcode-panel">
        <p v-if="deadCodeLoading" class="cx-hint">Escaneando in-degree = 0 en AST…</p>
        <p v-else-if="deadCodeList.length === 0" class="cx-hint">0 funciones huérfanas detectadas en el grafo.</p>
        <button v-for="d in deadCodeList" :key="d.id" class="cx-hotspot cx-deadcode-item" @click="openLocation(d.file_path, d.start_line)">
          <span class="cx-hotspot-name">{{ d.name }} <small>({{ d.kind }})</small></span>
          <span class="cx-hotspot-meta">{{ d.file_path.split(/[/\\]/).pop() }}:{{ d.start_line }}</span>
        </button>
      </div>

      <!-- UNFAIR ADVANTAGE: Git Commit Impact Forecaster -->
      <button class="cx-hotspots-toggle cx-forecast-toggle" @click="toggleForecast">
        <GitPullRequest :size="13" /> Git Diff Blast Forecaster <span class="cx-caret">{{ showForecast ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showForecast" class="cx-hotspots cx-forecast-panel">
        <p v-if="forecastLoading" class="cx-hint">Simulando impacto de git diff…</p>
        <div v-else-if="gitForecast && !gitForecast.clean" class="cx-forecast-summary">
          <div class="cx-forecast-risk" :class="`risk-${(gitForecast.risk_level || 'low').toLowerCase()}`">
            Riesgo: {{ gitForecast.risk_level }} ({{ gitForecast.total_callers_at_risk }} callers en riesgo)
          </div>
          <div v-for="f in gitForecast.files" :key="f.file" class="cx-forecast-file" @click="openFile(f.file)">
            <span>{{ f.file.split(/[/\\]/).pop() }}</span>
            <small>{{ f.symbols }} símbolos · {{ f.callers }} callers</small>
          </div>
        </div>
        <p v-else class="cx-hint">Working tree limpio (0 cambios sin commitear).</p>
      </div>

      <!-- UNFAIR ADVANTAGE: Cross-Project Dependency Radar -->
      <button class="cx-hotspots-toggle cx-radar-toggle" @click="toggleRadar">
        <Radio :size="13" /> Radar Multi-Repo <span class="cx-caret">{{ showRadar ? '▾' : '▸' }}</span>
      </button>
      <div v-if="showRadar" class="cx-hotspots cx-radar-panel">
        <p v-if="radarLoading" class="cx-hint">Monitoreando ecosistema multi-repo…</p>
        <div v-else-if="crossRadar" class="cx-radar-list">
          <div v-for="p in crossRadar.projects" :key="p.domainId" class="cx-radar-item" @click="domainId = p.domainId">
            <strong>{{ p.name }}</strong>
            <small>{{ p.symbolsCount }} símbolos · {{ p.edgesCount }} edges</small>
          </div>
        </div>
      </div>

      <div v-if="searchQ.trim()" class="cx-hits">
        <p v-if="searching" class="cx-hint">Buscando…</p>
        <p v-else-if="hits.length === 0" class="cx-hint">Sin resultados indexados.</p>
        <button v-for="h in hits" :key="h.id" class="cx-hit" @click="openFile(h.relPath)">
          <span class="cx-hit-name">{{ h.name }}</span>
          <span class="cx-hit-kind">{{ h.kind }}</span>
          <span class="cx-hit-path">{{ h.relPath }}:{{ h.start_line }}</span>
        </button>
      </div>

      <div v-else class="cx-tree-wrap">
        <p v-if="treeLoading" class="cx-hint">Cargando árbol…</p>
        <template v-else-if="tree">
          <p class="cx-tree-meta">
            {{ tree.entries.length }} archivo(s) · {{ indexedCount }} indexado(s)
            <span v-if="tree.truncated" class="cx-warn"> · truncado</span>
          </p>
          <CodeTree :entries="tree.entries" :selected="selectedPath" @select="openFile" />
        </template>
      </div>
    </aside>

    <main class="cx-main">
      <div v-if="!detail && !detailLoading" class="cx-empty">
        <p>Elegí un archivo del árbol para verlo.</p>
        <p class="cx-hint">
          Los archivos atenuados existen en disco pero no están indexados: se pueden leer,
          pero no aparecen en el grafo ni tienen símbolos.
        </p>
      </div>

      <template v-else-if="detail">
        <header class="cx-head">
          <div class="cx-head-main">
            <h1>{{ detail.relPath }}</h1>
            <p class="cx-head-meta">
              <span v-if="detail.lang">{{ detail.lang }}</span>
              <span v-else class="cx-warn">no indexado</span>
              · {{ formatSize(detail.size) }}
              · {{ detail.symbols.length }} símbolo(s)
            </p>
          </div>
          <div class="cx-head-actions">
            <WatcherBadge v-if="domainId" :status="watcherByDomain.get(domainId)" :domain-id="domainId" compact />
            <button v-if="detail.indexed" class="cx-btn" @click="openInGraph">
              <Network :size="13" /> Ver en grafo
            </button>
            <button v-if="detail.content" class="cx-btn" :disabled="draftLoading" @click="generateDraft">
              <Sparkles :size="13" /> {{ draftLoading ? 'Generando…' : 'Generar nota con IA' }}
            </button>
          </div>
        </header>

        <div v-if="draft" class="cx-draft">
          <div class="cx-draft-head">
            <Sparkles :size="13" />
            <span>Draft generado — revisalo antes de guardar</span>
          </div>
          <input v-model="draft.title" class="cx-draft-title" placeholder="Título">
          <textarea v-model="draft.explanation" class="cx-draft-body" rows="8" placeholder="Explicación"></textarea>
          <div class="cx-draft-actions">
            <button class="cx-btn" :disabled="draftSaving" @click="draft = null">Descartar</button>
            <button class="cx-btn cx-btn-primary" :disabled="draftSaving" @click="saveDraft">
              {{ draftSaving ? 'Guardando…' : 'Guardar nota' }}
            </button>
          </div>
        </div>

        <div class="cx-body">
          <div class="cx-code-wrap">
            <p v-if="detailLoading" class="cx-hint">Cargando…</p>
            <p v-else-if="detail.skipReason === 'too-large'" class="cx-hint">
              Archivo demasiado grande para mostrarlo acá ({{ formatSize(detail.size) }}). Abrilo en tu editor.
            </p>
            <p v-else-if="detail.skipReason === 'binary'" class="cx-hint">Archivo binario.</p>
            <AtomMarkdown v-else-if="isMarkdown" class="cx-markdown" :source="detail.content ?? ''" />
            <pre v-else class="cx-code hl"><code
              v-for="(line, i) in contentLines"
              :key="i"
              :data-line="i + 1"
              class="cx-line"
              :class="{ 'is-symbol': symbolAtLine.has(i + 1) }"
            ><span class="cx-lineno">{{ i + 1 }}</span><span class="cx-line-code" v-html="line || '&#8203;'"></span></code></pre>
          </div>

          <aside class="cx-aside">
            <section v-if="detail.symbols.length">
              <h3>Símbolos</h3>
              <div v-for="s in detail.symbols" :key="s.id" class="cx-sym-row">
                <button class="cx-sym" @click="scrollToLine(s.start_line)">
                  <span class="cx-sym-name">{{ s.name }}</span>
                  <span class="cx-sym-kind">{{ s.kind }}</span>
                  <span class="cx-sym-line">{{ s.start_line }}</span>
                </button>
                <button
                  class="cx-sym-callers"
                  :class="{ 'is-open': callersExpanded[s.id] }"
                  :title="'¿Quién usa ' + s.name + '?'"
                  @click="toggleCallers(s.id)"
                >
                  <Users :size="11" />
                  <span v-if="callersData[s.id]">{{ callersData[s.id].total_callers }}</span>
                </button>

                <div v-if="callersExpanded[s.id]" class="cx-callers">
                  <p v-if="callersLoading[s.id]" class="cx-hint">Buscando…</p>
                  <template v-else-if="callersData[s.id]">
                    <p v-if="callersData[s.id].total_callers === 0" class="cx-hint">
                      Sin callers indexados (no prueba que nadie lo use, ver límites de find_callers).
                    </p>
                    <button
                      v-for="c in callersData[s.id].callers.slice(0, 8)"
                      :key="c.id"
                      class="cx-link"
                      @click="openLocation(c.file_path, c.start_line)"
                    >
                      {{ c.name }} — {{ toRelPath(c.file_path) }}:{{ c.start_line }}
                    </button>
                    <p v-if="callersData[s.id].total_callers > 8" class="cx-hint">
                      +{{ callersData[s.id].total_callers - 8 }} más en {{ callersData[s.id].files_affected }} archivo(s).
                    </p>
                  </template>
                </div>
              </div>
            </section>

            <section v-if="detail.imports.length">
              <h3>Importa ({{ detail.imports.length }})</h3>
              <button v-for="p in detail.imports" :key="p" class="cx-link" @click="openFile(p)">{{ p }}</button>
            </section>

            <section v-if="detail.importedBy.length">
              <h3>Lo importan ({{ detail.importedBy.length }})</h3>
              <button v-for="p in detail.importedBy" :key="p" class="cx-link" @click="openFile(p)">{{ p }}</button>
            </section>

            <p v-if="detail.indexed && !detail.imports.length && !detail.importedBy.length" class="cx-hint">
              Sin relaciones de import indexadas. Los imports de paquetes (node_modules) no se indexan a propósito.
            </p>

            <section v-if="relatedLoading || relatedConcepts.length">
              <h3><Lightbulb :size="13" /> Conceptos relacionados</h3>
              <p v-if="relatedLoading" class="cx-hint">Buscando…</p>
              <button
                v-for="c in relatedConcepts"
                :key="c.id"
                class="cx-link"
                @click="router.push({ path: '/notes', query: { id: c.id } })"
              >
                {{ c.title }}
              </button>
            </section>
          </aside>
        </div>
      </template>
    </main>
  </div>
</template>

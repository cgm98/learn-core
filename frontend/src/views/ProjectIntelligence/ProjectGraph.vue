<script setup lang="ts">
// Grafo del proyecto (Project -> Tasks/Issues/Decisions/Memories). Mismo
// patrón que PeopleGraph/Index.vue (fuerzas + canvas, sin librería externa),
// adaptado a nodos tipados en vez de personas — ver plan "Rediseño de Grafo".
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { GraphNode as SourceNode, GraphEdge as SourceEdge } from '../../services/intelligence.service.js';

const props = defineProps<{ nodes: SourceNode[]; edges: SourceEdge[] }>();
const emit = defineEmits<{ open: [node: SourceNode] }>();

interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface GraphEdge { from: number; to: number; relation: string }

const TYPE_COLORS: Record<string, string> = {
  project: '#6366f1',
  task: '#2f6feb',
  issue: '#dc2626',
  decision: '#d97706',
  memory: '#6b7280'
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let nodes: GraphNode[] = [];
let edges: GraphEdge[] = [];
let animationFrameId = 0;
let width = 600;
let height = 400;

const hoveredId = ref<string | null>(null);
let draggingIdx: number | null = null;
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;

const buildGraph = () => {
  const idToIndex = new Map<string, number>();
  nodes = props.nodes.map((n, i) => {
    idToIndex.set(n.id, i);
    const angle = (i / Math.max(1, props.nodes.length)) * Math.PI * 2;
    const radius = n.type === 'project' ? 0 : 100;
    return {
      id: n.id,
      label: n.label,
      type: n.type || 'memory',
      color: TYPE_COLORS[n.type || 'memory'] || TYPE_COLORS.memory,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0
    };
  });
  edges = props.edges
    .map(e => ({ from: idToIndex.get(e.source), to: idToIndex.get(e.target), relation: e.relation }))
    .filter((e): e is GraphEdge => e.from !== undefined && e.to !== undefined);
};

const REPULSION = 900;
const SPRING_LENGTH = 100;
const SPRING_STRENGTH = 0.02;
const DAMPING = 0.85;
const CENTER_PULL = 0.01;

const tick = () => {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const distSq = Math.max(dx * dx + dy * dy, 25);
      const force = REPULSION / distSq;
      const dist = Math.sqrt(distSq);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    a.vx += (width / 2 - a.x) * CENTER_PULL;
    a.vy += (height / 2 - a.y) * CENTER_PULL;
  }

  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (i === draggingIdx) continue;
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x += n.vx; n.y += n.vy;
    n.x = Math.max(20, Math.min(width - 20, n.x));
    n.y = Math.max(20, Math.min(height - 20, n.y));
  }

  draw();
  animationFrameId = requestAnimationFrame(tick);
};

const draw = () => {
  if (!ctx) return;
  const style = getComputedStyle(document.documentElement);
  const borderColor = style.getPropertyValue('--border').trim() || '#333';
  const fgColor = style.getPropertyValue('--fg').trim() || '#eee';

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  for (const e of edges) {
    const a = nodes[e.from], b = nodes[e.to];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const n of nodes) {
    const isHovered = n.id === hoveredId.value;
    const radius = n.type === 'project' ? 16 : isHovered ? 14 : 10;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();
    if (isHovered) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = fgColor;
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y - radius - 6);
    }
  }
};

const findNodeAt = (x: number, y: number): number | null => {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = x - n.x, dy = y - n.y;
    if (dx * dx + dy * dy <= 16 * 16) return i;
  }
  return null;
};

const getCoords = (e: MouseEvent) => {
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const onMouseDown = (e: MouseEvent) => {
  const { x, y } = getCoords(e);
  const idx = findNodeAt(x, y);
  draggingIdx = idx;
  dragMoved = false;
  dragStartX = x; dragStartY = y;
};

const onMouseMove = (e: MouseEvent) => {
  const { x, y } = getCoords(e);
  if (draggingIdx !== null) {
    nodes[draggingIdx].x = x;
    nodes[draggingIdx].y = y;
    nodes[draggingIdx].vx = 0;
    nodes[draggingIdx].vy = 0;
    if (Math.abs(x - dragStartX) > 3 || Math.abs(y - dragStartY) > 3) dragMoved = true;
  } else {
    const idx = findNodeAt(x, y);
    hoveredId.value = idx !== null ? nodes[idx].id : null;
  }
};

const onMouseUp = () => {
  if (draggingIdx !== null && !dragMoved) {
    const node = props.nodes.find(n => n.id === nodes[draggingIdx!].id);
    if (node) emit('open', node);
  }
  draggingIdx = null;
};

const resize = () => {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.parentElement!.getBoundingClientRect();
  width = canvasRef.value.width = rect.width;
  height = canvasRef.value.height = 420;
};

onMounted(() => {
  ctx = canvasRef.value!.getContext('2d');
  resize();
  buildGraph();
  animationFrameId = requestAnimationFrame(tick);
  window.addEventListener('resize', resize);
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', resize);
});

watch([() => props.nodes, () => props.edges], () => buildGraph());
</script>

<template>
  <div class="project-graph-wrapper">
    <canvas
      ref="canvasRef"
      class="project-graph-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="draggingIdx = null"
    ></canvas>
    <p v-if="nodes.length <= 1" class="project-graph-empty">Todavía no hay tareas, issues ni decisiones para graficar en este proyecto.</p>
  </div>
</template>

<style scoped>
.project-graph-wrapper { position: relative; width: 100%; }
.project-graph-canvas { width: 100%; height: 420px; display: block; cursor: grab; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.project-graph-empty { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--muted); font-size: 13px; text-align: center; max-width: 280px; margin: 0; }
</style>

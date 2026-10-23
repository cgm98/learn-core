import { ref, computed, shallowRef } from 'vue';
import { IntelligenceService } from '../../../services/intelligence.service';

// Board migrado desde why/MIGRACION/kanban: 5 columnas de negocio en vez de
// las 4 status genéricos del hub (ver server ProjectManagementService.KANBAN_COLUMNS).
export const KANBAN_COLUMNS = ['planeacion', 'por hacer', 'en progreso', 'en revision', 'finalizado'];

const columnToStatus = (column) => {
  if (column === 'finalizado') return 'done';
  if (column === 'en progreso' || column === 'en revision') return 'in_progress';
  return 'todo';
};

const PRIORITY_TO_PROGRESS = { urgent: 1, high: 1, medium: 2, low: 3 };
const PROGRESS_TO_PRIORITY = { 1: 'urgent', 2: 'medium', 3: 'low' };

// Adapta el IntelligenceTask del backend a los nombres de campo que esperan
// los componentes migrados (moduleDescription/clientName/systemOwner/progress/...).
function toBoardTask(t) {
  return {
    ...t,
    moduleDescription: t.title,
    description: t.description || t.title,
    clientName: t.client_name,
    systemOwner: t.assignee,
    systemOwnerCode: t.assignee,
    implementerCode: t.implementer,
    designReviewerCode: t.implementer,
    projectOwnerCode: t.assignee,
    createdByCode: t.assignee,
    progress: PRIORITY_TO_PROGRESS[t.priority] ?? 2,
    status: t.kanban_column,
    requestDate: t.created_at,
    createdAt: t.created_at
  };
}

export function useTasks(projectIdRef) {
  const tasks = shallowRef([]);
  const filters = ref({ dev: '', po: '', client: '' });
  const globalUrgencyFilter = ref('todos');
  const isLoading = ref(false);

  const projectId = () => (typeof projectIdRef === 'function' ? projectIdRef() : projectIdRef?.value ?? projectIdRef);

  const loadTasks = async () => {
    const id = projectId();
    if (!id) return;
    isLoading.value = true;
    try {
      const res = await IntelligenceService.getKanban(id);
      tasks.value = Object.values(res.data.columns).flat().map(toBoardTask);
    } catch (e) {
      console.error(e);
      tasks.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  const getUnique = (field) => [...new Set(tasks.value.map((t) => t[field]).filter(Boolean))];

  const filteredTasks = computed(() =>
    tasks.value.filter((t) => {
      const matchesBasic =
        (!filters.value.dev || t.systemOwner === filters.value.dev) &&
        (!filters.value.po || t.implementer === filters.value.po) &&
        (!filters.value.client || t.clientName === filters.value.client);
      if (!matchesBasic) return false;

      if (globalUrgencyFilter.value === 'todos') return true;
      if (globalUrgencyFilter.value === 'urgente') return t.progress === 1;
      if (globalUrgencyFilter.value === 'media') return t.progress === 2;
      if (globalUrgencyFilter.value === 'baja') return t.progress === 3;
      return true;
    })
  );

  const getTasksByStatus = (status) => computed(() => filteredTasks.value.filter((t) => t.status === status));

  const createTask = async (payload) => {
    await IntelligenceService.createTask(projectId(), {
      title: payload.title,
      description: payload.description || null,
      client_name: payload.clientName || null,
      assignee: payload.systemOwner || null,
      implementer: payload.implementer || null,
      priority: PROGRESS_TO_PRIORITY[payload.progress] || 'medium',
      kanban_column: 'planeacion'
    });
    await loadTasks();
  };

  const updateTask = async (taskId, payload) => {
    await IntelligenceService.updateTask(projectId(), taskId, {
      title: payload.title,
      description: payload.description || null,
      client_name: payload.clientName || null,
      assignee: payload.systemOwner || null,
      implementer: payload.implementer || null,
      priority: PROGRESS_TO_PRIORITY[payload.progress] || 'medium'
    });
    await loadTasks();
  };

  const updateTaskSchedule = async (taskId, patch) => {
    const res = await IntelligenceService.updateTaskSchedule(projectId(), taskId, patch);
    const updated = toBoardTask(res.data);
    tasks.value = tasks.value.map((t) => (t.id === taskId ? updated : t));
    return updated;
  };

  const reorderTaskOptimistic = async (taskId, newColumn, newColumnIndex) => {
    const taskIdx = tasks.value.findIndex((t) => t.id === taskId);
    if (taskIdx === -1) return;

    const task = tasks.value[taskIdx];
    const oldColumn = task.status;

    const newTasks = tasks.value.filter((t) => t.id !== taskId);
    const inColumn = newTasks.filter((t) => t.status === newColumn);
    task.status = newColumn;

    let insertIndex = newTasks.length;
    if (inColumn.length > 0 && newColumnIndex < inColumn.length) {
      insertIndex = newTasks.findIndex((t) => t.id === inColumn[newColumnIndex].id);
    } else if (newColumnIndex === 0) {
      const siblingId = inColumn[0]?.id;
      insertIndex = siblingId ? newTasks.findIndex((t) => t.id === siblingId) : 0;
    }

    newTasks.splice(insertIndex, 0, task);
    tasks.value = newTasks;

    if (oldColumn !== newColumn) {
      try {
        await IntelligenceService.updateTaskStatus(projectId(), taskId, columnToStatus(newColumn), newColumn);
      } catch (e) {
        console.error(e);
        const rollback = [...tasks.value];
        const idx = rollback.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          rollback[idx] = { ...rollback[idx], status: oldColumn };
          tasks.value = rollback;
        }
      }
    }
  };

  const deleteTaskOptimistic = async (taskId) => {
    const oldTasks = tasks.value;
    tasks.value = tasks.value.filter((t) => t.id !== taskId);
    try {
      await IntelligenceService.deleteTask(projectId(), taskId);
    } catch (e) {
      console.error(e);
      tasks.value = oldTasks;
    }
  };

  return {
    tasks,
    filters,
    globalUrgencyFilter,
    isLoading,
    loadTasks,
    getUnique,
    getTasksByStatus,
    createTask,
    updateTask,
    updateTaskSchedule,
    reorderTaskOptimistic,
    deleteTaskOptimistic
  };
}

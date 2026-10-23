import type { ComputedRef, Ref } from 'vue';

export declare const KANBAN_COLUMNS: string[];

export declare function useTasks(projectIdRef: (() => string) | Ref<string> | string): {
  tasks: Ref<any[]>;
  filters: Ref<{ dev: string; po: string; client: string }>;
  globalUrgencyFilter: Ref<string>;
  isLoading: Ref<boolean>;
  loadTasks: () => Promise<void>;
  getUnique: (field: string) => any[];
  getTasksByStatus: (status: string) => ComputedRef<any[]>;
  createTask: (payload: any) => Promise<void>;
  updateTask: (taskId: string, payload: any) => Promise<void>;
  updateTaskSchedule: (taskId: string, patch: any) => Promise<any>;
  reorderTaskOptimistic: (taskId: string, newColumn: string, newColumnIndex: number) => Promise<void>;
  deleteTaskOptimistic: (taskId: string) => Promise<void>;
};

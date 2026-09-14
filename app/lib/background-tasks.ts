import type { GenerationTask, ProjectWorkspace } from "./domain";

type BackgroundTaskEntry = {
  projectId: string;
  task: GenerationTask;
  workspace: ProjectWorkspace;
};

// 这是持久化任务之外的短期进程内兜底，避免任务刚创建或并发保存时，轮询读到旧快照。
const entries = new Map<string, BackgroundTaskEntry>();

export function registerBackgroundTask(projectId: string, task: GenerationTask, workspace: ProjectWorkspace) {
  entries.set(task.id, { projectId, task, workspace });
}

export function updateBackgroundTask(task: GenerationTask, workspace: ProjectWorkspace) {
  const entry = entries.get(task.id);
  if (entry) entries.set(task.id, { projectId: entry.projectId, task, workspace });
}

export function getBackgroundTask(taskId: string) {
  return entries.get(taskId);
}

import { normalizeWorkspace } from "../../../../../lib/workspace";
import { getBackgroundTask } from "../../../../../lib/background-tasks";

export async function GET(_request: Request, context: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await context.params;
  try {
    const { getWorkspace, databaseMode } = await import("../../../../../lib/repository");
    const workspace = await getWorkspace(id);
    if (!workspace) return Response.json({ error: "项目不存在。" }, { status: 404 });
    const normalized = normalizeWorkspace(workspace);
    const task = normalized.tasks.find((item) => item.id === taskId);
    const live = getBackgroundTask(taskId);
    if (live?.projectId === id) return Response.json({ task: live.task, workspace: normalizeWorkspace(live.workspace), storage: await databaseMode() });
    if (!task) return Response.json({ error: "任务不存在。" }, { status: 404 });
    return Response.json({ task, workspace: normalized, storage: await databaseMode() });
  } catch {
    return Response.json({ error: "任务状态暂时无法读取。" }, { status: 503 });
  }
}

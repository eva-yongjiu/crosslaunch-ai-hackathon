import { ruleSources } from "../../../lib/rules";
import type { ProjectWorkspace } from "../../../lib/domain";
import { normalizeWorkspace } from "../../../lib/workspace";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { databaseMode, getWorkspace, listVersions } = await import("../../../lib/repository");
    const workspace = await getWorkspace(id);
    if (!workspace) return Response.json({ error: "项目不存在。" }, { status: 404 });
    workspace.sources = ruleSources;
    return Response.json({ workspace, versions: await listVersions(id), storage: await databaseMode() });
  } catch (error) {
    console.error("Unable to load project", error);
    return Response.json({ error: "项目数据库暂不可用。" }, { status: 503 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { workspace?: ProjectWorkspace; reason?: string };
  if (!body.workspace || body.workspace.project.id !== id) return Response.json({ error: "项目 ID 不匹配。" }, { status: 400 });
  const normalizedWorkspace = normalizeWorkspace(body.workspace);
  normalizedWorkspace.project.updatedAt = new Date().toISOString();
  try {
    const { databaseMode, saveWorkspace } = await import("../../../lib/repository");
    const result = await saveWorkspace(normalizedWorkspace, body.reason || "保存工作区");
    return Response.json({ ...result, storage: await databaseMode() });
  } catch (error) {
    console.error("Unable to save project", error);
    return Response.json({ error: "保存失败，修改没有被伪装成成功。" }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { deleteProject } = await import("../../../lib/repository");
    await deleteProject(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Unable to delete project", error);
    const message = error instanceof Error ? error.message : "项目删除失败。";
    return Response.json({ error: message }, { status: message === "演示项目不能删除。" ? 400 : 503 });
  }
}

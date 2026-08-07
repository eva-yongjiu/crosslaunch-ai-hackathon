import { ruleSources } from "../../../lib/rules";
import type { ProjectWorkspace } from "../../../lib/domain";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { getWorkspace, listVersions } = await import("../../../lib/repository");
    const workspace = await getWorkspace(id);
    if (!workspace) return Response.json({ error: "项目不存在。" }, { status: 404 });
    workspace.sources = ruleSources;
    return Response.json({ workspace, versions: await listVersions(id), storage: "d1" });
  } catch (error) {
    console.error("Unable to load project", error);
    return Response.json({ error: "项目数据库暂不可用。" }, { status: 503 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { workspace?: ProjectWorkspace; reason?: string };
  if (!body.workspace || body.workspace.project.id !== id) return Response.json({ error: "项目 ID 不匹配。" }, { status: 400 });
  body.workspace.project.updatedAt = new Date().toISOString();
  try {
    const { saveWorkspace } = await import("../../../lib/repository");
    const result = await saveWorkspace(body.workspace, body.reason || "保存工作区");
    return Response.json({ ...result, storage: "d1" });
  } catch (error) {
    console.error("Unable to save project", error);
    return Response.json({ error: "保存失败，修改没有被伪装成成功。" }, { status: 503 });
  }
}

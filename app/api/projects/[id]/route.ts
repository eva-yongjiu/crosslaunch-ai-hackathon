import { cloneFixture } from "../../../lib/fixtures";
import { ruleSources } from "../../../lib/rules";
import type { ProjectWorkspace } from "../../../lib/domain";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { getWorkspace, listVersions } = await import("../../../lib/repository");
    const workspace = await getWorkspace(id);
    if (!workspace) return Response.json({ error: "Project not found" }, { status: 404 });
    workspace.sources = ruleSources;
    return Response.json({ workspace, versions: await listVersions(id), storage: "d1" });
  } catch {
    const workspace = cloneFixture();
    workspace.project.id = id;
    workspace.truth.projectId = id;
    return Response.json({ workspace, versions: [{ id: "fixture-v1", version: 1, reason: "Fixture 基线", createdAt: workspace.project.updatedAt }], storage: "fixture" });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as { workspace: ProjectWorkspace; reason?: string };
  if (!body.workspace || body.workspace.project.id !== id) return Response.json({ error: "Project id mismatch" }, { status: 400 });
  body.workspace.project.updatedAt = new Date().toISOString();
  try {
    const { saveWorkspace } = await import("../../../lib/repository");
    const result = await saveWorkspace(body.workspace, body.reason || "保存工作区");
    return Response.json({ ...result, storage: "d1" });
  } catch {
    return Response.json({ workspace: body.workspace, version: 1, storage: "fixture" });
  }
}

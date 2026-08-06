import { cloneFixture } from "../../lib/fixtures";
import { ruleSources } from "../../lib/rules";

export async function GET() {
  try {
    const { listProjects } = await import("../../lib/repository");
    const rows = await listProjects();
    return Response.json({ projects: rows, storage: "d1" });
  } catch {
    return Response.json({ projects: [cloneFixture().project], storage: "fixture" });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: string; productName?: string; category?: string };
  const workspace = cloneFixture();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  workspace.project = { ...workspace.project, id, name: body.name || `${body.productName || "新商品"}三渠道上新`, productName: body.productName || "未命名商品", category: body.category || "unclassified", status: "queued", currentStep: "input", createdAt: now, updatedAt: now };
  workspace.truth = { ...workspace.truth, id: crypto.randomUUID(), projectId: id, productName: workspace.project.productName, category: workspace.project.category, confirmedAt: undefined };
  workspace.tasks = [];
  workspace.sources = ruleSources;
  try {
    const { saveWorkspace } = await import("../../lib/repository");
    const result = await saveWorkspace(workspace, "创建项目");
    return Response.json({ ...result, storage: "d1" }, { status: 201 });
  } catch {
    return Response.json({ workspace, version: 1, storage: "fixture" }, { status: 201 });
  }
}

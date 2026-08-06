import { cloneFixture } from "../../../../lib/fixtures";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let workspace;
  try { const { getWorkspace } = await import("../../../../lib/repository"); workspace = await getWorkspace(id); } catch { workspace = null; }
  workspace ??= cloneFixture();
  const blocking = workspace.findings.filter((finding) => finding.severity === "high" && finding.status === "open");
  if (blocking.length) return Response.json({ error: "存在未处理的高风险项", blocking: blocking.map((item) => item.id) }, { status: 409 });
  const payload = {
    manifest: { product: workspace.project.productName, category: workspace.truth.category, channels: workspace.project.channels, exportedAt: new Date().toISOString(), disclaimer: "AI risk screening does not replace platform review or legal advice." },
    truthProfile: workspace.truth,
    listings: workspace.listings,
    detailModules: workspace.details,
    assets: workspace.assets,
    compliance: { coverage: workspace.project.coverage, findings: workspace.findings, sources: workspace.sources },
    workflowTrace: workspace.tasks,
  };
  return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="crosslaunch-${id}.json"` } });
}

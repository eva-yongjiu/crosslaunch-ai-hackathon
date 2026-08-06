import { cloneFixture } from "../../../../lib/fixtures";
import { coverageFor, scanListing } from "../../../../lib/compliance";
import { modelMode } from "../../../../lib/model-router";
import { ruleSources } from "../../../../lib/rules";
import type { ProjectWorkspace } from "../../../../lib/domain";

type Action = "analyze" | "confirm_truth" | "generate" | "scan" | "apply_fixes";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { action, workspace: clientWorkspace } = await request.json() as { action: Action; workspace?: ProjectWorkspace };
  let workspace = clientWorkspace;
  if (!workspace) {
    try { const { getWorkspace } = await import("../../../../lib/repository"); workspace = await getWorkspace(id) ?? undefined; } catch { workspace = undefined; }
  }
  workspace ??= cloneFixture();
  workspace.project.id = id;
  workspace.truth.projectId = id;
  const now = new Date().toISOString();
  const task = { id: crypto.randomUUID(), projectId: id, type: action === "confirm_truth" ? "analyze" : action === "scan" || action === "apply_fixes" ? "compliance" : action === "generate" ? "listing" : "analyze", mode: modelMode(), status: "completed", retries: 0, inputSummary: action, outputSummary: "工作流步骤完成", startedAt: now, completedAt: now } as const;

  if (action === "analyze") { workspace.project.currentStep = "truth"; workspace.project.status = "needs_review"; }
  if (action === "confirm_truth") { workspace.truth.confirmedAt = now; workspace.project.currentStep = "assets"; workspace.project.status = "running"; }
  if (action === "generate") { workspace.project.currentStep = "listing"; workspace.project.status = "running"; }
  if (action === "scan") {
    workspace.findings = workspace.listings.flatMap((listing) => scanListing(listing, workspace!.truth));
    workspace.project.coverage = Object.fromEntries(workspace.project.channels.map((channel) => [channel, coverageFor(workspace!.truth.category, channel)])) as ProjectWorkspace["project"]["coverage"];
    workspace.project.currentStep = "compliance";
    workspace.project.status = "needs_review";
  }
  if (action === "apply_fixes") {
    workspace.findings = workspace.findings.map((finding) => ({ ...finding, status: finding.status === "open" ? "fixed" : finding.status, version: finding.version + 1 }));
    workspace.project.currentStep = "export";
    workspace.project.status = "completed";
  }
  workspace.sources = ruleSources;
  workspace.tasks = [...workspace.tasks, task];
  workspace.project.updatedAt = now;
  let storage = "fixture";
  try { const { saveWorkspace } = await import("../../../../lib/repository"); await saveWorkspace(workspace, `工作流：${action}`); storage = "d1"; } catch { /* fixture mode */ }
  return Response.json({ workspace, task, storage });
}

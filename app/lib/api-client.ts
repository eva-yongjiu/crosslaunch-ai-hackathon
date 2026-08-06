import type { ProjectWorkspace } from "./domain";
import { cloneFixture } from "./fixtures";

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error || `Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadWorkspace(id = "project_demo") {
  try { return await json<{ workspace: ProjectWorkspace; storage: string; versions: Array<{ id: string; version: number; reason: string; createdAt: string }> }>(`/api/projects/${id}`); }
  catch { return { workspace: cloneFixture(), storage: "fixture", versions: [{ id: "fixture-v1", version: 1, reason: "Fixture 基线", createdAt: new Date().toISOString() }] }; }
}

export async function runWorkflow(id: string, action: "analyze" | "confirm_truth" | "generate" | "scan" | "apply_fixes", workspace: ProjectWorkspace) {
  try { return await json<{ workspace: ProjectWorkspace; storage: string }>(`/api/projects/${id}/workflow`, { method: "POST", body: JSON.stringify({ action, workspace }) }); }
  catch {
    const copy = JSON.parse(JSON.stringify(workspace)) as ProjectWorkspace;
    const now = new Date().toISOString();
    if (action === "confirm_truth") { copy.truth.confirmedAt = now; copy.project.currentStep = "assets"; }
    if (action === "generate") copy.project.currentStep = "listing";
    if (action === "scan") copy.project.currentStep = "compliance";
    if (action === "apply_fixes") { copy.findings = copy.findings.map((finding) => ({ ...finding, status: finding.status === "open" ? "fixed" : finding.status })); copy.project.currentStep = "export"; copy.project.status = "completed"; }
    copy.project.updatedAt = now;
    return { workspace: copy, storage: "fixture" };
  }
}

export async function saveWorkspace(workspace: ProjectWorkspace, reason: string) {
  try { return await json<{ workspace: ProjectWorkspace; version: number; storage: string }>(`/api/projects/${workspace.project.id}`, { method: "PUT", body: JSON.stringify({ workspace, reason }) }); }
  catch { return { workspace, version: 1, storage: "fixture" }; }
}

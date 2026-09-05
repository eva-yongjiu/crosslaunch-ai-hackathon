import type { Channel, LaunchProject, ProjectWorkspace, RuntimeStatus, UploadedAsset } from "./domain";

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

export function listProjects() {
  return json<{ projects: LaunchProject[]; storage: "d1" | "local" }>("/api/projects");
}

export function createProject(input: { name?: string; productName: string; category?: string; channels: Channel[] }) {
  return json<{ workspace: ProjectWorkspace; version: number; storage: "d1" | "local" }>("/api/projects", { method: "POST", body: JSON.stringify(input) });
}

export function loadWorkspace(id: string) {
  return json<{ workspace: ProjectWorkspace; storage: "d1" | "local"; versions: Array<{ id: string; version: number; reason: string; createdAt: string }> }>(`/api/projects/${id}`);
}

export function runWorkflow(id: string, action: "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "regenerate_asset", workspace: ProjectWorkspace, channel?: Channel, assetId?: string) {
  return json<{ workspace: ProjectWorkspace; storage: "d1" | "local" }>(`/api/projects/${id}/workflow`, { method: "POST", body: JSON.stringify({ action, workspace, channel, assetId }) });
}

export function saveWorkspace(workspace: ProjectWorkspace, reason: string) {
  return json<{ workspace: ProjectWorkspace; version: number; storage: "d1" | "local" }>(`/api/projects/${workspace.project.id}`, { method: "PUT", body: JSON.stringify({ workspace, reason }) });
}

export async function uploadAsset(projectId: string, file: File, kind: UploadedAsset["kind"] = "source"): Promise<UploadedAsset> {
  const body = new FormData();
  body.set("projectId", projectId);
  body.set("kind", kind);
  body.set("file", file);
  return json<UploadedAsset>("/api/assets", { method: "POST", body });
}

export function getRuntimeStatus() {
  return json<RuntimeStatus>("/api/status");
}

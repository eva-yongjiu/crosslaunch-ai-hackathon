import type { Channel, LaunchProject, ProjectWorkspace, RuntimeStatus, UploadedAsset } from "./domain";

const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
const basePath = configuredBasePath === "/" ? "" : `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");

export function appPath(path: string) {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!basePath || normalized === basePath || normalized.startsWith(`${basePath}/`)) return normalized;
  return `${basePath}${normalized}`;
}

async function json<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

export function listProjects() {
  return json<{ projects: LaunchProject[]; storage: "d1" | "local" }>(appPath("/api/projects"));
}

export function createProject(input: { name?: string; productName: string; category?: string; channels: Channel[] }) {
  return json<{ workspace: ProjectWorkspace; version: number; storage: "d1" | "local" }>(appPath("/api/projects"), { method: "POST", body: JSON.stringify(input) });
}

export function loadWorkspace(id: string) {
  return json<{ workspace: ProjectWorkspace; storage: "d1" | "local"; versions: Array<{ id: string; version: number; reason: string; createdAt: string }> }>(appPath(`/api/projects/${id}`));
}

export function deleteProject(id: string) {
  return json<void>(appPath(`/api/projects/${id}`), { method: "DELETE" });
}

export function runWorkflow(id: string, action: "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "optimize_finding" | "optimize_all" | "regenerate_asset", workspace: ProjectWorkspace, channel?: Channel, assetId?: string, findingId?: string, background = false) {
  return json<{ workspace: ProjectWorkspace; storage: "d1" | "local"; task?: ProjectWorkspace["tasks"][number]; async?: boolean }>(appPath(`/api/projects/${id}/workflow`), { method: "POST", body: JSON.stringify({ action, workspace, channel, assetId, findingId, background }) });
}

export function getTask(projectId: string, taskId: string) {
  return json<{ workspace: ProjectWorkspace; task: ProjectWorkspace["tasks"][number]; storage: "d1" | "local" }>(appPath(`/api/projects/${projectId}/tasks/${taskId}`));
}

export function saveWorkspace(workspace: ProjectWorkspace, reason: string) {
  return json<{ workspace: ProjectWorkspace; version: number; storage: "d1" | "local" }>(appPath(`/api/projects/${workspace.project.id}`), { method: "PUT", body: JSON.stringify({ workspace, reason }) });
}

export async function uploadAsset(projectId: string, file: File, kind: UploadedAsset["kind"] = "source"): Promise<UploadedAsset> {
  const body = new FormData();
  body.set("projectId", projectId);
  body.set("kind", kind);
  body.set("file", file);
  return json<UploadedAsset>(appPath("/api/assets"), { method: "POST", body });
}

export function getRuntimeStatus() {
  return retryingJson<RuntimeStatus>(appPath("/api/status"), undefined, 3);
}

async function retryingJson<T>(input: RequestInfo | URL, init?: RequestInit, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await json<T>(input, init);
    } catch (cause) {
      lastError = cause;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("状态接口暂时无法连接。");
}

import { desc, eq, ne } from "drizzle-orm";
import { getDb, hasDatabase } from "../../db";
import { projectVersions, projects, workspaces } from "../../db/schema";
import type { GenerationTask, LaunchProject, ProjectWorkspace } from "./domain";
import { deleteAssetRecordsForProject } from "./asset-repository";
import { deleteStoredProjectObjects } from "./storage";
import { normalizeWorkspace } from "./workspace";

type LocalVersion = { id: string; version: number; reason: string; createdAt: string };
type LocalStore = { projects: Record<string, LaunchProject>; workspaces: Record<string, ProjectWorkspace>; versions: Record<string, LocalVersion[]> };
const localProjectLocks = new Map<string, Promise<void>>();

async function withLocalProjectLock<T>(projectId: string, operation: () => Promise<T>) {
  const previous = localProjectLocks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  localProjectLocks.set(projectId, current);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localProjectLocks.get(projectId) === current) localProjectLocks.delete(projectId);
  }
}

async function localStorePath() {
  const path = await import("node:path");
  return path.resolve(process.env.CROSSLAUNCH_DATA_DIR?.trim() || ".data", "projects.json");
}

async function readLocalStore(): Promise<LocalStore> {
  const fs = await import("node:fs/promises");
  try {
    return JSON.parse(await fs.readFile(await localStorePath(), "utf8")) as LocalStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { projects: {}, workspaces: {}, versions: {} };
    throw error;
  }
}

async function writeLocalStore(store: LocalStore) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = await localStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("本地数据文件暂时无法保存。");
}

function projectRow(project: LaunchProject) {
  return { id: project.id, name: project.name, productName: project.productName, category: project.category, status: project.status, currentStep: project.currentStep, channelsJson: JSON.stringify(project.channels), coverageJson: JSON.stringify(project.coverage), createdAt: project.createdAt, updatedAt: project.updatedAt };
}

function hydrateProject(project: typeof projects.$inferSelect): LaunchProject {
  return { id: project.id, name: project.name, productName: project.productName, category: project.category, status: project.status as LaunchProject["status"], currentStep: project.currentStep, channels: JSON.parse(project.channelsJson), coverage: JSON.parse(project.coverageJson), createdAt: project.createdAt, updatedAt: project.updatedAt };
}

export async function databaseMode() {
  return (await hasDatabase()) ? "d1" : "local";
}

function workspaceRow(workspace: ProjectWorkspace, version: number) {
  return { projectId: workspace.project.id, truthJson: JSON.stringify(workspace.truth), listingsJson: JSON.stringify(workspace.listings), detailsJson: JSON.stringify(workspace.details), assetsJson: JSON.stringify(workspace.assets), findingsJson: JSON.stringify(workspace.findings), tasksJson: JSON.stringify(workspace.tasks), settingsJson: JSON.stringify({ outputLanguage: workspace.outputLanguage ?? "bilingual" }), version, updatedAt: workspace.project.updatedAt };
}

function taskRank(status: GenerationTask["status"]) {
  return status === "queued" ? 1 : status === "running" ? 2 : status === "needs_review" ? 3 : 4;
}

function mergeTask(existing: GenerationTask, incoming: GenerationTask): GenerationTask {
  // 完成状态不能被另一个并发快照里的失败状态倒退；其他状态按流程进度取更新的一份。
  if (existing.status === "completed" && incoming.status !== "completed") return existing;
  if (incoming.status === "completed" || taskRank(incoming.status) > taskRank(existing.status)) return incoming;
  if (taskRank(incoming.status) < taskRank(existing.status)) return existing;
  const existingCompleted = existing.progress?.completed ?? 0;
  const incomingCompleted = incoming.progress?.completed ?? 0;
  return incomingCompleted >= existingCompleted ? incoming : existing;
}

function mergeTasks(existing: GenerationTask[], incoming: GenerationTask[]) {
  const merged = new Map(existing.map((task) => [task.id, task]));
  for (const task of incoming) {
    const previous = merged.get(task.id);
    merged.set(task.id, previous ? mergeTask(previous, task) : task);
  }
  return Array.from(merged.values());
}

function mergeWorkspaceTasks(existing: ProjectWorkspace | undefined, incoming: ProjectWorkspace) {
  if (!existing) return incoming;
  return { ...incoming, tasks: mergeTasks(existing.tasks ?? [], incoming.tasks ?? []) };
}

function workspaceSettings(settingsJson: string) {
  try {
    const settings = JSON.parse(settingsJson) as { outputLanguage?: ProjectWorkspace["outputLanguage"] };
    return settings.outputLanguage === "zh-CN" ? "zh-CN" : "en-US";
  } catch {
    return "en-US" as const;
  }
}

function hydrate(project: typeof projects.$inferSelect, workspace: typeof workspaces.$inferSelect): ProjectWorkspace {
  return {
    project: { id: project.id, name: project.name, productName: project.productName, category: project.category, status: project.status as LaunchProject["status"], currentStep: project.currentStep, channels: JSON.parse(project.channelsJson), coverage: JSON.parse(project.coverageJson), createdAt: project.createdAt, updatedAt: project.updatedAt },
    outputLanguage: workspaceSettings(workspace.settingsJson),
    truth: JSON.parse(workspace.truthJson), listings: JSON.parse(workspace.listingsJson), details: JSON.parse(workspace.detailsJson), assets: JSON.parse(workspace.assetsJson), findings: JSON.parse(workspace.findingsJson), sources: [], tasks: JSON.parse(workspace.tasksJson),
  };
}

export async function listProjects() {
  if (!(await hasDatabase())) {
    const store = await readLocalStore();
    return Object.values(store.projects).filter((project) => project.id !== "project_demo").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const rows = await (await getDb()).select().from(projects).where(ne(projects.id, "project_demo")).orderBy(desc(projects.updatedAt));
  return rows.map(hydrateProject);
}

export async function getWorkspace(projectId: string) {
  if (projectId === "project_demo") return null;
  if (!(await hasDatabase())) {
    const store = await readLocalStore();
    return store.workspaces[projectId] ? normalizeWorkspace(store.workspaces[projectId]) : null;
  }
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.projectId, projectId));
  return project && workspace ? normalizeWorkspace(hydrate(project, workspace)) : null;
}

export async function saveWorkspace(workspace: ProjectWorkspace, reason: string) {
  if (!(await hasDatabase())) {
    return withLocalProjectLock(workspace.project.id, async () => {
      const store = await readLocalStore();
      const version = (store.versions[workspace.project.id]?.[0]?.version ?? 0) + 1;
      const mergedWorkspace = mergeWorkspaceTasks(store.workspaces[workspace.project.id], workspace);
      store.projects[workspace.project.id] = JSON.parse(JSON.stringify(mergedWorkspace.project)) as LaunchProject;
      store.workspaces[workspace.project.id] = JSON.parse(JSON.stringify(mergedWorkspace)) as ProjectWorkspace;
      store.versions[workspace.project.id] = [{ id: crypto.randomUUID(), version, reason, createdAt: new Date().toISOString() }, ...(store.versions[workspace.project.id] ?? [])];
      await writeLocalStore(store);
      return { workspace: mergedWorkspace, version };
    });
  }
  const db = await getDb();
  const [stored] = await db.select().from(workspaces).where(eq(workspaces.projectId, workspace.project.id));
  const version = (stored?.version ?? 0) + 1;
  const existingWorkspace = stored ? hydrateProjectWorkspaceForMerge(stored) : undefined;
  const mergedWorkspace = mergeWorkspaceTasks(existingWorkspace, workspace);
  const project = projectRow(mergedWorkspace.project);
  const snapshot = workspaceRow(mergedWorkspace, version);
  await db.insert(projects).values(project).onConflictDoUpdate({
    target: projects.id,
    set: { name: project.name, productName: project.productName, category: project.category, status: project.status, currentStep: project.currentStep, channelsJson: project.channelsJson, coverageJson: project.coverageJson, updatedAt: project.updatedAt },
  });
  await db.insert(workspaces).values(snapshot).onConflictDoUpdate({
    target: workspaces.projectId,
    set: { truthJson: snapshot.truthJson, listingsJson: snapshot.listingsJson, detailsJson: snapshot.detailsJson, assetsJson: snapshot.assetsJson, findingsJson: snapshot.findingsJson, tasksJson: snapshot.tasksJson, settingsJson: snapshot.settingsJson, version, updatedAt: snapshot.updatedAt },
  });
  await db.insert(projectVersions).values({ id: crypto.randomUUID(), projectId: mergedWorkspace.project.id, version, reason, snapshotJson: JSON.stringify(mergedWorkspace), createdAt: new Date().toISOString() });
  return { workspace: mergedWorkspace, version };
}

function hydrateProjectWorkspaceForMerge(workspace: typeof workspaces.$inferSelect): ProjectWorkspace {
  return {
    project: {} as LaunchProject,
    outputLanguage: workspaceSettings(workspace.settingsJson),
    truth: {} as ProjectWorkspace["truth"],
    listings: [], details: {} as ProjectWorkspace["details"], assets: [], findings: [], sources: [],
    tasks: JSON.parse(workspace.tasksJson) as GenerationTask[],
  };
}

export async function listVersions(projectId: string) {
  if (!(await hasDatabase())) return (await readLocalStore()).versions[projectId] ?? [];
  return (await getDb()).select({ id: projectVersions.id, version: projectVersions.version, reason: projectVersions.reason, createdAt: projectVersions.createdAt }).from(projectVersions).where(eq(projectVersions.projectId, projectId)).orderBy(desc(projectVersions.version));
}

export async function deleteProject(projectId: string) {
  if (projectId === "project_demo") throw new Error("演示项目不能删除。");
  if (!(await hasDatabase())) {
    const store = await readLocalStore();
    delete store.projects[projectId];
    delete store.workspaces[projectId];
    delete store.versions[projectId];
    await writeLocalStore(store);
  } else {
    const db = await getDb();
    await db.delete(workspaces).where(eq(workspaces.projectId, projectId));
    await db.delete(projectVersions).where(eq(projectVersions.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
  }
  await deleteAssetRecordsForProject(projectId);
  await deleteStoredProjectObjects(projectId);
}

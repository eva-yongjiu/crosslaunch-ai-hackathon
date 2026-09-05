import { desc, eq, ne } from "drizzle-orm";
import { getDb, hasDatabase } from "../../db";
import { projectVersions, projects, workspaces } from "../../db/schema";
import type { LaunchProject, ProjectWorkspace } from "./domain";
import { normalizeWorkspace } from "./workspace";

type LocalVersion = { id: string; version: number; reason: string; createdAt: string };
type LocalStore = { projects: Record<string, LaunchProject>; workspaces: Record<string, ProjectWorkspace>; versions: Record<string, LocalVersion[]> };

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
  await fs.rename(tempPath, filePath);
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

function workspaceSettings(settingsJson: string) {
  try {
    const settings = JSON.parse(settingsJson) as { outputLanguage?: ProjectWorkspace["outputLanguage"] };
    return settings.outputLanguage ?? "bilingual";
  } catch {
    return "bilingual" as const;
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
    const store = await readLocalStore();
    const version = (store.versions[workspace.project.id]?.[0]?.version ?? 0) + 1;
    store.projects[workspace.project.id] = JSON.parse(JSON.stringify(workspace.project)) as LaunchProject;
    store.workspaces[workspace.project.id] = JSON.parse(JSON.stringify(workspace)) as ProjectWorkspace;
    store.versions[workspace.project.id] = [{ id: crypto.randomUUID(), version, reason, createdAt: new Date().toISOString() }, ...(store.versions[workspace.project.id] ?? [])];
    await writeLocalStore(store);
    return { workspace, version };
  }
  const db = await getDb();
  const [stored] = await db.select().from(workspaces).where(eq(workspaces.projectId, workspace.project.id));
  const version = (stored?.version ?? 0) + 1;
  const project = projectRow(workspace.project);
  const snapshot = workspaceRow(workspace, version);
  await db.insert(projects).values(project).onConflictDoUpdate({
    target: projects.id,
    set: { name: project.name, productName: project.productName, category: project.category, status: project.status, currentStep: project.currentStep, channelsJson: project.channelsJson, coverageJson: project.coverageJson, updatedAt: project.updatedAt },
  });
  await db.insert(workspaces).values(snapshot).onConflictDoUpdate({
    target: workspaces.projectId,
    set: { truthJson: snapshot.truthJson, listingsJson: snapshot.listingsJson, detailsJson: snapshot.detailsJson, assetsJson: snapshot.assetsJson, findingsJson: snapshot.findingsJson, tasksJson: snapshot.tasksJson, settingsJson: snapshot.settingsJson, version, updatedAt: snapshot.updatedAt },
  });
  await db.insert(projectVersions).values({ id: crypto.randomUUID(), projectId: workspace.project.id, version, reason, snapshotJson: JSON.stringify(workspace), createdAt: new Date().toISOString() });
  return { workspace, version };
}

export async function listVersions(projectId: string) {
  if (!(await hasDatabase())) return (await readLocalStore()).versions[projectId] ?? [];
  return (await getDb()).select({ id: projectVersions.id, version: projectVersions.version, reason: projectVersions.reason, createdAt: projectVersions.createdAt }).from(projectVersions).where(eq(projectVersions.projectId, projectId)).orderBy(desc(projectVersions.version));
}

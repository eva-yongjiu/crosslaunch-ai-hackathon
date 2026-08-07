import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../db";
import { projectVersions, projects, workspaces } from "../../db/schema";
import type { LaunchProject, ProjectWorkspace } from "./domain";

function projectRow(project: LaunchProject) {
  return { id: project.id, name: project.name, productName: project.productName, category: project.category, status: project.status, currentStep: project.currentStep, channelsJson: JSON.stringify(project.channels), coverageJson: JSON.stringify(project.coverage), createdAt: project.createdAt, updatedAt: project.updatedAt };
}

function workspaceRow(workspace: ProjectWorkspace, version: number) {
  return { projectId: workspace.project.id, truthJson: JSON.stringify(workspace.truth), listingsJson: JSON.stringify(workspace.listings), detailsJson: JSON.stringify(workspace.details), assetsJson: JSON.stringify(workspace.assets), findingsJson: JSON.stringify(workspace.findings), tasksJson: JSON.stringify(workspace.tasks), version, updatedAt: workspace.project.updatedAt };
}

function hydrate(project: typeof projects.$inferSelect, workspace: typeof workspaces.$inferSelect): ProjectWorkspace {
  return {
    project: { id: project.id, name: project.name, productName: project.productName, category: project.category, status: project.status as LaunchProject["status"], currentStep: project.currentStep, channels: JSON.parse(project.channelsJson), coverage: JSON.parse(project.coverageJson), createdAt: project.createdAt, updatedAt: project.updatedAt },
    truth: JSON.parse(workspace.truthJson), listings: JSON.parse(workspace.listingsJson), details: JSON.parse(workspace.detailsJson), assets: JSON.parse(workspace.assetsJson), findings: JSON.parse(workspace.findingsJson), sources: [], tasks: JSON.parse(workspace.tasksJson),
  };
}

export async function listProjects() {
  return getDb().select().from(projects).where(ne(projects.id, "project_demo")).orderBy(desc(projects.updatedAt));
}

export async function getWorkspace(projectId: string) {
  if (projectId === "project_demo") return null;
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.projectId, projectId));
  return project && workspace ? hydrate(project, workspace) : null;
}

export async function saveWorkspace(workspace: ProjectWorkspace, reason: string) {
  const db = getDb();
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
    set: { truthJson: snapshot.truthJson, listingsJson: snapshot.listingsJson, detailsJson: snapshot.detailsJson, assetsJson: snapshot.assetsJson, findingsJson: snapshot.findingsJson, tasksJson: snapshot.tasksJson, version, updatedAt: snapshot.updatedAt },
  });
  await db.insert(projectVersions).values({ id: crypto.randomUUID(), projectId: workspace.project.id, version, reason, snapshotJson: JSON.stringify(workspace), createdAt: new Date().toISOString() });
  return { workspace, version };
}

export async function listVersions(projectId: string) {
  return getDb().select({ id: projectVersions.id, version: projectVersions.version, reason: projectVersions.reason, createdAt: projectVersions.createdAt }).from(projectVersions).where(eq(projectVersions.projectId, projectId)).orderBy(desc(projectVersions.version));
}

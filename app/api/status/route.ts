import { modelMode } from "../../lib/model-router";
import { hasDatabase } from "../../../db";
import { storageMode } from "../../lib/storage";

export async function GET() {
  let database: "available" | "unavailable" = "unavailable";
  try {
    const { listProjects } = await import("../../lib/repository");
    await listProjects();
    database = "available";
  } catch { /* reported as unavailable */ }
  return Response.json({
    database,
    databaseProvider: await hasDatabase() ? "d1" : "local",
    objectStorage: database === "available" ? "configured" : "unavailable",
    objectStorageProvider: await storageMode(),
    modelRouter: { configured: modelMode() === "live", mode: modelMode() },
  });
}

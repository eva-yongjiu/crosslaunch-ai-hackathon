import { modelMode } from "../../lib/model-router";

export async function GET() {
  let database: "available" | "unavailable" = "unavailable";
  try {
    const { listProjects } = await import("../../lib/repository");
    await listProjects();
    database = "available";
  } catch { /* reported as unavailable */ }
  return Response.json({
    database,
    objectStorage: database === "available" ? "configured" : "unavailable",
    modelRouter: { configured: modelMode() === "live", mode: modelMode() },
  });
}

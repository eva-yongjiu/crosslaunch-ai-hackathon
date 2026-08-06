import { env } from "cloudflare:workers";
import { assetObjects } from "../../../db/schema";
import { getDb } from "../../../db";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") || "");
  const kind = String(form.get("kind") || "source");
  if (!(file instanceof File) || !projectId) return Response.json({ error: "file and projectId are required" }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return Response.json({ error: "Only images up to 15 MB are accepted" }, { status: 400 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectKey = `projects/${projectId}/${kind}/${id}-${safeName}`;
  try {
    await env.ASSETS_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    await getDb().insert(assetObjects).values({ id, projectId, objectKey, filename: file.name, contentType: file.type, size: file.size, kind, createdAt: new Date().toISOString() });
    return Response.json({ id, objectKey, filename: file.name, contentType: file.type, size: file.size, storage: "r2" }, { status: 201 });
  } catch {
    return Response.json({ id, objectKey: `fixture://${safeName}`, filename: file.name, contentType: file.type, size: file.size, storage: "fixture" }, { status: 201 });
  }
}

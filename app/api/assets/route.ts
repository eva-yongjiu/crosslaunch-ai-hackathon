import { env } from "cloudflare:workers";
import { assetObjects } from "../../../db/schema";
import { getDb } from "../../../db";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") || "");
  const kind = String(form.get("kind") || "source");
  if (!(file instanceof File) || !projectId) return Response.json({ error: "必须提供图片和项目 ID。" }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return Response.json({ error: "仅支持 15MB 以内的图片。" }, { status: 400 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "source-image";
  const objectKey = `projects/${projectId}/${kind}/${id}-${safeName}`;
  try {
    await env.ASSETS_BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
    await getDb().insert(assetObjects).values({ id, projectId, objectKey, filename: file.name, contentType: file.type, size: file.size, kind, createdAt: new Date().toISOString() });
    return Response.json({ id, url: `/api/assets/${id}`, filename: file.name, contentType: file.type, size: file.size, kind, storage: "r2" }, { status: 201 });
  } catch (error) {
    console.error("Unable to store asset", error);
    return Response.json({ error: "图片未能写入对象存储，没有创建临时假图片。" }, { status: 503 });
  }
}

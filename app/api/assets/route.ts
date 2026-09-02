import { saveAssetRecord } from "../../lib/asset-repository";
import { putStoredObject, storageMode } from "../../lib/storage";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") || "");
  const kind = String(form.get("kind") || "source");
  if (!(file instanceof File) || !projectId) return Response.json({ error: "必须提供图片和项目 ID。" }, { status: 400 });
  if (!["source", "main", "scene", "model", "comparison", "size"].includes(kind)) return Response.json({ error: "不支持的素材类型。" }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return Response.json({ error: "仅支持 8MB 以内的图片，便于视觉模型稳定处理。" }, { status: 400 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "source-image";
  const objectKey = `projects/${projectId}/${kind}/${id}-${safeName}`;
  try {
    await putStoredObject(objectKey, file.stream(), file.type);
    await saveAssetRecord({ id, projectId, objectKey, filename: file.name, contentType: file.type, size: file.size, kind, createdAt: new Date().toISOString() });
    return Response.json({ id, url: `/api/assets/${id}`, filename: file.name, contentType: file.type, size: file.size, kind, storage: await storageMode() }, { status: 201 });
  } catch (error) {
    console.error("Unable to store asset", error);
    return Response.json({ error: "图片未能写入对象存储，没有创建临时假图片。" }, { status: 503 });
  }
}

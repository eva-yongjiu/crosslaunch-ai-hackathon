import { saveAssetRecord } from "../../lib/asset-repository";
import { putStoredObject, storageMode } from "../../lib/storage";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const imageTypeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function imageContentType(file: File) {
  if (file.type.startsWith("image/")) return file.type;
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return imageTypeByExtension[extension] || "";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error("Unable to parse image upload", error);
    return Response.json({ error: "图片上传数据读取失败，请重新选择图片后再试。" }, { status: 400 });
  }
  const file = form.get("file");
  const projectId = String(form.get("projectId") || "");
  const kind = String(form.get("kind") || "source");
  if (!(file instanceof File) || !projectId) return Response.json({ error: "必须提供图片和项目 ID。" }, { status: 400 });
  if (!["source", "main", "scene", "model", "comparison", "size"].includes(kind)) return Response.json({ error: "不支持的素材类型。" }, { status: 400 });
  const contentType = imageContentType(file);
  if (!contentType || file.size > MAX_IMAGE_BYTES) return Response.json({ error: "仅支持 JPG、PNG、WEBP、GIF 或 SVG 图片，且不能超过 8MB。" }, { status: 400 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "source-image";
  const objectKey = `projects/${projectId}/${kind}/${id}-${safeName}`;
  try {
    await putStoredObject(objectKey, file.stream(), contentType);
    await saveAssetRecord({ id, projectId, objectKey, filename: file.name, contentType, size: file.size, kind, createdAt: new Date().toISOString() });
    return Response.json({ id, url: `/api/assets/${id}`, filename: file.name, contentType, size: file.size, kind, storage: await storageMode() }, { status: 201 });
  } catch (error) {
    console.error("Unable to store asset", error);
    return Response.json({ error: "图片未能写入对象存储，没有创建临时假图片。" }, { status: 503 });
  }
}

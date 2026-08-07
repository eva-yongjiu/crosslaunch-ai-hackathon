import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { assetObjects } from "../../../../db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const [record] = await getDb().select().from(assetObjects).where(eq(assetObjects.id, id));
    if (!record) return Response.json({ error: "图片不存在。" }, { status: 404 });
    const object = await env.ASSETS_BUCKET.get(record.objectKey);
    if (!object) return Response.json({ error: "图片文件不存在。" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": record.contentType,
        "Content-Length": String(record.size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Unable to read asset", error);
    return Response.json({ error: "图片存储暂不可用。" }, { status: 503 });
  }
}

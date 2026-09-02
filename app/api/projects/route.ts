import type { Channel } from "../../lib/domain";
import { createEmptyWorkspace } from "../../lib/workspace";

const allowedChannels = new Set<Channel>(["amazon-us", "tiktok-us", "shopify-us"]);

export async function GET() {
  try {
    const { databaseMode, listProjects } = await import("../../lib/repository");
    return Response.json({ projects: await listProjects(), storage: await databaseMode() });
  } catch (error) {
    console.error("Unable to list projects", error);
    return Response.json({ error: "项目数据库暂不可用，请稍后重试。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: string; productName?: string; category?: string; channels?: Channel[] };
  const productName = body.productName?.trim();
  if (!productName) return Response.json({ error: "请输入商品名称。" }, { status: 400 });
  const channels = (body.channels ?? []).filter((channel) => allowedChannels.has(channel));
  const workspace = createEmptyWorkspace({ name: body.name, productName, category: body.category, channels });
  try {
    const { databaseMode, saveWorkspace } = await import("../../lib/repository");
    const result = await saveWorkspace(workspace, "创建空白项目");
    return Response.json({ ...result, storage: await databaseMode() }, { status: 201 });
  } catch (error) {
    console.error("Unable to create project", error);
    return Response.json({ error: "项目未能写入数据库，没有创建任何模拟数据。" }, { status: 503 });
  }
}

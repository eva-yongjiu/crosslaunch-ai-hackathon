import { zipSync } from "fflate";
import type { AssetVersion, UploadedAsset } from "../../../../lib/domain";
import { buildExportFiles, type ExportMaterial } from "../../../../lib/export-package";
import { getAssetRecord } from "../../../../lib/asset-repository";
import { getStoredObject } from "../../../../lib/storage";

const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";
const assetOrder: Record<string, number> = { main: 1, scene: 2, model: 3, comparison: 4, size: 5 };

function isLoopback(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let workspace;
  try {
    const { getWorkspace } = await import("../../../../lib/repository");
    workspace = await getWorkspace(id);
  } catch {
    return Response.json({ error: "项目数据库暂不可用。" }, { status: 503 });
  }
  if (!workspace) return Response.json({ error: "项目不存在。" }, { status: 404 });
  if (!workspace.truth.confirmedAt || workspace.listings.some((listing) => !listing.title.trim())) {
    return Response.json({ error: "事实档案尚未确认或渠道 Listing 尚未生成，不能导出。" }, { status: 409 });
  }
  const blocking = workspace.findings.filter((finding) => finding.severity === "high" && finding.status === "open");
  if (blocking.length) return Response.json({ error: "存在未处理的高风险项", blocking: blocking.map((item) => item.id) }, { status: 409 });
  if (workspace.assets.some((asset) => asset.complianceStatus !== "passed")) {
    return Response.json({ error: "仍有商品图片未通过合规复检，不能导出。" }, { status: 409 });
  }

  const materials: ExportMaterial[] = [];
  const seenAssetIds = new Set<string>();
  const sourceAsset = workspace.truth.sourceAsset;
  const exportAssets: Array<AssetVersion | UploadedAsset> = sourceAsset ? [sourceAsset, ...workspace.assets] : [...workspace.assets];
  const publicImages = !isLoopback(request);
  const publicAssetUrl = (assetId: string) => publicImages ? new URL(`/api/assets/${assetId}`, request.url).toString() : "";
  const channelPosition: Record<string, number> = {};
  for (const asset of exportAssets) {
    if (seenAssetIds.has(asset.id)) continue;
    seenAssetIds.add(asset.id);
    const record = await getAssetRecord(asset.id);
    const label = "filename" in asset ? asset.filename : `${asset.channel}/${asset.kind}`;
    if (!record) return Response.json({ error: `素材记录不存在：${label}` }, { status: 409 });
    const object = await getStoredObject(record.objectKey);
    if (!object) return Response.json({ error: `素材文件不存在：${label}` }, { status: 409 });
    const isChannelAsset = "channel" in asset;
    const positionKey = isChannelAsset ? asset.channel : "source";
    channelPosition[positionKey] = (channelPosition[positionKey] ?? 0) + 1;
    const position = isChannelAsset ? channelPosition[positionKey] : 1;
    const prefix = isChannelAsset ? `${String(position).padStart(2, "0")}-${asset.kind}` : "source-product";
    const folder = isChannelAsset ? `assets/${asset.channel}` : "assets/source";
    materials.push({
      asset,
      filename: record.filename,
      bytes: new Uint8Array(await object.arrayBuffer()),
      archivePath: `${folder}/${prefix}-${safeFileName(record.filename)}`,
      publicUrl: publicAssetUrl(asset.id),
    });
  }
  materials.sort((a, b) => {
    const aChannel = "channel" in a.asset ? a.asset.channel : "source";
    const bChannel = "channel" in b.asset ? b.asset.channel : "source";
    if (aChannel !== bChannel) return aChannel.localeCompare(bChannel);
    return (assetOrder[a.asset.kind] ?? 99) - (assetOrder[b.asset.kind] ?? 99);
  });
  const files = buildExportFiles(workspace, materials);
  const archive = zipSync(files, { level: 6 });
  const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  return new Response(archiveBuffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="crosslaunch-${id}.zip"`, "Cache-Control": "no-store" } });
}

import { strToU8, zipSync } from "fflate";
import { getAssetRecord } from "../../../../lib/asset-repository";
import { getStoredObject } from "../../../../lib/storage";

const jsonFile = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let workspace;
  try { const { getWorkspace } = await import("../../../../lib/repository"); workspace = await getWorkspace(id); }
  catch { return Response.json({ error: "项目数据库暂不可用。" }, { status: 503 }); }
  if (!workspace) return Response.json({ error: "项目不存在。" }, { status: 404 });
  if (!workspace.truth.confirmedAt || workspace.listings.some((listing) => !listing.title.trim())) {
    return Response.json({ error: "事实档案尚未确认或渠道 Listing 尚未生成，不能导出。" }, { status: 409 });
  }
  const blocking = workspace.findings.filter((finding) => finding.severity === "high" && finding.status === "open");
  if (blocking.length) return Response.json({ error: "存在未处理的高风险项", blocking: blocking.map((item) => item.id) }, { status: 409 });
  if (workspace.assets.some((asset) => asset.complianceStatus !== "passed")) {
    return Response.json({ error: "仍有商品图片未通过合规复检，不能导出。" }, { status: 409 });
  }
  const manifest = { product: workspace.project.productName, category: workspace.truth.category, channels: workspace.project.channels, exportedAt: new Date().toISOString(), disclaimer: "AI risk screening does not replace platform review or legal advice." };
  const shopify = workspace.listings.find((item) => item.channel === "shopify-us");
  const listingCsv = ["channel,title,bullets,description,search_terms,score", ...workspace.listings.map((item) => [item.channel, item.title, item.bullets.join(" | "), item.description, item.searchTerms ?? "", String(item.score)].map(csvCell).join(","))].join("\r\n");
  const shopifyHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${shopify?.metaTitle ?? shopify?.title ?? workspace.project.productName}</title><meta name="description" content="${shopify?.metaDescription ?? ""}"></head><body><main><h1>${shopify?.title ?? workspace.project.productName}</h1><p>${shopify?.description ?? ""}</p>${(workspace.details["shopify-us"] ?? []).map((module) => `<section data-module="${module.type}"><h2>${module.title}</h2><p>${module.body}</p></section>`).join("")}</main></body></html>`;
  const assetFiles: Record<string, Uint8Array> = {};
  const sourceAsset = workspace.truth.sourceAsset;
  const assetsToExport = sourceAsset ? [sourceAsset, ...workspace.assets] : [...workspace.assets];
  const seenAssetIds = new Set<string>();
  for (const asset of assetsToExport) {
    if (seenAssetIds.has(asset.id)) continue;
    seenAssetIds.add(asset.id);
    const record = await getAssetRecord(asset.id);
    const label = "filename" in asset ? asset.filename : `${asset.channel}/${asset.kind}`;
    if (!record) return Response.json({ error: `素材记录不存在：${label}` }, { status: 409 });
    const object = await getStoredObject(record.objectKey);
    if (!object) return Response.json({ error: `素材文件不存在：${label}` }, { status: 409 });
    const folder = "channel" in asset ? `assets/${asset.channel}` : "assets/source";
    assetFiles[`${folder}/${safeFileName(record.filename)}`] = new Uint8Array(await object.arrayBuffer());
  }
  const archive = zipSync({
    "manifest.json": jsonFile(manifest),
    "product/truth-profile.json": jsonFile(workspace.truth),
    "listings/all-channels.json": jsonFile(workspace.listings),
    "listings/all-channels.csv": strToU8(`\uFEFF${listingCsv}`),
    "shopify/product-page.html": strToU8(shopifyHtml),
    "shopify/product-page.json": jsonFile({ listing: shopify, modules: workspace.details["shopify-us"] }),
    "details/modules.json": jsonFile(workspace.details),
    "assets/asset-manifest.json": jsonFile(workspace.assets),
    ...assetFiles,
    "compliance/report.json": jsonFile({ coverage: workspace.project.coverage, findings: workspace.findings }),
    "compliance/rule-sources.json": jsonFile(workspace.sources),
    "project/generation-trace.json": jsonFile(workspace.tasks),
  }, { level: 6 });
  const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
  return new Response(archiveBuffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="crosslaunch-${id}.zip"`, "Cache-Control": "no-store" } });
}

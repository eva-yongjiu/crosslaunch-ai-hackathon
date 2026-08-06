import { cloneFixture } from "../../../../lib/fixtures";
import { strToU8, zipSync } from "fflate";

const jsonFile = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let workspace;
  try { const { getWorkspace } = await import("../../../../lib/repository"); workspace = await getWorkspace(id); } catch { workspace = null; }
  workspace ??= cloneFixture();
  const blocking = workspace.findings.filter((finding) => finding.severity === "high" && finding.status === "open");
  if (blocking.length) return Response.json({ error: "存在未处理的高风险项", blocking: blocking.map((item) => item.id) }, { status: 409 });
  const manifest = { product: workspace.project.productName, category: workspace.truth.category, channels: workspace.project.channels, exportedAt: new Date().toISOString(), disclaimer: "AI risk screening does not replace platform review or legal advice." };
  const shopify = workspace.listings.find((item) => item.channel === "shopify-us");
  const listingCsv = ["channel,title,bullets,description,search_terms,score", ...workspace.listings.map((item) => [item.channel, item.title, item.bullets.join(" | "), item.description, item.searchTerms ?? "", String(item.score)].map(csvCell).join(","))].join("\r\n");
  const shopifyHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${shopify?.metaTitle ?? shopify?.title ?? workspace.project.productName}</title><meta name="description" content="${shopify?.metaDescription ?? ""}"></head><body><main><h1>${shopify?.title ?? workspace.project.productName}</h1><p>${shopify?.description ?? ""}</p>${(workspace.details["shopify-us"] ?? []).map((module) => `<section data-module="${module.type}"><h2>${module.title}</h2><p>${module.body}</p></section>`).join("")}</main></body></html>`;
  const archive = zipSync({
    "manifest.json": jsonFile(manifest),
    "product/truth-profile.json": jsonFile(workspace.truth),
    "listings/all-channels.json": jsonFile(workspace.listings),
    "listings/all-channels.csv": strToU8(`\uFEFF${listingCsv}`),
    "shopify/product-page.html": strToU8(shopifyHtml),
    "shopify/product-page.json": jsonFile({ listing: shopify, modules: workspace.details["shopify-us"] }),
    "details/modules.json": jsonFile(workspace.details),
    "assets/asset-manifest.json": jsonFile(workspace.assets),
    "compliance/report.json": jsonFile({ coverage: workspace.project.coverage, findings: workspace.findings }),
    "compliance/rule-sources.json": jsonFile(workspace.sources),
    "project/generation-trace.json": jsonFile(workspace.tasks),
  }, { level: 6 });
  return new Response(archive, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="crosslaunch-${id}.zip"`, "Cache-Control": "no-store" } });
}

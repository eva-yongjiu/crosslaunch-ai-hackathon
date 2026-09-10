import { strToU8 } from "fflate";
import type { AssetVersion, Channel, ChannelListing, DetailModule, ProjectWorkspace, UploadedAsset } from "./domain";
import { ruleSources } from "./rules";

export interface ExportMaterial {
  asset: AssetVersion | UploadedAsset;
  filename: string;
  bytes: Uint8Array;
  archivePath: string;
  publicUrl: string;
}

const channelNames: Record<Channel, string> = { "amazon-us": "Amazon US", "tiktok-us": "TikTok Shop US", "shopify-us": "Shopify US" };
const assetNames: Record<string, string> = { source: "商品原图", main: "白底主图", scene: "场景图", model: "模特图", comparison: "对比图", size: "尺寸图" };
const assetOrder: Record<string, number> = { main: 1, scene: 2, model: 3, comparison: 4, size: 5, source: 99 };

const jsonFile = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
const textFile = (value: string) => strToU8(value);
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvFile = (headers: string[], rows: Array<Array<unknown>>) => textFile(`\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`);
const htmlEscape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function slug(value: string) {
  const result = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return result || "product";
}

function channelsMaterials(channel: Channel, materials: ExportMaterial[]) {
  return materials.filter((material): material is ExportMaterial & { asset: AssetVersion } => "channel" in material.asset && material.asset.channel === channel).sort((a, b) => (assetOrder[a.asset.kind] ?? 99) - (assetOrder[b.asset.kind] ?? 99));
}

function fieldRows(listing: ChannelListing, channel: Channel) {
  const rows: Array<[string, string, string, string, string]> = [
    ["Product title", listing.title, listing.titleZh ?? "", "商品标题 / Product title", listing.claims.map((claim) => claim.factIds.join("|")).filter(Boolean).join("|")],
  ];
  const bulletCount = channel === "amazon-us" ? 5 : listing.bullets.length;
  for (let index = 0; index < bulletCount; index += 1) {
    rows.push([`Bullet ${index + 1}`, listing.bullets[index] ?? "", listing.bulletsZh?.[index] ?? "", "核心卖点 / Selling point", listing.claims.map((claim) => claim.factIds.join("|")).filter(Boolean).join("|")]);
  }
  rows.push(["Description", listing.description, listing.descriptionZh ?? "", "商品描述 / Product description", listing.claims.map((claim) => claim.factIds.join("|")).filter(Boolean).join("|")]);
  if (listing.searchTerms !== undefined) rows.push(["Search terms", listing.searchTerms, listing.searchTermsZh ?? "", "搜索词 / Search terms", ""]);
  if (listing.metaTitle !== undefined) rows.push(["SEO title", listing.metaTitle, listing.metaTitleZh ?? "", "SEO 标题 / SEO title", ""]);
  if (listing.metaDescription !== undefined) rows.push(["SEO description", listing.metaDescription, listing.metaDescriptionZh ?? "", "SEO 描述 / SEO description", ""]);
  return rows;
}

function detailRows(modules: DetailModule[]) {
  return modules.map((module) => [module.type, module.title, module.titleZh ?? "", module.body, module.bodyZh ?? "", module.assetIds.join("|")]);
}

function imageRows(materials: ExportMaterial[], channel: Channel) {
  return channelsMaterials(channel, materials).map((material, index) => [
    index + 1,
    index === 0 ? "Main image / 主图" : `Additional image ${index} / 附图 ${index}`,
    assetNames[material.asset.kind] ?? material.asset.kind,
    material.archivePath,
    material.publicUrl,
    material.asset.complianceStatus,
    `${material.asset.consistencyScore}%`,
    material.asset.retries,
    index === 0 ? "主图位置；不要添加文字、徽章或水印" : "附图位置；保持商品真实外观",
  ]);
}

function platformReadme(workspace: ProjectWorkspace, channel: Channel) {
  const common = `# ${channelNames[channel]} 成品包\n\n商品：${workspace.project.productName}\n\n本文件夹是运营交付区。英文内容用于美国渠道发布，中文内容用于阅读、校对和修改。图片已经通过当前项目的合规复检后才会进入本包。\n\n`;
  if (channel === "amazon-us") {
    return `${common}## 你在 Amazon 需要填写什么\n\n1. 商品信息：标题、最多 5 条 Bullet Points、Product Description、Search Terms。\n2. 商品基础资料：Brand、SKU、价格、库存、GTIN/UPC/EAN、包装尺寸重量、配送和类目属性。\n3. 图片：1 张主图 + 附图；主图使用白底图，附图按图片顺序上传。\n\n## 本包怎么用\n\n- 打开 \`01-listing-copy.csv\`：把 English for publishing 列复制到 Seller Central 对应字段，Chinese reference 列用于校对。\n- 打开 \`02-image-order.csv\`：按 Position 上传 \`assets/amazon-us/\` 下的图片。\n- 打开 \`03-detail-modules.csv\`：用于 A+ 或详情页模块的人工排版。\n\n## 重要：批量上传不是通用 CSV\n\nAmazon 批量上传需要先在 Seller Central 按最终叶子类目下载官方 Inventory File Template，再把本包内容填入该官方模板。\`01-listing-copy.csv\` 是字段级交付表，不要把它直接当作 Amazon 类目模板上传。单品发布可以直接复制到 Add Products 表单。\n\n规则参考：[Amazon 商品图片要求](${workspace.sources.find((source) => source.id === "amazon-images")?.url ?? "https://sellercentral.amazon.com/"})\n`;
  }
  if (channel === "tiktok-us") {
    return `${common}## 你在 TikTok Shop 需要填写什么\n\n1. Product name/title、Product description、正确的叶子类目和类目属性。\n2. Brand 授权（如适用）、SKU、价格、库存、GTIN、包裹重量尺寸、仓库和物流。\n3. 至少 5 张高分辨率商品图时优先使用本包前 5 张；每个商品最多 9 张方图，主图放第一张。\n\n## 本包怎么用\n\n- 单品发布：打开 \`01-listing-copy.csv\`，复制 English for publishing 列到 Seller Center 的字段。\n- 图片：按照 \`02-image-order.csv\` 的 Position 上传对应文件。\n- 详情内容：打开 \`03-detail-modules.csv\`，按模块放到商品描述中。\n\n## 重要：批量上传必须用官方类目 Excel\n\nTikTok Shop 的 Bulk Listing 模板按叶子类目生成，不能用任意自制 CSV 直接上传。请先在 Seller Center 下载当前类目官方 Excel，再把本包的标题、描述、图片 URL 和属性复制进去；不要新增、删除或改动官方模板的列。\n\n规则参考：[TikTok Shop Product Listing Policy](${workspace.sources.find((source) => source.id === "tiktok-listing")?.url ?? "https://seller-us.tiktok.com/university/"})\n`;
  }
  return `${common}## 你在 Shopify 需要填写什么\n\n1. Product title、Description、Product type、Tags。\n2. Vendor、SKU、价格、库存、条码、税费和配送设置。\n3. 商品图片必须使用可公开访问的 HTTPS 图片 URL。\n\n## 本包怎么用\n\n- 打开 \`products-import.csv\`，在 Shopify Admin > Products > Import 上传。\n- 本文件默认 Published=FALSE / Status=draft，导入后请在后台预览，再补齐 Vendor、价格、库存和商品分类。\n- 如果 Image Src 为空，说明本次导出来自本地地址：先把 \`assets/shopify-us/\` 图片上传到可公开访问的图床或 Shopify Files，再把 URL 填入 \`products-import.csv\`；对应关系见 \`image-url-map.csv\`。\n- \`product-page.html\` 是可复制到主题/自定义页面的详情页 HTML，不是 Shopify 产品 CSV 的替代品。\n\n标准字段参考：[Shopify 产品 CSV 导入说明](https://help.shopify.com/en/manual/products/import-export/using-csv)\n`;
}

function shopifyBody(listing: ChannelListing, modules: DetailModule[], materials: ExportMaterial[]) {
  const images = channelsMaterials("shopify-us", materials).filter((material) => material.publicUrl);
  const description = listing.description ? `<p>${htmlEscape(listing.description).replaceAll("\n", "<br>")}</p>` : "";
  const moduleHtml = modules.map((module) => `<section><h2>${htmlEscape(module.title)}</h2><p>${htmlEscape(module.body).replaceAll("\n", "<br>")}</p></section>`).join("");
  const imageHtml = images.map((material) => `<p><img src="${htmlEscape(material.publicUrl)}" alt="${htmlEscape(assetNames[material.asset.kind])}"></p>`).join("");
  return `${description}${moduleHtml}${imageHtml}`;
}

function shopifyRows(workspace: ProjectWorkspace, materials: ExportMaterial[]): { headers: string[]; rows: Array<Array<unknown>> } | null {
  const listing = workspace.listings.find((item) => item.channel === "shopify-us");
  if (!listing) return null;
  const handle = slug(workspace.project.productName);
  const images = channelsMaterials("shopify-us", materials);
  const body = shopifyBody(listing, workspace.details["shopify-us"] ?? [], materials);
  const headers = ["Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "SEO Title", "SEO Description", "Status"];
  const first = [handle, listing.title, body, "", "", workspace.truth.category, (listing.searchTerms ?? "").replaceAll(" ", ","), "FALSE", "Title", "Default", "", "", "", "", "TRUE", "TRUE", "", images[0]?.publicUrl ?? "", images[0] ? 1 : "", images[0] ? assetNames[images[0].asset.kind] : "", listing.metaTitle ?? listing.title, listing.metaDescription ?? listing.description, "draft"];
  const extraImages = images.slice(1).map((material, index) => [handle, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", material.publicUrl, index + 2, assetNames[material.asset.kind], "", "", ""]);
  return { headers, rows: [first, ...extraImages] };
}

function reportHtml(workspace: ProjectWorkspace) {
  const sources = workspace.sources.length ? workspace.sources : ruleSources;
  const findings = workspace.findings.map((finding) => `<tr><td>${htmlEscape(finding.status)}</td><td>${htmlEscape(finding.severity)}</td><td>${htmlEscape(finding.target)}</td><td>${htmlEscape(finding.excerpt)}</td><td>${htmlEscape(sources.find((source) => source.id === finding.sourceId)?.title ?? finding.sourceId)}</td></tr>`).join("");
  const coverage = workspace.project.channels.map((channel) => `<li>${channelNames[channel]}：${workspace.project.coverage[channel]}</li>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>上新无界合规报告</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#163229;max-width:1000px;margin:40px auto;padding:0 20px}h1{font-size:28px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d8ddd4;padding:8px;text-align:left}th{background:#edf2e9}.note{padding:12px;background:#fff3d2}</style></head><body><h1>上新无界 · 合规筛查报告</h1><p>商品：${htmlEscape(workspace.project.productName)}；生成时间：${new Date().toISOString()}</p><p class="note">本报告是 AI 风险筛查结果，不替代平台审核、检测认证或法律意见。规则覆盖为 partial/unsupported 的品类仍需人工审核。</p><h2>渠道覆盖</h2><ul>${coverage}</ul><h2>发现明细</h2><table><thead><tr><th>状态</th><th>级别</th><th>位置</th><th>问题</th><th>规则来源</th></tr></thead><tbody>${findings || "<tr><td colspan=5>当前没有保存的风险发现；空记录不等同于完成法律审查。</td></tr>"}</tbody></table></body></html>`;
}

export function buildExportFiles(workspace: ProjectWorkspace, materials: ExportMaterial[]) {
  const sources = workspace.sources.length ? workspace.sources : ruleSources;
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, value: Uint8Array | string | unknown) => { files[path] = value instanceof Uint8Array ? value : typeof value === "string" ? textFile(value) : jsonFile(value); };
  const platforms = {
    "amazon-us": { delivery: "copy-ready", bulk: "official-category-template-required", title: "字段可复制；批量上传需官方类目模板" },
    "tiktok-us": { delivery: "copy-ready", bulk: "official-leaf-category-template-required", title: "字段可复制；批量上传需官方类目 Excel" },
    "shopify-us": { delivery: "csv-import", bulk: "shopify-product-csv", title: "标准产品 CSV；图片 URL 和店铺字段需确认" },
  };
  const manifest = {
    product: workspace.project.productName,
    category: workspace.truth.category,
    channels: workspace.project.channels,
    outputLanguage: workspace.outputLanguage ?? "bilingual",
    exportedAt: new Date().toISOString(),
    delivery: Object.fromEntries(workspace.project.channels.map((channel) => [channel, platforms[channel]])),
    userStartHere: "README-START-HERE.txt",
    auditFolders: ["audit/", "technical/"],
    disclaimer: "AI risk screening does not replace platform review or legal advice.",
  };
  const allListingRows = workspace.listings.map((listing) => [listing.channel, listing.title, listing.titleZh ?? "", listing.bullets.join(" | "), (listing.bulletsZh ?? []).join(" | "), listing.description, listing.descriptionZh ?? "", listing.searchTerms ?? "", listing.searchTermsZh ?? "", listing.score]);
  const readme = `# 上新无界 · 分平台交付包\n\n商品：${workspace.project.productName}\n导出时间：${manifest.exportedAt}\n\n## 先看这里\n\n1. 进入对应平台文件夹：\`amazon-us\`、\`tiktok-us\` 或 \`shopify-us\`。\n2. 先阅读该文件夹的 \`START-HERE.txt\`。\n3. 日常运营只需要看 \`01-listing-copy.csv\`、\`02-image-order.csv\` 和对应图片。\n4. \`audit/\` 与 \`technical/\` 只用于审计、追溯和开发排查，不要求运营人员打开。\n\n## 三个平台的交付方式\n\n- Amazon US：内容和图片可直接复制/上传；批量导入必须套 Amazon 按叶子类目下载的官方 Inventory File Template。\n- TikTok Shop US：内容和图片可直接复制/上传；批量导入必须套 Seller Center 当前叶子类目的官方 Excel。\n- Shopify US：\`shopify-us/products-import.csv\` 按 Shopify 产品 CSV 格式生成；本地导出时图片 URL 为空，需要先换成公开 HTTPS 地址。\n\n## 仍需人工补齐的经营字段\n\n价格、库存、SKU、条码、Vendor/Brand、包装重量尺寸、仓库物流、税费和平台账号权限不是 AI 可以凭空生成的字段。本包已把它们标为待补充，避免把猜测内容提交到平台。\n\n合规说明：本工具是风险筛查工具，不替代平台审核、检测认证或法律意见。\n`;
  put("README-START-HERE.txt", readme);
  put("manifest.json", manifest);
  put("audit/compliance-report.html", reportHtml(workspace));
  put("audit/compliance-report.json", { coverage: workspace.project.coverage, findings: workspace.findings, sources });
  put("audit/rule-sources.json", sources);
  put("audit/truth-profile.json", workspace.truth);
  put("audit/generation-trace.json", workspace.tasks);
  put("audit/all-channels.csv", csvFile(["channel", "title", "title_zh", "bullets", "bullets_zh", "description", "description_zh", "search_terms", "search_terms_zh", "score"], allListingRows));
  put("technical/project.json", { project: workspace.project, exportedAt: manifest.exportedAt, assetCount: materials.length, findingCount: workspace.findings.length });
  put("assets/asset-map.csv", csvFile(["channel", "kind", "role", "archive_file", "public_url", "compliance_status", "consistency_score", "retries"], materials.map((material) => ["channel" in material.asset ? channelNames[material.asset.channel] : "source", material.asset.kind, assetNames[material.asset.kind] ?? material.asset.kind, material.archivePath, material.publicUrl, "complianceStatus" in material.asset ? material.asset.complianceStatus : "source", "consistencyScore" in material.asset ? `${material.asset.consistencyScore}%` : "", "retries" in material.asset ? material.asset.retries : ""])));
  for (const material of materials) put(material.archivePath, material.bytes);

  for (const channel of workspace.project.channels) {
    const listing = workspace.listings.find((item) => item.channel === channel);
    if (!listing) continue;
    const folder = channel;
    const rows = fieldRows(listing, channel);
    const images = imageRows(materials, channel);
    const modules = detailRows(workspace.details[channel] ?? []);
    put(`${folder}/START-HERE.txt`, platformReadme(workspace, channel));
    put(`${folder}/01-listing-copy.csv`, csvFile(["field", "English for publishing", "Chinese reference", "where to use", "linked fact IDs"], rows));
    put(`${folder}/02-image-order.csv`, csvFile(["position", "upload role", "asset type", "archive file", "public URL", "compliance", "consistency", "retries", "operator note"], images));
    put(`${folder}/03-detail-modules.csv`, csvFile(["module type", "English title", "Chinese title", "English body", "Chinese body", "asset IDs"], modules));
    if (channel === "shopify-us") {
      const shopify = shopifyRows(workspace, materials);
      if (shopify) put("shopify-us/products-import.csv", csvFile(shopify.headers, shopify.rows));
      put("shopify-us/product-page.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${htmlEscape(listing.metaTitle ?? listing.title)}</title><meta name="description" content="${htmlEscape(listing.metaDescription ?? "")}"></head><body><main><h1>${htmlEscape(listing.title)}</h1>${shopifyBody(listing, workspace.details[channel] ?? [], materials)}</main></body></html>`);
      put("shopify-us/image-url-map.csv", csvFile(["position", "asset type", "archive file", "Image Src", "status", "action"], channelsMaterials(channel, materials).map((material, index) => [index + 1, assetNames[material.asset.kind], material.archivePath, material.publicUrl, material.publicUrl ? "ready" : "local export: missing public URL", material.publicUrl ? "可直接保留" : "上传到公开 HTTPS 地址后填入 products-import.csv"])));
    }
  }
  return files;
}

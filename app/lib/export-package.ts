import { strToU8 } from "fflate";
import type { AssetVersion, Channel, ChannelListing, DetailModule, ProjectWorkspace, UploadedAsset } from "./domain";
import { platformFieldRequirements } from "./rules";

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

function fieldRows(listing: ChannelListing, channel: Channel, workspace: ProjectWorkspace) {
  const factNames = new Map(workspace.truth.attributes.map((fact) => [fact.id, `${fact.nameZh || fact.name}: ${fact.valueZh || fact.value}`]));
  const linkedFacts = listing.claims.flatMap((claim) => claim.factIds.map((id) => factNames.get(id) || "")).filter(Boolean).join("；");
  const rows: Array<[string, string, string, string, string]> = [
    ["Product title", listing.title, listing.titleZh ?? "", "商品标题 / Product title", linkedFacts],
  ];
  const bulletCount = channel === "amazon-us" ? 5 : listing.bullets.length;
  for (let index = 0; index < bulletCount; index += 1) {
    rows.push([`Bullet ${index + 1}`, listing.bullets[index] ?? "", listing.bulletsZh?.[index] ?? "", "核心卖点 / Selling point", linkedFacts]);
  }
  rows.push(["Description", listing.description, listing.descriptionZh ?? "", "商品描述 / Product description", linkedFacts]);
  if (listing.searchTerms !== undefined) rows.push(["Search terms", listing.searchTerms, listing.searchTermsZh ?? "", "搜索词 / Search terms", ""]);
  if (listing.metaTitle !== undefined) rows.push(["SEO title", listing.metaTitle, listing.metaTitleZh ?? "", "SEO 标题 / SEO title", ""]);
  if (listing.metaDescription !== undefined) rows.push(["SEO description", listing.metaDescription, listing.metaDescriptionZh ?? "", "SEO 描述 / SEO description", ""]);
  const fields = (listing.platformFields ?? platformFieldRequirements[channel].map((item) => ({ ...item, value: "", valueZh: "", status: "missing" as const, factIds: [] })));
  for (const field of fields) rows.push([field.label, field.value || "", field.valueZh ?? "", `${field.labelZh}：发布时填写`, field.status === "ready" ? "已准备" : `待填写：${field.helpZh}`]);
  return rows;
}

function detailText(modules: DetailModule[]) {
  return modules.map((module, index) => `模块 ${index + 1}｜${module.type}\n英文标题：${module.title}\n中文标题：${module.titleZh ?? ""}\n英文正文：\n${module.body}\n中文对照：\n${module.bodyZh ?? ""}\n`).join("\n------------------------------\n\n");
}

function imageRows(materials: ExportMaterial[], channel: Channel) {
  return channelsMaterials(channel, materials).map((material, index) => [
    index + 1,
    index === 0 ? "Main image / 主图" : `Additional image ${index} / 附图 ${index}`,
    assetNames[material.asset.kind] ?? material.asset.kind,
    material.archivePath,
    material.publicUrl || "本地包内文件；上传到平台后使用",
    index === 0 ? "主图位置；不要添加文字、徽章或水印" : "按顺序上传；确保展示的就是实际销售商品",
  ]);
}

function platformReadme(workspace: ProjectWorkspace, channel: Channel) {
  const common = `# ${channelNames[channel]} 发布包\n\n商品：${workspace.project.productName}\n\n英文内容可复制到美国站点；中文内容只用于校对。图片是当前项目通过复检的销售素材。\n\n## 重要注意事项\n\n本包只提供商品内容和素材，价格、库存、SKU、品牌授权、商品编码、仓库物流、税费和类目资质必须由商家按真实信息补齐。AI 检查是风险筛查，不替代平台审核、检测认证或法律意见。\n\n`;
  if (channel === "amazon-us") {
    return `${common}## Amazon 官方上架要点\n\n- 商品详情页需要标题、最多 5 条 Bullet Points、商品描述、图片和商品详情；Offer 区域还要填写数量、价格、商品状态和配送方式。\n- 主图应是实际商品的专业图片，使用纯白背景；不得添加文字、Logo、水印、边框、色块或会造成误解的道具。\n- 商品内容必须准确描述实际销售商品，不能放卖家联系方式、价格、配送承诺、促销信息或未经证实的参数。\n\n## 使用顺序\n\n1. 打开 \`01-发布字段表.csv\`，复制英文列到 Seller Central 的对应字段，中文列用于校对。\n2. 打开 \`02-图片上传顺序.csv\`，按位置上传 \`图片/\` 文件夹中的图片。\n3. 详情页/A+ 内容参考 \`03-详情页文案.txt\`。\n4. 批量上传必须先在 Seller Central 按最终叶子类目下载 Amazon 官方 Inventory File Template，再把本包字段填入，不要直接上传自制表格。\n\n官方规则来源：\n- Product Image Requirements：${workspace.sources.find((source) => source.id === "amazon-images")?.url ?? "https://sellercentral.amazon.com/help/hub/reference/G1881"}\n- Product Detail Page Rules：${workspace.sources.find((source) => source.id === "amazon-detail")?.url ?? "https://sellercentral.amazon.com/help/hub/reference/G200390640"}\n- How to create Amazon product listings：${workspace.sources.find((source) => source.id === "amazon-listing")?.url ?? "https://sell.amazon.com/blog/amazon-product-listings"}\n`;
  }
  if (channel === "tiktok-us") {
    return `${common}## TikTok Shop 官方上架要点\n\n- 商品发布包括 Basic information、Product details、Sales information 和 Shipping；还可能要求认证或法定警示。\n- 标题应准确、简洁，包含品牌（如适用）、商品类型和识别信息；不能写折扣、库存、Best Seller、Buy Now 等促销或诱导内容。\n- 主图应展示商品正面、纯白背景；最多 9 张方图，图片至少 600×600，不能有文字、Logo、水印、边框或遮挡商品的图形。\n- 商品描述、图片、属性、规格和变体必须与顾客实际收到的商品一致；不能放网址、二维码或站外联系方式。\n\n## 使用顺序\n\n1. 打开 \`01-发布字段表.csv\`，将英文内容复制到 Seller Center。\n2. 打开 \`02-图片上传顺序.csv\`，按位置上传 \`图片/\` 文件夹中的 JPG/PNG。\n3. 商品描述和模块参考 \`03-详情页文案.txt\`。\n4. 批量发布必须使用 Seller Center 当前叶子类目生成的官方 Excel 模板，不要直接上传自制 CSV。\n\n官方规则来源：\n- Product Listing Policy：${workspace.sources.find((source) => source.id === "tiktok-listing")?.url ?? "https://seller-us.tiktok.com/university/essay?knowledge_id=3196690250417921"}\n- How to Add Products to Your Shop：${workspace.sources.find((source) => source.id === "tiktok-add-products")?.url ?? "https://seller-us.tiktok.com/university/essay?knowledge_id=6581713858676522"}\n- Product Detail Pages & Listing Quality Guidelines：${workspace.sources.find((source) => source.id === "tiktok-quality")?.url ?? "https://seller-us.tiktok.com/university/essay?knowledge_id=481891871868714"}\n`;
  }
  return `${common}## Shopify 官方上架要点\n\n- Shopify 产品 CSV 新建商品时 Title 是必填；Handle、Description、Vendor、Product category、Type、Tags、Published、Status、SKU、价格、库存、条码、配送和图片地址等字段按店铺实际情况填写。\n- CSV 第一行必须使用 Shopify 官方字段名，字段用逗号分隔，并保存为 UTF-8。\n- 图片地址必须是可用的图片 URL；本地下载包中的图片不能直接作为 Image Src，需先上传到 Shopify Files 或其他公开 HTTPS 地址。\n- SEO Title 建议不超过 70 个字符，SEO Description 建议不超过 320 个字符；导入后先保持 draft，在 Shopify 后台预览确认。\n\n## 使用顺序\n\n1. 先把 \`图片/\` 中的图片上传到公开 HTTPS 地址。\n2. 将图片地址填入 \`products-import.csv\` 的 Image Src，再到 Shopify Admin > Products > Import 导入。\n3. 若需自定义详情页，参考 \`商品详情页.html\`。\n\n官方规则来源：\n- Using CSV files to import and export products：${workspace.sources.find((source) => source.id === "shopify-csv")?.url ?? "https://help.shopify.com/en/manual/products/import-export/using-csv"}\n- Product media guidance：${workspace.sources.find((source) => source.id === "shopify-media")?.url ?? "https://help.shopify.com/en/manual/products/product-media"}\n- Adding keywords for SEO：${workspace.sources.find((source) => source.id === "shopify-seo")?.url ?? "https://help.shopify.com/en/manual/promoting-marketing/seo/adding-keywords"}\n`;
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
  const headers = ["URL handle", "Title", "Description", "Vendor", "Product category", "Type", "Tags", "Published on online store", "Status", "SKU", "Barcode", "Option1 name", "Option1 value", "Price", "Charge tax", "Inventory tracker", "Inventory quantity", "Requires shipping", "Fulfillment service", "Product image URL", "Image position", "Image alt text", "SEO title", "SEO description"];
  const first = [handle, listing.title, body, "", workspace.truth.category, workspace.truth.category, (listing.searchTerms ?? "").replaceAll(" ", ","), "false", "draft", "", "", "Title", "Default Title", "", "true", "", "", "true", "manual", images[0]?.publicUrl ?? "", images[0] ? 1 : "", images[0] ? assetNames[images[0].asset.kind] : "", listing.metaTitle ?? listing.title, listing.metaDescription ?? listing.description];
  const extraImages = images.slice(1).map((material, index) => [handle, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", material.publicUrl, index + 2, assetNames[material.asset.kind], "", ""]);
  return { headers, rows: [first, ...extraImages] };
}

export function buildExportFiles(workspace: ProjectWorkspace, materials: ExportMaterial[], channels: Channel[] = workspace.project.channels) {
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, value: Uint8Array | string) => { files[path] = value instanceof Uint8Array ? value : textFile(value); };
  const channelLabel = channels.length === 1 ? channelNames[channels[0]] : "多个销售平台";
  const readme = channels.length === 1
    ? `上新无界｜${channelLabel} 发布包\n\n商品：${workspace.project.productName}\n\n本 ZIP 只包含 ${channelLabel} 的已检查内容、图片和发布说明。请不要把本包内容当作其他平台的发布包使用。\n\n重要：价格、库存、SKU、品牌授权、商品编码、仓库物流、税费和类目资质必须按真实信息填写。AI 检查是风险筛查，不替代官方平台审核、检测认证或法律意见。\n`
    : `上新无界｜平台发布包\n\n商品：${workspace.project.productName}\n\n本 ZIP 按平台分成独立文件夹。每个文件夹只对应一个平台，运营人员请按平台分别使用。\n\n重要：价格、库存、SKU、品牌授权、商品编码、仓库物流、税费和类目资质必须按真实信息填写。AI 检查是风险筛查，不替代官方平台审核、检测认证或法律意见。\n`;
  put("使用说明.txt", readme);
  for (const material of materials) put(material.archivePath, material.bytes);

  for (const channel of channels) {
    const listing = workspace.listings.find((item) => item.channel === channel);
    if (!listing) continue;
    const folder = channel;
    const rows = fieldRows(listing, channel, workspace);
    const images = imageRows(materials, channel);
    const modules = detailText(workspace.details[channel] ?? []);
    put(`${folder}/00-官方规则与注意事项.txt`, platformReadme(workspace, channel));
    put(`${folder}/01-发布字段表.csv`, csvFile(["字段", "English for publishing", "Chinese reference", "复制到哪里", "填写状态/注意事项"], rows));
    put(`${folder}/02-图片上传顺序.csv`, csvFile(["位置", "上传角色", "图片类型", "包内文件", "公开图片地址", "使用说明"], images));
    put(`${folder}/03-详情页文案.txt`, modules || "暂无详情页文案，请返回内容制作生成。");
    if (channel === "shopify-us") {
      const shopify = shopifyRows(workspace, materials);
      if (shopify) put("shopify-us/products-import.csv", csvFile(shopify.headers, shopify.rows));
      put("shopify-us/商品详情页.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${htmlEscape(listing.metaTitle ?? listing.title)}</title><meta name="description" content="${htmlEscape(listing.metaDescription ?? "")}"></head><body><main><h1>${htmlEscape(listing.title)}</h1>${shopifyBody(listing, workspace.details[channel] ?? [], materials)}</main></body></html>`);
    }
  }
  return files;
}

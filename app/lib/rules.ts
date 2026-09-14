import type { Channel, ChannelProfile, ComplianceRule, ListingField, RuleSource } from "./domain";

export const channelProfiles: ChannelProfile[] = [
  { id: "amazon-us", name: "Amazon US", market: "US", language: "en-US", imageRequirements: { minWidth: 1000, minHeight: 1000, mainBackground: "#FFFFFF", maxImages: 9 }, listingLimits: { titleMin: 50, titleMax: 200, bulletMax: 5 } },
  { id: "tiktok-us", name: "TikTok Shop US", market: "US", language: "en-US", imageRequirements: { minWidth: 600, minHeight: 600, mainBackground: "#FFFFFF", maxImages: 9 }, listingLimits: { titleMin: 25, titleMax: 200 } },
  { id: "shopify-us", name: "Shopify US", market: "US", language: "en-US", imageRequirements: { minWidth: 800, minHeight: 800, mainBackground: "flexible", maxImages: 250 }, listingLimits: { titleMin: 20, titleMax: 255 } },
];

export const platformFieldRequirements: Record<Channel, Array<Pick<ListingField, "key" | "label" | "labelZh" | "required" | "helpZh">>> = {
  "amazon-us": [
    { key: "brand", label: "Brand", labelZh: "品牌", required: true, helpZh: "填写品牌名称；没有品牌时请确认类目是否允许 Generic。" },
    { key: "product_id", label: "Product ID / GTIN", labelZh: "商品编码 / GTIN", required: true, helpZh: "填写 UPC、EAN、ISBN 或 GTIN；不要让 AI 猜。" },
    { key: "product_category", label: "Product category", labelZh: "商品类目", required: true, helpZh: "请在 Seller Central 选择最终叶子类目。" },
    { key: "sku", label: "SKU", labelZh: "SKU", required: true, helpZh: "商家自己的库存编号。" },
    { key: "price", label: "Price", labelZh: "售价", required: true, helpZh: "填写美元售价。" },
    { key: "quantity", label: "Quantity", labelZh: "库存数量", required: true, helpZh: "填写可售库存。" },
    { key: "condition", label: "Condition", labelZh: "商品状态", required: true, helpZh: "通常为 New；请按实际情况选择。" },
    { key: "fulfillment", label: "Fulfillment", labelZh: "配送方式", required: true, helpZh: "选择 FBA 或卖家自配送。" },
    { key: "package_dimensions", label: "Package dimensions", labelZh: "包装尺寸", required: true, helpZh: "填写包装后的长宽高。" },
    { key: "package_weight", label: "Package weight", labelZh: "包装重量", required: true, helpZh: "填写包装后的重量。" },
  ],
  "tiktok-us": [
    { key: "brand", label: "Brand", labelZh: "品牌", required: true, helpZh: "品牌商品需要相应授权或资质。" },
    { key: "category", label: "Leaf category", labelZh: "叶子类目", required: true, helpZh: "请选择最具体的商品类目。" },
    { key: "variations", label: "Product variations", labelZh: "商品规格/变体", required: true, helpZh: "如颜色、容量、尺寸；没有变体请确认默认规格。" },
    { key: "price", label: "Retail price", labelZh: "售价", required: true, helpZh: "每个 SKU 的美元售价。" },
    { key: "quantity", label: "Stock quantity", labelZh: "库存数量", required: true, helpZh: "每个 SKU 的可售库存。" },
    { key: "gtin", label: "GTIN / Product ID", labelZh: "GTIN / 商品编码", required: true, helpZh: "按平台要求填写 UPC、EAN 等编码。" },
    { key: "parcel_dimensions", label: "Parcel dimensions", labelZh: "包裹尺寸", required: true, helpZh: "填写包裹长宽高。" },
    { key: "parcel_weight", label: "Parcel weight", labelZh: "包裹重量", required: true, helpZh: "填写包裹重量。" },
    { key: "warehouse_shipping", label: "Warehouse & shipping", labelZh: "仓库和物流", required: true, helpZh: "发布时必须选择可用仓库和配送方式。" },
    { key: "certifications_warnings", label: "Certifications / warnings", labelZh: "认证/警示", required: false, helpZh: "按类目补充 Proposition 65、儿童安全或其他法定提示。" },
  ],
  "shopify-us": [
    { key: "vendor", label: "Vendor", labelZh: "供应商/品牌", required: true, helpZh: "填写店铺中展示的供应商或品牌。" },
    { key: "product_category", label: "Product category", labelZh: "商品分类", required: false, helpZh: "最好选择 Shopify Standard Product Taxonomy 中的具体分类。" },
    { key: "sku", label: "SKU", labelZh: "SKU", required: true, helpZh: "填写变体库存编号。" },
    { key: "price", label: "Price", labelZh: "售价", required: true, helpZh: "填写美元售价；不要留成 0。" },
    { key: "inventory_quantity", label: "Inventory quantity", labelZh: "库存数量", required: true, helpZh: "单店铺可直接填写；多仓库请在 Shopify 库存中设置。" },
    { key: "barcode", label: "Barcode", labelZh: "条码", required: false, helpZh: "如有 UPC/EAN/GTIN，请填写真实条码。" },
    { key: "requires_shipping", label: "Requires shipping", labelZh: "需要配送", required: true, helpZh: "实体商品通常选择 true。" },
    { key: "status", label: "Status", labelZh: "上架状态", required: true, helpZh: "默认 draft，确认店铺信息后再改为 active。" },
    { key: "image_urls", label: "Image URLs", labelZh: "图片地址", required: true, helpZh: "导入 CSV 前必须是公开可访问的 HTTPS 图片地址。" },
  ],
};

export function buildPlatformFields(channel: Channel, existing: unknown, facts: Array<{ id: string; name: string; nameZh?: string; value: string; valueZh?: string }>): ListingField[] {
  const values = new Map<string, ListingField>();
  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Partial<ListingField>;
      if (raw.key) values.set(raw.key, { key: raw.key, label: raw.label || raw.key, labelZh: raw.labelZh || raw.key, value: raw.value || "", valueZh: raw.valueZh || "", required: raw.required !== false, status: raw.status || "missing", helpZh: raw.helpZh || "", factIds: raw.factIds || [] });
    }
  }
  const matchers: Record<string, RegExp> = {
    brand: /brand|品牌|manufacturer|制造商/i,
    product_id: /product\s*id|gtin|upc|ean|isbn|商品编码|条码/i,
    product_category: /category|分类|类目|品类|product\s*type|商品类型/i,
    category: /category|分类|类目|品类|product\s*type|商品类型/i,
    variations: /color|颜色|size|尺寸|capacity|容量|variant|规格|型号/i,
    parcel_dimensions: /dimension|尺寸|length|width|height|长|宽|高/i,
    package_dimensions: /dimension|尺寸|length|width|height|长|宽|高/i,
    parcel_weight: /weight|重量/i,
    package_weight: /weight|重量/i,
    certifications_warnings: /cert|认证|warning|警示|proposition/i,
    vendor: /vendor|供应商|brand|品牌/i,
  };
  const safeDefaults: Record<string, { value: string; valueZh: string }> = {
    condition: { value: "New", valueZh: "全新" },
    requires_shipping: { value: "true", valueZh: "是" },
    status: { value: "draft", valueZh: "草稿" },
  };
  return platformFieldRequirements[channel].map((requirement) => {
    const current = values.get(requirement.key);
    const factMatches = facts.filter((fact) => (matchers[requirement.key] ?? new RegExp(requirement.key.replaceAll("_", " "), "i")).test(`${fact.name} ${fact.nameZh || ""}`));
    const inferredValue = factMatches.length ? [...new Set(factMatches.map((fact) => fact.value).filter(Boolean))].join(", ") : "";
    const inferredValueZh = factMatches.length ? [...new Set(factMatches.map((fact) => fact.valueZh || fact.value).filter(Boolean))].join("、") : "";
    const safeDefault = safeDefaults[requirement.key];
    const value = current?.value || inferredValue || safeDefault?.value || "";
    return { ...requirement, ...current, value, valueZh: current?.valueZh || inferredValueZh || safeDefault?.valueZh || "", status: value.trim() ? current?.status === "ready" ? "ready" : "needs_review" : "missing", factIds: current?.factIds?.length ? current.factIds : factMatches.map((fact) => fact.id) };
  });
}

export const ruleSources: RuleSource[] = [
  { id: "ftc-truth", authority: "FTC", title: "Advertising and Marketing", url: "https://www.ftc.gov/business-guidance/advertising-marketing", jurisdiction: "United States", categories: ["*"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Advertising claims must be truthful, not misleading, and supported by evidence.", contentHash: "sha256:ebe05b92a56cf0580fa19230933c8a2fa253ab3bfe36893a9430ac5d565eff08" },
  { id: "ftc-health", authority: "FTC", title: "Health Products Compliance Guidance", url: "https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance", jurisdiction: "United States", categories: ["beauty", "food", "supplement", "health"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Health-related benefit and safety claims require appropriate substantiation.", contentHash: "sha256:0562e09956d5118867daa45626f6e4033716b4d22de9858d0fd81cb129fe7808" },
  { id: "fda-cosmetics", authority: "FDA", title: "Cosmetics Labeling Claims", url: "https://www.fda.gov/cosmetics/cosmetics-labeling/cosmetics-labeling-claims", jurisdiction: "United States", categories: ["beauty", "cosmetics", "personal-care"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Cosmetic claims must be truthful and must not imply unapproved drug treatment.", contentHash: "sha256:214b62b0e763cacc84a47822a9edc51f65021e4fcac52c5842dae3d3c7ba9c1c" },
  { id: "cpsc-sellers", authority: "CPSC", title: "Online Sellers’ Safety Guide", url: "https://www.cpsc.gov/Business--Manufacturing/Online-Sellers-Safety-Guide", jurisdiction: "United States", categories: ["consumer-goods", "children", "appliance", "electronics"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Online sellers must identify applicable consumer-product safety, testing, certification, and recall duties.", contentHash: "sha256:220f9501c6605c55a064e40657abe914a7d6b4192db26d6a9fac745b11cc1e85" },
  { id: "amazon-images", authority: "Amazon", title: "Product Image Requirements", url: "https://sellercentral.amazon.com/help/hub/reference/G1881", jurisdiction: "United States", platform: "amazon-us", categories: ["*"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Amazon main images require a pure white background and prohibit added text, graphics, or watermarks.", contentHash: "sha256:bb4e32c84a578e8eb73ab3b04427ed07fb5c081993a0da36dd9f0812d473c9f1" },
  { id: "amazon-detail", authority: "Amazon", title: "Product Detail Page Rules", url: "https://sellercentral.amazon.com/help/hub/reference/G200390640", jurisdiction: "United States", platform: "amazon-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "Titles, bullet points, descriptions and images must accurately describe the product; seller-specific promotions and unsupported information are not allowed.", contentHash: "sha256:amazon-detail-20260913" },
  { id: "amazon-listing", authority: "Amazon", title: "How to create Amazon product listings", url: "https://sell.amazon.com/blog/amazon-product-listings", jurisdiction: "United States", platform: "amazon-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "A product listing includes title, bullet points, description, images and product details; offer fields include quantity, price, condition and fulfillment.", contentHash: "sha256:amazon-listing-20260913" },
  { id: "tiktok-listing", authority: "TikTok Shop", title: "Product Listing Policy", url: "https://seller-us.tiktok.com/university/essay?knowledge_id=3196690250417921", jurisdiction: "United States", platform: "tiktok-us", categories: ["*"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "TikTok Shop listings and images must accurately represent the product and avoid misleading claims.", contentHash: "sha256:fde955345241746eeb144444eb5307589a214da702017df8da21ee8cda9425f2" },
  { id: "tiktok-add-products", authority: "TikTok Shop", title: "How to Add Products to Your Shop", url: "https://seller-us.tiktok.com/university/essay?knowledge_id=6581713858676522", jurisdiction: "United States", platform: "tiktok-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "Product setup includes basic information, product details, sales information and shipping; images support up to 9 files and must be at least 600×600 pixels.", contentHash: "sha256:tiktok-add-20260913" },
  { id: "tiktok-quality", authority: "TikTok Shop", title: "Product Detail Pages & Listing Quality Guidelines", url: "https://seller-us.tiktok.com/university/essay?knowledge_id=481891871868714", jurisdiction: "United States", platform: "tiktok-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "Good listings use a concise title, 5 or more high-resolution images, a complete description and category-specific information.", contentHash: "sha256:tiktok-quality-20260913" },
  { id: "shopify-media", authority: "Shopify", title: "Product media guidance", url: "https://help.shopify.com/en/manual/products/product-media", jurisdiction: "United States", platform: "shopify-us", categories: ["*"], version: "snapshot-2026-08-07", fetchedAt: "2026-08-07", excerpt: "Shopify product media should accurately represent the product and be suitable for storefront delivery.", contentHash: "sha256:966d92565f7a9e11bad889c93b5ca94755e28217384383ec65672ff6dd0a38c2" },
  { id: "shopify-csv", authority: "Shopify", title: "Using CSV files to import and export products", url: "https://help.shopify.com/en/manual/products/import-export/using-csv", jurisdiction: "United States", platform: "shopify-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "The product CSV uses specified headers; Title is required for new products, and image URLs must be functioning URLs. CSV must be UTF-8.", contentHash: "sha256:shopify-csv-20260913" },
  { id: "shopify-seo", authority: "Shopify", title: "Adding keywords for SEO", url: "https://help.shopify.com/en/manual/promoting-marketing/seo/adding-keywords", jurisdiction: "United States", platform: "shopify-us", categories: ["*"], version: "snapshot-2026-09-13", fetchedAt: "2026-09-13", excerpt: "Shopify product SEO fields include an SEO title and SEO description that appear in search engine listings.", contentHash: "sha256:shopify-seo-20260913" },
];

export const complianceRules: ComplianceRule[] = [
  { id: "claim-absolute", sourceId: "ftc-truth", scope: "advertising", target: "all", severity: "high", categories: ["*"], channels: ["amazon-us", "tiktok-us", "shopify-us"], pattern: "\\b(100%|guaranteed|number\\s*1|no\\.?\\s*1|best|perfect|cure|risk[- ]free)\\b", message: "发现可能缺少充分证据的绝对化、排名或保证性宣称。", suggestion: "改为可验证的商品结构、条件或测试结果描述。" },
  { id: "fact-duration", sourceId: "ftc-truth", scope: "facts", target: "all", severity: "medium", categories: ["*"], channels: ["amazon-us", "tiktok-us", "shopify-us"], pattern: "\\b(up to|lasts?|per charge|hours?|minutes?)\\b", message: "发现需要商品事实或测试材料支持的量化宣称。", suggestion: "关联已确认事实和证据，或删除未经确认的数字。" },
  { id: "health-treatment", sourceId: "fda-cosmetics", scope: "category", target: "all", severity: "high", categories: ["beauty", "cosmetics", "personal-care"], channels: ["amazon-us", "tiktok-us", "shopify-us"], pattern: "\\b(treat|heal|cure|repair disease|anti-inflammatory|medical grade)\\b", message: "美妆文案可能构成治疗疾病或影响身体结构/功能的药品宣称。", suggestion: "改为外观、清洁或保湿等化妆品用途表达，并核验支持材料。" },
  { id: "amazon-main-promo", sourceId: "amazon-images", scope: "platform", target: "image", severity: "high", categories: ["*"], channels: ["amazon-us"], message: "Amazon 主图不得包含促销文字、水印或非随售道具。", suggestion: "使用纯白背景，仅保留实际销售商品。" },
  { id: "amazon-detail-rules", sourceId: "amazon-detail", scope: "platform", target: "listing", severity: "medium", categories: ["*"], channels: ["amazon-us"], pattern: "\\b(free shipping|limited time|buy now|contact us|www\\.)\\b", message: "Amazon 商品详情页不能放卖家促销、联系方式或外部导流信息。", suggestion: "删除促销、联系方式和外部链接，只保留商品本身的信息。" },
  { id: "tiktok-title-clickbait", sourceId: "tiktok-listing", scope: "platform", target: "title", severity: "medium", categories: ["*"], channels: ["tiktok-us"], pattern: "\\b(best seller|buy now|low stock|free gift)\\b", message: "TikTok Shop 标题包含点击诱导或促销表达。", suggestion: "保留准确的品类、属性、规格和使用场景。" },
  { id: "tiktok-off-platform", sourceId: "tiktok-listing", scope: "platform", target: "all", severity: "high", categories: ["*"], channels: ["tiktok-us"], pattern: "(https?://|www\\.|\\b(website|instagram|facebook|whatsapp|wechat)\\b)", message: "TikTok Shop 商品内容不能引导用户离开平台。", suggestion: "删除网址、社交账号、二维码和外部联系方式。" },
  { id: "tiktok-all-caps", sourceId: "tiktok-listing", scope: "platform", target: "all", severity: "low", categories: ["*"], channels: ["tiktok-us"], pattern: "\\b[A-Z]{5,}\\b", message: "TikTok Shop 不建议整段使用全大写单词。", suggestion: "改为正常大小写，保留清晰易读的商品描述。" },
  { id: "shopify-external-link", sourceId: "shopify-csv", scope: "platform", target: "listing", severity: "medium", categories: ["*"], channels: ["shopify-us"], pattern: "<a\\s+[^>]*href=|https?://", message: "Shopify 导入的商品描述不应包含无法确认的外部链接。", suggestion: "删除外部链接，或确认链接长期有效并属于你的店铺。" },
  { id: "shopify-seo-length", sourceId: "shopify-seo", scope: "platform", target: "listing", severity: "low", categories: ["*"], channels: ["shopify-us"], pattern: "^.{71,}$", message: "Shopify SEO 标题建议控制在 70 个字符以内。", suggestion: "缩短 SEO 标题，保留商品名称和关键属性。" },
  { id: "asset-role-facts", sourceId: "ftc-truth", scope: "facts", target: "image", severity: "high", categories: ["*"], channels: ["amazon-us", "tiktok-us", "shopify-us"], message: "尺寸图和特征图只能展示已确认的商品事实，不能用普通商品图替代。", suggestion: "补充并确认对应事实后重新生成，或人工替换为真实素材。" },
];

export function sourceFor(id: string) { return ruleSources.find((source) => source.id === id); }

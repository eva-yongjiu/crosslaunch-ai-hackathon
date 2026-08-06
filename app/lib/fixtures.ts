import type { Channel, ChannelListing, DetailModule, ProductTruthProfile, ProjectWorkspace } from "./domain";
import { ruleSources } from "./rules";

const now = "2026-08-06T10:00:00.000Z";

export const fixtureTruth: ProductTruthProfile = {
  id: "truth_demo",
  projectId: "project_demo",
  productName: "便携式榨汁杯",
  category: "consumer-goods/appliance",
  categoryConfidence: 0.94,
  attributes: [
    { id: "fact_blades", name: "刀头", value: "6 叶不锈钢刀头", status: "verified", confidence: 0.98, evidenceIds: ["ev_user"] },
    { id: "fact_charge", name: "充电接口", value: "USB-C", status: "verified", confidence: 0.97, evidenceIds: ["ev_image"] },
    { id: "fact_capacity", name: "容量", value: "16 oz", status: "verified", confidence: 0.92, evidenceIds: ["ev_pack"] },
    { id: "fact_material", name: "杯体材料", value: "BPA-Free", status: "pending", confidence: 0.72, evidenceIds: ["ev_user"] },
    { id: "fact_runtime", name: "单次充电续航", value: "待补充测试报告", status: "missing", confidence: 0, evidenceIds: [] },
  ],
  identityLocks: ["青柠绿色透明杯体", "深绿色圆柱底座", "灰白色杯盖", "6 叶刀头结构"],
  prohibitedInventions: ["电机功率", "FDA 认证", "100% 防漏", "行业排名", "未经确认的续航次数"],
  missingInformation: ["电机额定功率", "防漏测试条件", "BPA-Free 证明文件", "电池容量"],
  evidence: [
    { id: "ev_image", type: "image", label: "商品正面图", source: "用户上传", confidence: 0.96, bbox: [0.31, 0.16, 0.69, 0.84] },
    { id: "ev_pack", type: "packaging_text", label: "包装 OCR：16 OZ", source: "包装正面", confidence: 0.92, bbox: [0.42, 0.73, 0.58, 0.79] },
    { id: "ev_user", type: "user_input", label: "卖家输入卖点", source: "项目表单", confidence: 0.8 },
  ],
};

function listing(channel: Channel, strategy: ChannelListing["strategy"]): ChannelListing {
  const names = { "amazon-us": "Portable Blender, 16 Oz Personal Smoothie Maker with USB-C Charging, 6-Blade Mini Blender for Travel and Office", "tiktok-us": "16 Oz USB-C Portable Blender with 6-Blade Mixing Cup for Travel", "shopify-us": "FreshFlow Portable Blender — Blend Wherever the Day Takes You" };
  return {
    channel,
    strategy,
    title: names[channel],
    bullets: [
      "Six stainless-steel blades blend fruit and ice for fresh drinks on the go.",
      "USB-C charging makes the blender easy to power at home, work, or while traveling.",
      "The compact 16 oz cup fits daily smoothies, protein shakes, and fresh juice.",
      "A detachable cup and self-clean cycle help simplify everyday cleanup.",
      "Designed for commutes, office desks, gym bags, and weekend trips.",
    ],
    description: "A compact personal blender built around a 6-blade assembly, USB-C charging, and a 16 oz travel cup.",
    searchTerms: channel === "amazon-us" ? "portable blender personal smoothie maker usb c mini travel blender" : undefined,
    metaTitle: channel === "shopify-us" ? "FreshFlow Portable Blender | USB-C Personal Blender" : undefined,
    metaDescription: channel === "shopify-us" ? "Blend smoothies and shakes wherever your day takes you with a compact USB-C personal blender." : undefined,
    claims: [
      { text: "Six stainless-steel blades", factIds: ["fact_blades"], needsEvidence: false, intent: "performance", keywords: ["6-blade", "portable blender"] },
      { text: "USB-C charging", factIds: ["fact_charge"], needsEvidence: false, intent: "convenience", keywords: ["usb c blender"] },
      { text: "16 oz cup", factIds: ["fact_capacity"], needsEvidence: false, intent: "capacity", keywords: ["16 oz"] },
      { text: "BPA-Free", factIds: ["fact_material"], needsEvidence: true, intent: "material safety", keywords: ["bpa-free"] },
    ],
    score: channel === "amazon-us" ? 92 : channel === "tiktok-us" ? 88 : 91,
  };
}

function details(channel: Channel): DetailModule[] {
  return [
    { id: `${channel}_hero`, type: "hero", title: "Your day. Freshly blended.", body: "A compact blender for busy mornings and wherever the day takes you.", factIds: ["fact_charge", "fact_capacity"], assetIds: ["asset_scene"] },
    { id: `${channel}_benefits`, type: "benefits", title: "Built for everyday blending", body: "Six blades, USB-C charging, and a travel-size cup.", factIds: ["fact_blades", "fact_charge", "fact_capacity"], assetIds: ["asset_compare"] },
    { id: `${channel}_scenario`, type: "scenario", title: "Blend. Sip. Go.", body: "From office desks to gym bags and weekend trips.", factIds: [], assetIds: ["asset_model"] },
    { id: `${channel}_specs`, type: "specs", title: "Know every detail", body: "16 oz cup · USB-C charging · six-blade assembly", factIds: ["fact_capacity", "fact_charge", "fact_blades"], assetIds: ["asset_size"] },
  ];
}

export const fixtureWorkspace: ProjectWorkspace = {
  project: { id: "project_demo", name: "便携榨汁杯三渠道上新", productName: "便携式榨汁杯", category: "consumer-goods/appliance", channels: ["amazon-us", "tiktok-us", "shopify-us"], status: "needs_review", currentStep: "truth", coverage: { "amazon-us": "full", "tiktok-us": "full", "shopify-us": "partial" }, createdAt: now, updatedAt: now },
  truth: fixtureTruth,
  listings: [listing("amazon-us", "seo"), listing("tiktok-us", "conversion"), listing("shopify-us", "brand")],
  details: { "amazon-us": details("amazon-us"), "tiktok-us": details("tiktok-us"), "shopify-us": details("shopify-us") },
  assets: [
    { id: "asset_main", kind: "main", channel: "amazon-us", url: "fixture://main", version: 1, consistencyScore: 98, complianceStatus: "passed", retries: 0 },
    { id: "asset_scene", kind: "scene", channel: "amazon-us", url: "fixture://scene", version: 1, consistencyScore: 95, complianceStatus: "passed", retries: 0 },
    { id: "asset_model", kind: "model", channel: "tiktok-us", url: "fixture://model", version: 1, consistencyScore: 93, complianceStatus: "passed", retries: 1 },
    { id: "asset_compare", kind: "comparison", channel: "shopify-us", url: "fixture://comparison", version: 2, consistencyScore: 96, complianceStatus: "pending", retries: 0 },
    { id: "asset_size", kind: "size", channel: "amazon-us", url: "fixture://size", version: 1, consistencyScore: 99, complianceStatus: "passed", retries: 0 },
  ],
  findings: [
    { id: "finding_absolute", ruleId: "claim-absolute", sourceId: "ftc-truth", severity: "high", status: "open", target: "Amazon Listing · Bullet 3", excerpt: "100% leak-proof", explanation: "绝对化防漏承诺需要充分、适用条件明确的测试证据。", suggestion: "改为描述结构的 leak-resistant travel design，并补充测试条件。", fixedText: "leak-resistant travel design", version: 1 },
    { id: "finding_duration", ruleId: "fact-duration", sourceId: "ftc-truth", severity: "medium", status: "open", target: "Amazon Listing · Bullet 2", excerpt: "15 blends per charge", explanation: "商品事实档案缺少电池容量和续航测试报告。", suggestion: "暂时删除次数，待上传测试证据后恢复。", fixedText: "USB-C rechargeable for convenient everyday use", version: 1 },
    { id: "finding_image", ruleId: "amazon-main-promo", sourceId: "amazon-images", severity: "low", status: "accepted", target: "Amazon 主图", excerpt: "纯白背景、无促销文字", explanation: "主图满足当前平台基础要求。", suggestion: "无需修改。", bbox: [0.05, 0.05, 0.95, 0.95], version: 1 },
  ],
  sources: ruleSources,
  tasks: [
    { id: "task_analyze", projectId: "project_demo", type: "analyze", mode: "fixture", status: "needs_review", retries: 0, inputSummary: "商品图 + 5 个卖点", outputSummary: "提取 5 条事实，2 条待确认", startedAt: now, completedAt: now },
    { id: "task_assets", projectId: "project_demo", type: "assets", mode: "fixture", status: "completed", retries: 1, inputSummary: "3 个渠道 × 5 种素材", outputSummary: "生成 5 项候选素材", startedAt: now, completedAt: now },
    { id: "task_compliance", projectId: "project_demo", type: "compliance", mode: "fixture", status: "needs_review", retries: 0, inputSummary: "15 条文案 + 5 项素材", outputSummary: "发现 1 高风险、1 中风险", startedAt: now, completedAt: now },
  ],
};

export function cloneFixture(): ProjectWorkspace { return JSON.parse(JSON.stringify(fixtureWorkspace)) as ProjectWorkspace; }

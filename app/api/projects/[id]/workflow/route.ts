import { getAssetRecord, saveAssetRecord } from "../../../../lib/asset-repository";
import { assetKindForModule, assetKinds, assetPurpose, assetRequirement, dimensionFacts } from "../../../../lib/asset-policy";
import { coverageFor, scanDetail, scanListing } from "../../../../lib/compliance";
import { assertModelRouterConfigured, chatJson, generateImage, modelMode, visionJson } from "../../../../lib/model-router";
import { ruleSources } from "../../../../lib/rules";
import { getStoredObject, putStoredObject } from "../../../../lib/storage";
import type { AssetVersion, Channel, ChannelListing, ComplianceFinding, ComplianceLocation, DetailModule, GenerationTask, ProductFact, ProjectWorkspace } from "../../../../lib/domain";
import { normalizeWorkspace } from "../../../../lib/workspace";
import { registerBackgroundTask, updateBackgroundTask } from "../../../../lib/background-tasks";

type Action = "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "optimize_finding" | "optimize_all" | "regenerate_asset";
type VisionResult = { category?: string; categoryZh?: string; categoryConfidence?: number; facts?: Array<{ name: string; nameZh?: string; value: string; valueZh?: string; confidence?: number }>; identityLocks?: string[]; missingInformation?: string[]; missingInformationZh?: string[] };
type VisualReviewResult = { passed?: boolean; roleValid?: boolean; roleIssue?: string; roleIssueZh?: string; consistencyScore?: number; findings?: Array<{ excerpt?: string; excerptZh?: string; severity?: "high" | "medium" | "low" | "info" | "error"; explanation?: string; explanationZh?: string; suggestion?: string; suggestionZh?: string; bbox?: [number, number, number, number] }> };
type GeneratedContent = { listings: ChannelListing[]; details: Partial<Record<Channel, DetailModule[]>> };
type TranslationResult = { categoryZh?: string; missingInformationZh?: string[]; facts?: Array<{ id?: string; nameZh?: string; valueZh?: string }>; listings?: Array<{ channel: Channel; titleZh?: string; bulletsZh?: string[]; descriptionZh?: string; searchTermsZh?: string; metaTitleZh?: string; metaDescriptionZh?: string }>; details?: Partial<Record<Channel, Array<{ id: string; titleZh?: string; bodyZh?: string }>>> };
type RewriteResult = { replacement?: unknown; replacementZh?: unknown };
type OptimizationPatch =
  | { kind: "text"; location: ComplianceLocation; replacement: string; replacementZh: string; originalEnglish: string }
  | { kind: "asset"; assetId: string; replacement: AssetVersion };
const generatedDetailTypes: DetailModule["type"][] = ["hero", "benefits", "scenario", "specs", "faq", "comparison", "steps", "reason"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A model rewrite is still treated as untrusted output. Clean only the exact
 * patterns identified by the current findings, then let the normal scan
 * decide whether the result is actually safe. This prevents a successful API
 * response from being mistaken for a successful compliance fix.
 */
function sanitizeRewrite(replacement: string, findings: ComplianceFinding[], location: ComplianceLocation) {
  let next = replacement.replace(/\s{2,}/g, " ").trim();
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));
  for (const finding of findings) {
    const excerpt = finding.excerpt?.trim();
    if (!excerpt) continue;
    next = next.replace(new RegExp(escapeRegExp(excerpt), "gi"), "");
  }
  if (ruleIds.has("tiktok-all-caps")) {
    next = next.replace(/\b[A-Z]{5,}\b/g, (word) => `${word[0]}${word.slice(1).toLowerCase()}`);
  }
  if (ruleIds.has("tiktok-off-platform")) {
    next = next.replace(/https?:\/\/\S+|www\.\S+|\b(?:website|instagram|facebook|whatsapp|wechat)\b/gi, "");
  }
  if (ruleIds.has("tiktok-title-clickbait")) {
    next = next.replace(/\b(?:best seller|buy now|low stock|free gift)\b/gi, "");
  }
  if (ruleIds.has("shopify-external-link")) {
    next = next.replace(/<a\s+[^>]*href=[^>]*>.*?<\/a>|https?:\/\/\S+/gi, "");
  }
  if (ruleIds.has("shopify-seo-length") && location.field === "metaTitle") {
    next = Array.from(next).slice(0, 70).join("").trim();
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

async function persist(workspace: ProjectWorkspace, reason: string) {
  const { saveWorkspace } = await import("../../../../lib/repository");
  await saveWorkspace(workspace, reason);
}

async function assetDataUrl(assetId: string, label: string) {
  const record = await getAssetRecord(assetId);
  if (!record) throw new Error("商品原图记录不存在，请重新上传。");
  if (record.size > 8 * 1024 * 1024) throw new Error(`${label}需小于 8MB，才能交给视觉模型处理。`);
  const object = await getStoredObject(record.objectKey);
  if (!object) throw new Error(`${label}文件不存在，请重新上传。`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${record.contentType};base64,${btoa(binary)}`;
}

async function sourceImageDataUrl(workspace: ProjectWorkspace) {
  const source = workspace.truth.sourceAsset;
  if (!source) throw new Error("请先上传商品原图。");
  return assetDataUrl(source.id, "商品原图");
}

function makeTask(id: string, action: Action, queued = false, channel?: Channel): GenerationTask {
  return {
    id: crypto.randomUUID(), projectId: id,
    type: action === "scan" || action === "apply_fixes" || action === "optimize_finding" || action === "optimize_all" ? "compliance" : action === "generate" || action === "regenerate_asset" ? "assets" : action === "translate" ? "listing" : "analyze",
    mode: modelMode(), status: queued ? "queued" : "running", retries: 0, inputSummary: action, startedAt: queued ? undefined : new Date().toISOString(), operation: action, channel,
  };
}

function outputText(value: unknown, separator = " "): string {
  if (Array.isArray(value)) return value.map((item) => outputText(item)).filter(Boolean).join(separator);
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function selectedLanguage(workspace: ProjectWorkspace) {
  return workspace.outputLanguage === "zh-CN" ? "zh-CN" : "en-US";
}

function applyOutputLanguage(listing: ChannelListing, language: "zh-CN" | "en-US"): ChannelListing {
  if (language === "zh-CN") {
    return {
      ...listing,
      title: outputText(listing.titleZh || listing.title),
      bullets: (listing.bulletsZh?.length ? listing.bulletsZh : listing.bullets).map((item) => outputText(item)),
      description: outputText(listing.descriptionZh || listing.description),
      searchTerms: listing.searchTerms === undefined ? undefined : outputText(listing.searchTermsZh || listing.searchTerms),
      metaTitle: listing.metaTitle === undefined ? undefined : outputText(listing.metaTitleZh || listing.metaTitle),
      metaDescription: listing.metaDescription === undefined ? undefined : outputText(listing.metaDescriptionZh || listing.metaDescription),
      claims: (listing.claims ?? []).map((claim) => ({ ...claim, text: outputText(claim.claimZh || claim.text) })),
    };
  }
  return {
    ...listing,
    title: outputText(listing.title),
    bullets: listing.bullets.map((item) => outputText(item)),
    description: outputText(listing.description),
    searchTerms: listing.searchTerms === undefined ? undefined : outputText(listing.searchTerms),
    metaTitle: listing.metaTitle === undefined ? undefined : outputText(listing.metaTitle),
    metaDescription: listing.metaDescription === undefined ? undefined : outputText(listing.metaDescription),
  };
}

function applyOutputLanguageToDetail(module: DetailModule, language: "zh-CN" | "en-US"): DetailModule {
  return language === "zh-CN"
    ? { ...module, title: outputText(module.titleZh || module.title), body: outputText(module.bodyZh || module.body) }
    : { ...module, title: outputText(module.title), body: outputText(module.body) };
}

function removeUnsupportedClaims(workspace: ProjectWorkspace, channel?: Channel) {
  const unsupported = workspace.findings.filter((item) => item.status === "open" && (!channel || item.location?.channel === channel)).map((item) => item.excerpt).filter(Boolean);
  const clean = (value: string) => unsupported.reduce((text, excerpt) => text.replaceAll(excerpt, "").replace(/\s{2,}/g, " ").trim(), value);
  workspace.listings = workspace.listings.map((listing) => {
    if (channel && listing.channel !== channel) return listing;
    return { ...listing, title: clean(listing.title), bullets: listing.bullets.map(clean).filter(Boolean), description: clean(listing.description), claims: listing.claims.filter((claim) => !unsupported.includes(claim.text)) };
  });
  workspace.details = Object.fromEntries(Object.entries(workspace.details).map(([itemChannel, modules]) => [itemChannel, channel && itemChannel !== channel ? modules : modules.map((module) => ({ ...module, title: clean(module.title), body: clean(module.body) }))])) as ProjectWorkspace["details"];
}

const assetPrompts: Record<AssetVersion["kind"], string> = {
  main: "a clean ecommerce main product image on pure white background, centered and fully visible, with no promotional text",
  scene: "a realistic lifestyle scene showing the product in one credible use context, with the product large enough to inspect",
  model: "a commercial lifestyle photo with a US-market model naturally using the exact product; supporting props may appear in the background but must never look like included accessories",
  comparison: "a clean secondary feature image: show the exact product together with at least two clearly separated, fact-grounded detail views of that same product",
  size: "a clean product specification image using only confirmed facts; show exact measurements only when dimensional facts are supplied",
};
const maxAutomaticAssetRetries = 2;

async function generateSingleAsset(workspace: ProjectWorkspace, channel: Channel, kind: AssetVersion["kind"], sourceImage: string, version: number, replacedFromId?: string, retries = 0, correction?: string): Promise<AssetVersion> {
  const requirement = assetRequirement(kind, workspace.truth);
  if (!requirement.ready) throw new Error(`${assetPurpose[kind].nameZh}暂不能生成：${requirement.reasonZh}`);
  const verified = workspace.truth.attributes.filter((fact) => fact.status === "verified");
  const dimensions = dimensionFacts(workspace.truth);
  const facts = verified.map((fact) => `${fact.name}: ${fact.value}`).join("; ");
  const correctionText = correction ? `A compliance review found this issue. Correct it in this new version: ${correction}. Do not preserve the flagged text, object, claim or visual error.` : "";
  const channelGuardrail = kind === "main"
    ? "For the main image, use only the actual product on a pure white background. Do not add text, measurements, arrows, badges, borders, watermarks, logos, graphics or props."
    : kind === "comparison"
      ? "This is a secondary image, so concise callout text is allowed only for the supplied verified facts. Do not compare against an invented competitor or make a performance claim."
      : kind === "size"
        ? "This is a secondary image, so measurement arrows and labels are allowed only for the supplied verified dimensional facts. Never estimate or invent a measurement."
    : "This is a secondary lifestyle image. Do not add promotional text, watermarks or logos. Context props are allowed only when clearly separate from the product and never presented as included in the package.";
  // These are all US storefront channels. The operator may review the
  // workspace in Chinese, but customer-facing image labels must stay in the
  // channel's publishing language or the asset will fail localization review.
  const language = "English";
  const roleConstruction = kind === "comparison"
    ? "Show the exact same product plus at least two visually distinct close-up/detail views of confirmed features. A second product or invented competitor is forbidden. Text labels are optional; if used, use only exact verified fact names and values."
    : kind === "size" && !dimensions.length
      ? "There are no verified dimensional facts. Do not draw rulers, measurement arrows, numeric dimensions or made-up sizes. Create a clean specification/features image with the product and clearly separated views of confirmed features. Do not add text rather than risk incorrect text."
      : kind === "size"
        ? `Show measurement arrows and labels only for these exact dimensional facts: ${dimensions.map((fact) => `${fact.name}: ${fact.value}`).join("; ")}. Do not round, reinterpret or invent any number.`
        : "";
  const prompt = `Use the supplied product photo as the authoritative visual reference. Create ${assetPrompts[kind]}. Product: ${workspace.truth.productName}. Verified facts: ${facts || "none"}. Preserve the exact product color, shape, structure, logo, labels and included accessories. Target channel: ${channel}. ${channelGuardrail} ${roleConstruction} The delivered bitmap must be a clean, borderless sales image with no frame, card, collage margin, decorative panel, sticker, watermark, added logo or graphic edge. If any human-readable text is needed, use ${language} only; never mix languages. Never render UUIDs, internal fact IDs, raw identifiers, lorem ipsum, placeholder text or invented numbers. Never invent specifications, certifications, efficacy, performance numbers, extra product copies or packaging. Do not alter the product identity. ${correctionText}`;
  const result = await generateImage(prompt, "2048*2048", sourceImage);
  const remoteUrl = result.data?.[0]?.url;
  const encoded = result.data?.[0]?.b64_json;
  if (!remoteUrl && !encoded) throw new Error(`图片模型没有返回 ${channel}/${kind} 的结果。`);
  let bytes: Uint8Array;
  let contentType = "image/png";
  if (encoded) {
    const binary = atob(encoded);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } else {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(remoteUrl!);
      if (response.ok) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`无法下载模型生成的 ${channel}/${kind} 图片。`);
    contentType = response.headers.get("content-type") || contentType;
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const id = crypto.randomUUID();
  const filename = `${channel}-${kind}-v${version}.png`;
  const objectKey = `projects/${workspace.project.id}/generated/${id}-${filename}`;
  await putStoredObject(objectKey, bytes, contentType);
  await saveAssetRecord({ id, projectId: workspace.project.id, objectKey, filename, contentType, size: bytes.byteLength, kind, createdAt: new Date().toISOString() });
  return { id, kind, channel, url: `/api/assets/${id}`, version, consistencyScore: 0, complianceStatus: "pending", retries, purpose: assetPurpose[kind].nameZh, factIds: requirement.factIds, qualityNotes: [], replacedFromId };
}

async function generateAssets(workspace: ProjectWorkspace, channels: Channel[], sourceImage: string): Promise<AssetVersion[]> {
  const perChannel = await Promise.all(channels.map(async (channel) => {
    const generated: AssetVersion[] = [];
    for (const kind of assetKinds) {
      if (!assetRequirement(kind, workspace.truth).ready) continue;
      generated.push(await generateSingleAsset(workspace, channel, kind, sourceImage, 1));
    }
    return generated;
  }));
  return perChannel.flat();
}

async function reviewSingleAsset(workspace: ProjectWorkspace, asset: AssetVersion, facts: string): Promise<ComplianceFinding[]> {
    const requirement = assetRequirement(asset.kind, workspace.truth);
    if (!requirement.ready) {
      asset.complianceStatus = "failed";
      asset.qualityNotes = [requirement.reasonZh];
      return [{
        id: `finding_asset_role_${asset.id}`,
        ruleId: "asset-role-facts",
        sourceId: asset.channel === "amazon-us" ? "amazon-images" : asset.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media",
        severity: "high",
        status: "open",
        target: `${asset.channel}/${asset.kind} image`,
        excerpt: `${assetPurpose[asset.kind].nameZh}不可用`,
        excerptZh: `${assetPurpose[asset.kind].nameZh}不可用`,
        explanation: requirement.reason,
        explanationZh: requirement.reasonZh,
        suggestion: "补充并确认对应商品事实后，再重新生成该素材。",
        suggestionZh: "补充并确认对应商品事实后，再重新生成该素材。",
        location: { kind: "asset", channel: asset.channel, assetId: asset.id },
        version: asset.version,
      }];
    }
    const image = await assetDataUrl(asset.id, `${asset.channel}/${asset.kind} 图片`);
    const hasDimensions = dimensionFacts(workspace.truth).length > 0;
    const officialSource = ruleSources.find((source) => source.platform === asset.channel);
    const review = await visionJson<VisualReviewResult>(
      "You review ecommerce product images against supplied verified facts and the requested asset role. Return strict JSON. Do not infer hidden specifications. Mark passed false when the product identity is altered, an object is presented as an included accessory, or the image contains misleading claims. A comparison image needs at least two fact-grounded feature callouts or clearly separated feature views. A size image with supplied dimensions needs visible measurement arrows/labels for those exact dimensions. IMPORTANT: when no dimensional facts are supplied, a size asset is a fact-based specification/features image, not a measurement image; a clean product/features image without rulers or numbers is valid and must not be failed for missing measurements. Still fail any invented number, wrong label, typo, unrelated prop, product mismatch or misleading text. A main image must be a clean product-only image with no frame or border. Return every human-readable finding in both English and Simplified Chinese.",
      `Return {passed,roleValid,roleIssue,roleIssueZh,consistencyScore,findings:[{excerpt,excerptZh,severity,explanation,explanationZh,suggestion,suggestionZh,bbox}]}. Product: ${workspace.truth.productName}. Verified facts: ${facts}. Channel: ${asset.channel}. Asset kind: ${asset.kind}. Dimensional facts supplied: ${hasDimensions ? "yes; enforce exact supplied values only" : "no; do not require measurement indicators or invent dimensions"}. Official channel rule to apply: ${officialSource ? `${officialSource.title}; ${officialSource.excerpt}; version ${officialSource.version}; ${officialSource.url}` : "No official channel snapshot is available; mark coverage as partial and do not claim full compliance."} Review exact product identity, role accuracy, visible text, extra objects, unsupported claims, and channel suitability.`,
      image,
    );
    const score = review.consistencyScore ?? (review.passed ? 1 : 0);
    asset.consistencyScore = Math.max(0, Math.min(1, score > 1 ? score / 100 : score));
    const sourceId = asset.channel === "amazon-us" ? "amazon-images" : asset.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media";
    const roleFindings = review.roleValid === false ? [{ excerpt: review.roleIssue || `${assetPurpose[asset.kind].nameZh}未按用途生成`, excerptZh: review.roleIssueZh || `${assetPurpose[asset.kind].nameZh}未按用途生成`, severity: "high" as const, explanation: "The generated image does not satisfy the requested asset role.", explanationZh: "生成图片没有满足该素材用途的要求。", suggestion: asset.kind === "size" ? "重新生成带真实尺寸箭头和标签的规格图。" : asset.kind === "comparison" ? "重新生成带至少两条已确认特征说明的对比/特征图。" : "重新生成符合该素材用途的图片。", suggestionZh: asset.kind === "size" ? "重新生成带真实尺寸箭头和标签的规格图。" : asset.kind === "comparison" ? "重新生成带至少两条已确认特征说明的对比/特征图。" : "重新生成符合该素材用途的图片。", bbox: undefined } satisfies NonNullable<VisualReviewResult["findings"]>[number]] : [];
    const visualFindings = (review.findings ?? []).flatMap((issue) => {
      const severity = String(issue.severity ?? "high").toLowerCase();
      if (severity === "info") return [];
      return [{ ...issue, severity: severity === "error" ? "high" as const : severity === "medium" ? "medium" as const : severity === "low" ? "low" as const : "high" as const }];
    });
    const actionableFindings = [...visualFindings, ...roleFindings];
    asset.qualityNotes = actionableFindings.map((issue) => issue.explanationZh || issue.explanation || "视觉模型待复核").slice(0, 3);
    const informationalOnly = (review.findings ?? []).every((issue) => String(issue.severity ?? "info").toLowerCase() === "info");
    asset.complianceStatus = review.roleValid !== false && actionableFindings.length === 0 && (review.passed !== false || informationalOnly) ? "passed" : "failed";
    return actionableFindings.map((issue, index) => ({
      id: `finding_asset_${asset.id}_${index}`,
      ruleId: "visual-asset-review",
      sourceId,
      severity: issue.severity ?? "high",
      status: "open" as const,
      target: `${asset.channel}/${asset.kind} image`,
      excerpt: issue.excerpt || "图片视觉风险",
      explanation: issue.explanation || "视觉模型发现图片可能与商品事实或渠道要求不一致。",
      suggestion: issue.suggestion || "重新生成或人工替换该图片后再次检测。",
      bbox: issue.bbox,
      excerptZh: issue.excerptZh,
      explanationZh: issue.explanationZh,
      suggestionZh: issue.suggestionZh,
      location: { kind: "asset", channel: asset.channel, assetId: asset.id } as const,
      version: asset.version,
    }));
}

async function reviewAssets(workspace: ProjectWorkspace, assetIds?: Set<string>): Promise<ComplianceFinding[]> {
  if (!workspace.assets.length) return [];
  const facts = workspace.truth.attributes.filter((fact) => fact.status === "verified").map((fact) => `${fact.id} | ${fact.name}: ${fact.value}`).join("; ");
  const assets = [...workspace.assets].filter((asset) => assetIds ? assetIds.has(asset.id) : asset.complianceStatus !== "passed");
  const results: ComplianceFinding[][] = Array.from({ length: assets.length }, () => []);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= assets.length) return;
      try {
        results[index] = await reviewSingleAsset(workspace, assets[index], facts);
      } catch (error) {
        const asset = assets[index];
        const sourceId = asset.channel === "amazon-us" ? "amazon-images" : asset.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media";
        const message = error instanceof Error ? error.message : "图片检查服务暂时不可用。";
        asset.complianceStatus = "failed";
        asset.qualityNotes = [`图片检查失败：${message}`];
        results[index] = [{ id: `finding_asset_error_${asset.id}`, ruleId: "visual-asset-review", sourceId, severity: "high", status: "open", target: `${asset.channel}/${asset.kind} image`, excerpt: "图片尚未完成检查", excerptZh: "图片尚未完成检查", explanation: `The image could not be reviewed: ${message}`, explanationZh: `图片检查没有完成：${message}`, suggestion: "检查 AI 配置和图片文件后重新运行检查，或人工替换图片。", suggestionZh: "检查 AI 配置和图片文件后重新运行检查，或人工替换图片。", location: { kind: "asset", channel: asset.channel, assetId: asset.id }, version: asset.version }];
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, assets.length) }, () => worker()));
  return results.flat();
}

function locationKey(location: ComplianceLocation) {
  if (location.kind === "asset") return `asset:${location.assetId ?? ""}`;
  return `${location.kind}:${location.channel}:${location.field ?? ""}:${location.index ?? ""}`;
}

function verifiedFacts(workspace: ProjectWorkspace) {
  return workspace.truth.attributes.filter((fact) => fact.status === "verified").map((fact) => ({ id: fact.id, name: fact.name, nameZh: fact.nameZh, value: fact.value, valueZh: fact.valueZh }));
}

async function optimizeListingLocation(workspace: ProjectWorkspace, findings: ComplianceFinding[]): Promise<OptimizationPatch> {
  const location = findings[0]?.location;
  if (!location || (location.kind !== "listing" && location.kind !== "detail")) throw new Error("这条风险记录没有可编辑的文字定位，请先重新检测。" );
  const source = workspace.sources.find((item) => item.id === findings[0].sourceId);
  const issueSummary = findings.map((finding) => ({ excerpt: finding.excerpt, explanation: finding.explanation, suggestion: finding.suggestion, excerptZh: finding.excerptZh, explanationZh: finding.explanationZh, suggestionZh: finding.suggestionZh }));
  let english = "";
  let chinese = "";
  if (location.kind === "listing") {
    const listing = workspace.listings.find((item) => item.channel === location.channel);
    if (!listing) throw new Error("对应渠道 Listing 不存在，请先重新生成内容。" );
    switch (location.field) {
      case "title": english = listing.title; chinese = listing.titleZh ?? ""; break;
      case "bullet": english = listing.bullets[location.index ?? 0] ?? ""; chinese = listing.bulletsZh?.[location.index ?? 0] ?? ""; break;
      case "description": english = listing.description; chinese = listing.descriptionZh ?? ""; break;
      case "searchTerms": english = listing.searchTerms ?? ""; chinese = listing.searchTermsZh ?? ""; break;
      case "metaTitle": english = listing.metaTitle ?? ""; chinese = listing.metaTitleZh ?? ""; break;
      case "metaDescription": english = listing.metaDescription ?? ""; chinese = listing.metaDescriptionZh ?? ""; break;
      default: throw new Error("当前文字风险缺少可编辑字段，请先重新检测。" );
    }
  } else {
    const detailModule = (workspace.details[location.channel] ?? [])[location.index ?? 0];
    if (!detailModule) throw new Error("对应详情页模块不存在，请先重新生成详情页。" );
    if (location.field === "detailTitle") { english = detailModule.title; chinese = detailModule.titleZh ?? ""; }
    else if (location.field === "detailBody") { english = detailModule.body; chinese = detailModule.bodyZh ?? ""; }
    else throw new Error("当前详情页风险缺少可编辑字段，请先重新检测。" );
  }
  if (!english.trim()) throw new Error("目标文字为空，无法执行 AI 优化。" );
  const rewritten = await chatJson<RewriteResult>(
    "You are a US ecommerce compliance editor. Return strict JSON with exactly replacement and replacementZh. Rewrite only the supplied field, not the whole listing. The English replacement is for US publishing and the Simplified Chinese replacement is for operator review. Use only verified facts. Remove unsupported measurements, certifications, efficacy, guarantees, rankings, superlatives and absolute or environmentally sensitive claims unless they are explicitly supported by the verified facts. Do not add new facts, new accessories or promises. Keep the meaning useful and natural. If the field is a search term field, return concise search phrases rather than a sentence.",
    JSON.stringify({ channel: location.channel, kind: location.kind, field: location.field, originalEnglish: english, originalChinese: chinese, risks: issueSummary, officialRule: source ? { title: source.title, excerpt: source.excerpt, version: source.version, url: source.url } : undefined, verifiedFacts: verifiedFacts(workspace) }),
  );
   const replacement = sanitizeRewrite(outputText(rewritten.replacement), findings, location);
   if (!replacement) throw new Error("AI 没有返回可用的合规改写内容。" );
  const replacementZh = outputText(rewritten.replacementZh).trim() || chinese || replacement;
  return { kind: "text", location, replacement, replacementZh, originalEnglish: english };
}

function applyOptimizationPatch(workspace: ProjectWorkspace, patch: OptimizationPatch) {
  if (patch.kind === "asset") {
    workspace.assets = workspace.assets.map((asset) => asset.id === patch.assetId ? patch.replacement : asset);
    return;
  }
  const { location, replacement, replacementZh, originalEnglish } = patch;
  if (location.kind === "listing") {
    const listing = workspace.listings.find((item) => item.channel === location.channel);
    if (!listing) return;
    const nextListing: ChannelListing = { ...listing };
    switch (location.field) {
      case "title": nextListing.title = replacement; nextListing.titleZh = replacementZh; break;
      case "bullet": {
        const index = location.index ?? 0;
        nextListing.bullets = listing.bullets.map((item, itemIndex) => itemIndex === index ? replacement : item);
        const bulletsZh = [...(listing.bulletsZh ?? listing.bullets.map(() => ""))];
        while (bulletsZh.length < nextListing.bullets.length) bulletsZh.push("");
        bulletsZh[index] = replacementZh;
        nextListing.bulletsZh = bulletsZh;
        break;
      }
      case "description": nextListing.description = replacement; nextListing.descriptionZh = replacementZh; break;
      case "searchTerms": nextListing.searchTerms = replacement; nextListing.searchTermsZh = replacementZh; break;
      case "metaTitle": nextListing.metaTitle = replacement; nextListing.metaTitleZh = replacementZh; break;
      case "metaDescription": nextListing.metaDescription = replacement; nextListing.metaDescriptionZh = replacementZh; break;
      default: return;
    }
    if (originalEnglish) nextListing.claims = listing.claims.filter((claim) => !(originalEnglish.includes(outputText(claim.text)) && !replacement.includes(outputText(claim.text))));
    workspace.listings = workspace.listings.map((item) => item.channel === listing.channel ? nextListing : item);
    return;
  }
  const modules = workspace.details[location.channel] ?? [];
  const index = location.index ?? 0;
  workspace.details = { ...workspace.details, [location.channel]: modules.map((module, moduleIndex) => moduleIndex !== index ? module : location.field === "detailTitle" ? { ...module, title: replacement, titleZh: replacementZh } : { ...module, body: replacement, bodyZh: replacementZh }) };
}

async function optimizeAssetLocation(workspace: ProjectWorkspace, findings: ComplianceFinding[], explicitRetry = false): Promise<OptimizationPatch | null> {
  const location = findings[0]?.location;
  if (!location || location.kind !== "asset" || !location.assetId) throw new Error("这条图片风险没有可编辑的素材定位，请先重新检测。" );
  const current = workspace.assets.find((asset) => asset.id === location.assetId);
  if (!current) throw new Error("对应图片不存在，可能已被替换；请重新检测后再优化。" );
  const requirement = assetRequirement(current.kind, workspace.truth);
  if (!requirement.ready) return null;
  if (!explicitRetry && current.retries >= maxAutomaticAssetRetries) return null;
  const sourceImage = await sourceImageDataUrl(workspace);
  const correction = findings.map((finding) => `${finding.excerpt}；${finding.explanation}；建议：${finding.suggestion}`).join("\n");
  const replacement = await generateSingleAsset(workspace, current.channel, current.kind, sourceImage, current.version + 1, current.id, current.retries + 1, correction);
  return { kind: "asset", assetId: current.id, replacement };
}

async function optimizeFindings(workspace: ProjectWorkspace, findings: ComplianceFinding[], onProgress?: (progress: { completed: number; succeeded: number; failed: number; current?: string }) => Promise<void>) {
  const groups = new Map<string, ComplianceFinding[]>();
  for (const finding of findings) {
    if (!finding.location) continue;
    const key = locationKey(finding.location);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  if (!groups.size) throw new Error("旧版检测记录无法精确优化，请先重新运行规则检测。" );
  const channelGroups = [...groups.values()];
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  const patches = await Promise.all(channelGroups.map(async (group) => {
    try {
      const patch = group[0].location?.kind === "asset" ? await optimizeAssetLocation(workspace, group, true) : await optimizeListingLocation(workspace, group);
      completed += group.length; if (patch) succeeded += group.length; else failed += group.length;
      await onProgress?.({ completed, succeeded, failed, current: group[0].target });
      return patch;
    } catch {
      completed += group.length; failed += group.length;
      await onProgress?.({ completed, succeeded, failed, current: group[0].target });
      return null;
    }
  }));
  const unlocatable = findings.filter((finding) => !finding.location);
  if (unlocatable.length) {
    completed += unlocatable.length;
    failed += unlocatable.length;
    await onProgress?.({ completed, succeeded, failed, current: "旧版风险记录无法定位，请重新检查" });
  }
  const changedAssetIds = new Set<string>();
  for (const patch of patches) {
    if (!patch) continue;
    applyOptimizationPatch(workspace, patch);
    if (patch.kind === "asset") {
      // Keep both IDs out of the preserved findings: the old ID belongs to
      // the finding being replaced, while the new ID is what the recheck sees.
      changedAssetIds.add(patch.assetId);
      changedAssetIds.add(patch.replacement.id);
    }
  }
  return changedAssetIds;
}

async function retryFailedAssets(workspace: ProjectWorkspace, changedAssetIds: Set<string>, channel?: Channel) {
  for (let attempt = 0; attempt < maxAutomaticAssetRetries; attempt += 1) {
    const groups = new Map<string, ComplianceFinding[]>();
    for (const finding of workspace.findings.filter((item) => item.status === "open" && item.location?.kind === "asset" && (!channel || item.location.channel === channel))) {
      const key = locationKey(finding.location!);
      groups.set(key, [...(groups.get(key) ?? []), finding]);
    }
    const retryableGroups = [...groups.values()];
    if (!retryableGroups.length) return;
    // A retry is a new candidate that must replace the old candidate before
    // the next review. The previous implementation generated the file but
    // discarded its returned patch, so every retry reviewed the same bad file.
    const patches = await Promise.all(retryableGroups.map(async (group) => {
      try { return await optimizeAssetLocation(workspace, group, true); } catch { return null; }
    }));
    for (const patch of patches) {
      if (!patch) continue;
      applyOptimizationPatch(workspace, patch);
      if (patch.kind === "asset") {
        changedAssetIds.add(patch.assetId);
        changedAssetIds.add(patch.replacement.id);
      }
    }
    await runComplianceScan(workspace, changedAssetIds, channel);
    if (!workspace.findings.some((finding) => finding.status === "open" && finding.location?.kind === "asset" && (!channel || finding.location.channel === channel))) return;
  }
}

async function runComplianceScan(workspace: ProjectWorkspace, assetIds?: Set<string>, channel?: Channel) {
  const targetChannels = channel ? [channel] : workspace.project.channels;
  const targetAssets = workspace.assets.filter((asset) => targetChannels.includes(asset.channel));
  const targetAssetIds = assetIds ?? new Set(targetAssets.filter((asset) => asset.complianceStatus !== "passed").map((asset) => asset.id));
  const reviewIds = new Set([...targetAssetIds].filter((assetId) => targetAssets.some((asset) => asset.id === assetId)));
  const listingFindings = workspace.listings.filter((listing) => targetChannels.includes(listing.channel)).flatMap((listing) => scanListing(listing, workspace.truth));
  const detailFindings = targetChannels.flatMap((targetChannel) => scanDetail(targetChannel, workspace.details[targetChannel] ?? [], workspace.truth));
  const assetFindings = await reviewAssets(workspace, reviewIds);
  // Keep findings from other channels intact. Findings for the selected channel
  // are rebuilt from the current listing/detail/image versions only.
  const preservedFindings = workspace.findings.filter((finding) => {
    // A legacy finding has no reliable platform scope. Once a platform-scoped
    // scan is run, discard that legacy record instead of showing or exporting
    // it as if it belonged to the selected platform.
    if (channel && !finding.location) return false;
    if (channel && finding.location?.channel !== channel) return true;
    if (finding.location?.kind !== "asset") return false;
    return !reviewIds.has(finding.location.assetId ?? "");
  });
  workspace.findings = [...preservedFindings, ...listingFindings, ...detailFindings, ...assetFindings];
  workspace.project.coverage = Object.fromEntries(workspace.project.channels.map((channel) => [channel, coverageFor(workspace.truth.category, channel)])) as ProjectWorkspace["project"]["coverage"];
  workspace.project.currentStep = "compliance";
  workspace.project.status = workspace.findings.length ? "needs_review" : "completed";
}

function hasGeneratedContent(workspace: ProjectWorkspace, channel?: Channel) {
  const hasListing = workspace.listings.some((listing) => (!channel || listing.channel === channel) && [listing.title, listing.description, ...listing.bullets].some((value) => value.trim().length > 0));
  const hasDetails = Object.entries(workspace.details).some(([itemChannel, modules]) => (!channel || itemChannel === channel) && modules.length > 0);
  return hasListing || hasDetails || workspace.assets.some((asset) => !channel || asset.channel === channel);
}

async function runBackgroundOptimization(projectId: string, workspace: ProjectWorkspace, task: GenerationTask, action: "optimize_finding" | "optimize_all", findingId?: string, channel?: Channel) {
  try {
    Object.assign(task, { status: "running", startedAt: new Date().toISOString() });
    const targets = action === "optimize_finding"
      ? [workspace.findings.find((finding) => finding.id === findingId && finding.status === "open" && (!channel || finding.location?.channel === channel))].filter((finding): finding is ComplianceFinding => Boolean(finding))
      : workspace.findings.filter((finding) => finding.status === "open" && (!channel || finding.location?.channel === channel));
    if (!targets.length) throw new Error(action === "optimize_finding" ? "找不到待优化的风险记录，请先重新检测。" : "当前没有待优化的风险记录。" );
    if (action === "optimize_finding" && !targets[0].location) throw new Error("旧版检测记录无法精确优化，请先重新运行规则检测。" );
    task.targetFindingIds = targets.map((finding) => finding.id);
    const total = targets.length;
    task.progress = { total, completed: 0, succeeded: 0, failed: 0 };
    await persist(workspace, `后台优化已开始：${action}`);
    updateBackgroundTask(task, workspace);
    const changedAssetIds = await optimizeFindings(workspace, targets, async (progress) => {
      task.progress = { total, ...progress };
      task.outputSummary = `正在处理 ${progress.completed}/${total} 项：${progress.current ?? "风险内容"}`;
      workspace.tasks = workspace.tasks.map((item) => item.id === task.id ? task : item);
      await persist(workspace, `后台优化进度：${progress.completed}/${total}`);
      updateBackgroundTask(task, workspace);
    });
    await runComplianceScan(workspace, changedAssetIds, channel);
    await retryFailedAssets(workspace, changedAssetIds, channel);
    workspace = normalizeWorkspace(workspace);
    workspace.sources = ruleSources;
    updateBackgroundTask(task, workspace);
    const remaining = workspace.findings.filter((finding) => finding.status === "open" && (!channel || finding.location?.channel === channel)).length;
    const processed = task.progress?.succeeded ?? 0;
    const failed = task.progress?.failed ?? 0;
    const summary = remaining
      ? `已提交 ${processed} 项并完成复检，仍有 ${remaining} 项风险需要处理${failed ? `；${failed} 项未能自动修改` : ""}。`
      : "全部风险已处理并完成复检。";
    Object.assign(task, { status: "completed", outputSummary: summary, completedAt: new Date().toISOString(), progress: { total, completed: total, succeeded: processed, failed } });
    workspace.tasks = workspace.tasks.map((item) => item.id === task.id ? task : item);
    workspace.project.updatedAt = new Date().toISOString();
    await persist(workspace, `后台优化完成：${action}`);
    updateBackgroundTask(task, workspace);
  } catch (error) {
    const message = error instanceof Error ? error.message : "后台优化失败。";
    Object.assign(task, { status: "failed", error: message, completedAt: new Date().toISOString() });
    workspace.tasks = workspace.tasks.map((item) => item.id === task.id ? task : item);
    try { await persist(workspace, `后台优化失败：${action}`); } catch { /* keep the original error in task */ }
    updateBackgroundTask(task, workspace);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: Action; workspace?: ProjectWorkspace; channel?: Channel; assetId?: string; findingId?: string; background?: boolean };
  if (!body.action) return Response.json({ error: "缺少工作流动作。" }, { status: 400 });
  let workspaceCandidate = body.workspace;
  if (!workspaceCandidate) {
    const { getWorkspace } = await import("../../../../lib/repository");
    workspaceCandidate = await getWorkspace(id) ?? undefined;
  }
  if (!workspaceCandidate || workspaceCandidate.project.id !== id) return Response.json({ error: "项目不存在或 ID 不匹配。" }, { status: 404 });
  let workspace = normalizeWorkspace(workspaceCandidate);
  if (body.channel && !workspace.project.channels.includes(body.channel)) {
    return Response.json({ error: "当前项目没有启用这个平台，请重新选择。" }, { status: 400 });
  }
  const action = body.action;
  const isBackground = body.background === true && (action === "optimize_finding" || action === "optimize_all");
  const task = makeTask(id, action, isBackground, body.channel);
  if (isBackground) {
    const targetFindingIds = action === "optimize_finding"
      ? workspace.findings.filter((finding) => finding.id === body.findingId && finding.status === "open" && (!body.channel || finding.location?.channel === body.channel)).map((finding) => finding.id)
      : workspace.findings.filter((finding) => finding.status === "open" && (!body.channel || finding.location?.channel === body.channel)).map((finding) => finding.id);
    task.targetFindingIds = targetFindingIds;
    const total = new Set(workspace.findings.filter((finding) => targetFindingIds.includes(finding.id) && finding.location).map((finding) => locationKey(finding.location!))).size;
    task.progress = { total, completed: 0, succeeded: 0, failed: 0 };
  }
  workspace.tasks = [...workspace.tasks, task];

  if (isBackground) {
    try {
      await persist(workspace, `后台优化排队：${action}`);
      registerBackgroundTask(id, task, workspace);
      void runBackgroundOptimization(id, workspace, task, action, body.findingId, body.channel);
      const { databaseMode } = await import("../../../../lib/repository");
      return Response.json({ workspace, task, async: true, storage: await databaseMode() }, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "后台任务无法创建。";
      return Response.json({ error: message }, { status: 503 });
    }
  }

  try {
    const now = new Date().toISOString();
    if (action === "analyze") {
      assertModelRouterConfigured();
      const image = await sourceImageDataUrl(workspace);
      const result = await visionJson<VisionResult>(
        "You extract only visible or strongly supported ecommerce product facts. Return strict JSON. Never invent dimensions, materials, certifications or efficacy claims. Return every fact label and value in English and Simplified Chinese.",
        "Return {category,categoryZh,categoryConfidence,facts:[{name,nameZh,value,valueZh,confidence}],identityLocks,missingInformation,missingInformationZh}. Every fact must be supported by the image or packaging text. Keep the English fields concise and provide faithful Simplified Chinese fields.",
        image,
      );
      const facts: ProductFact[] = (result.facts ?? []).filter((fact) => fact.name && fact.value).map((fact) => ({ id: crypto.randomUUID(), name: fact.name, nameZh: fact.nameZh || "", value: fact.value, valueZh: fact.valueZh || "", status: "pending", confidence: Math.max(0, Math.min(1, fact.confidence ?? 0.5)), evidenceIds: [workspace!.truth.sourceAsset!.id] }));
      workspace.truth = { ...workspace.truth, category: result.category || workspace.truth.category, categoryZh: result.categoryZh || workspace.truth.categoryZh || "", categoryConfidence: result.categoryConfidence ?? 0, attributes: facts, identityLocks: result.identityLocks ?? [], missingInformation: result.missingInformation ?? [], missingInformationZh: result.missingInformationZh ?? [], confirmedAt: undefined, evidence: [{ id: workspace.truth.sourceAsset!.id, type: "image", label: workspace.truth.sourceAsset!.filename, source: workspace.truth.sourceAsset!.url, confidence: 1 }] };
      workspace.project.category = workspace.truth.category;
      workspace.project.currentStep = "truth";
      workspace.project.status = "needs_review";
    } else if (action === "confirm_truth") {
      if (!workspace.truth.attributes.some((fact) => fact.status === "verified")) throw new Error("至少确认一条商品事实后才能进入创作。");
      workspace.truth.confirmedAt = now;
      workspace.project.currentStep = "assets";
      workspace.project.status = "running";
    } else if (action === "translate") {
      assertModelRouterConfigured();
      const translated = await chatJson<TranslationResult>(
        "You are a professional ecommerce translator. Return strict JSON. Translate only the supplied content into natural Simplified Chinese. Never add, strengthen or alter product facts, measurements, certifications, efficacy or performance claims.",
        JSON.stringify({ product: { name: workspace.truth.productName, category: workspace.truth.category, facts: workspace.truth.attributes.map(({ id, name, value }) => ({ id, name, value })), missingInformation: workspace.truth.missingInformation }, listings: workspace.listings.map(({ channel, title, bullets, description, searchTerms, metaTitle, metaDescription }) => ({ channel, title, bullets, description, searchTerms, metaTitle, metaDescription })), details: workspace.details, required: { facts: "id,nameZh,valueZh", listings: "channel,titleZh,bulletsZh,descriptionZh,searchTermsZh,metaTitleZh,metaDescriptionZh", details: "same channel and module id with titleZh,bodyZh" } }),
      );
      const translatedFacts = new Map((translated.facts ?? []).filter((fact) => fact.id).map((fact) => [fact.id, fact]));
      workspace.truth = { ...workspace.truth, categoryZh: translated.categoryZh || workspace.truth.categoryZh || "", missingInformationZh: translated.missingInformationZh ?? workspace.truth.missingInformationZh ?? [], attributes: workspace.truth.attributes.map((fact) => ({ ...fact, nameZh: translatedFacts.get(fact.id)?.nameZh ?? fact.nameZh ?? "", valueZh: translatedFacts.get(fact.id)?.valueZh ?? fact.valueZh ?? "" })) };
      const translatedListings = new Map((translated.listings ?? []).map((listing) => [listing.channel, listing]));
      workspace.listings = workspace.listings.map((listing) => ({ ...listing, ...(translatedListings.get(listing.channel) ?? {}) }));
      const translatedDetails = Object.fromEntries(Object.entries(translated.details ?? {}).map(([channel, modules]) => [channel, (workspace.details[channel as Channel] ?? []).map((module) => ({ ...module, ...((modules ?? []).find((item) => item.id === module.id) ?? {}) }))])) as Partial<Record<Channel, DetailModule[]>>;
      workspace.details = { ...workspace.details, ...translatedDetails };
      workspace.project.status = workspace.project.status === "completed" ? "completed" : "needs_review";
    } else if (action === "generate") {
      assertModelRouterConfigured();
      if (!workspace.truth.confirmedAt) throw new Error("请先确认商品事实档案。");
      const targetChannels = body.channel && workspace.project.channels.includes(body.channel) ? [body.channel] : workspace.project.channels;
      const verifiedFacts = workspace.truth.attributes.filter((fact) => fact.status === "verified");
      const sourceImage = await sourceImageDataUrl(workspace);
      const generated = await chatJson<GeneratedContent>(
        `You create US ecommerce listings grounded exclusively in verified product facts. Return strict JSON. Objective claims must include factIds; unsupported claims must set needsEvidence=true. Produce separate channel-specific content. Write all human-readable copy in ${selectedLanguage(workspace) === "zh-CN" ? "Simplified Chinese only" : "natural English only"}; do not mix languages. Never invent a product parameter, certification, efficacy claim or performance number.`,
        JSON.stringify({ outputLanguage: workspace.outputLanguage ?? "bilingual", productName: workspace.truth.productName, category: workspace.truth.category, verifiedFacts, channels: targetChannels, required: { listings: "one per channel with channel,strategy,title,titleZh,bullets,bulletsZh,description,descriptionZh,searchTerms,searchTermsZh,metaTitle,metaTitleZh,metaDescription,metaDescriptionZh,claims,score", details: "object keyed by channel with 3-6 modules; each module must have title, titleZh, body, bodyZh, factIds and assetIds" } }),
      );
      const language = selectedLanguage(workspace);
      const generatedListings = generated.listings.filter((listing) => targetChannels.includes(listing.channel)).map((listing) => applyOutputLanguage(listing, language));
      workspace.listings = workspace.listings.map((listing) => {
        const next = generatedListings.find((item) => item.channel === listing.channel);
        if (!next) return listing;
        return {
          ...next,
          titleZh: next.titleZh || "",
          bulletsZh: next.bulletsZh ?? next.bullets.map(() => ""),
          descriptionZh: next.descriptionZh || "",
          searchTermsZh: next.searchTermsZh || "",
          metaTitleZh: next.metaTitleZh || "",
          metaDescriptionZh: next.metaDescriptionZh || "",
          claims: (next.claims ?? []).map((claim) => ({ ...claim, needsEvidence: claim.needsEvidence || claim.factIds.length === 0 })),
        };
      });
      const verifiedFactIds = new Set(verifiedFacts.map((fact) => fact.id));
      workspace.details = { ...workspace.details, ...Object.fromEntries(Object.entries(generated.details ?? {}).map(([key, modules]) => [key, (modules ?? []).map((module, index) => applyOutputLanguageToDetail({ ...module, type: generatedDetailTypes.includes(module.type) ? module.type : generatedDetailTypes[index] ?? "benefits", titleZh: module.titleZh || "", bodyZh: module.bodyZh || "", factIds: (module.factIds ?? []).filter((factId) => verifiedFactIds.has(factId)), assetIds: [] }, language))])) as Partial<Record<Channel, DetailModule[]>> };
      const generatedAssets = await generateAssets(workspace, targetChannels, sourceImage);
      workspace.assets = [...workspace.assets.filter((asset) => !targetChannels.includes(asset.channel)), ...generatedAssets];
      for (const targetChannel of targetChannels) {
        const channelAssets = generatedAssets.filter((asset) => asset.channel === targetChannel);
        workspace.details[targetChannel] = (workspace.details[targetChannel] ?? []).map((module) => {
          const kind = assetKindForModule(module.type);
          const asset = kind ? channelAssets.find((item) => item.kind === kind) : undefined;
          return { ...module, assetIds: asset ? [asset.id] : [] };
        });
      }
      workspace.project.currentStep = "listing";
      workspace.project.status = "needs_review";
    } else if (action === "regenerate_asset") {
      assertModelRouterConfigured();
      if (!workspace.truth.confirmedAt) throw new Error("请先确认商品事实档案。" );
      if (!body.assetId) throw new Error("缺少需要重新生成的图片。" );
      const current = workspace.assets.find((asset) => asset.id === body.assetId);
      if (!current) throw new Error("需要重新生成的图片不存在，可能已被替换。" );
      const sourceImage = await sourceImageDataUrl(workspace);
      const replacement = await generateSingleAsset(workspace, current.channel, current.kind, sourceImage, current.version + 1, current.id, current.retries + 1);
      workspace.assets = workspace.assets.map((asset) => asset.id === current.id ? replacement : asset);
      workspace.findings = workspace.findings.filter((finding) => finding.target !== `${current.channel}/${current.kind} image`);
      workspace.project.currentStep = "compliance";
      workspace.project.status = "needs_review";
    } else if (action === "scan") {
      if (!hasGeneratedContent(workspace, body.channel)) throw new Error("请先生成当前平台的 Listing、详情页或商品图片，再开始检查。" );
      await runComplianceScan(workspace, undefined, body.channel);
    } else if (action === "optimize_finding" || action === "optimize_all") {
      assertModelRouterConfigured();
      const targets = action === "optimize_finding"
        ? [workspace.findings.find((finding) => finding.id === body.findingId && finding.status === "open" && (!body.channel || finding.location?.channel === body.channel))].filter((finding): finding is ComplianceFinding => Boolean(finding))
        : workspace.findings.filter((finding) => finding.status === "open" && (!body.channel || finding.location?.channel === body.channel));
      if (!targets.length) throw new Error(action === "optimize_finding" ? "找不到待优化的风险记录，请先重新检测。" : "当前没有待优化的风险记录。" );
      if (action === "optimize_finding" && !targets[0].location) throw new Error("旧版检测记录无法精确优化，请先重新运行规则检测。" );
       const changedAssetIds = await optimizeFindings(workspace, targets);
       await runComplianceScan(workspace, changedAssetIds, body.channel);
       await retryFailedAssets(workspace, changedAssetIds, body.channel);
    } else {
      removeUnsupportedClaims(workspace, body.channel);
      await runComplianceScan(workspace, undefined, body.channel);
    }
    // Model output and older saved projects may contain arrays with non-string
    // values. Normalize once more before returning the workspace to the browser
    // so a malformed translation can never crash the whole React tree.
    workspace = normalizeWorkspace(workspace);
    const remainingOpen = workspace.findings.filter((finding) => finding.status === "open" && (!body.channel || finding.location?.channel === body.channel));
    const exhaustedAssets = new Set(remainingOpen.filter((finding) => finding.location?.kind === "asset").map((finding) => finding.location?.assetId).filter((assetId): assetId is string => Boolean(assetId && workspace.assets.find((asset) => asset.id === assetId && asset.retries >= maxAutomaticAssetRetries))));
    const optimizationResult = remainingOpen.length ? `；复检后仍有 ${remainingOpen.length} 项风险${exhaustedAssets.size ? `，${exhaustedAssets.size} 张图片已达到自动重试上限，请人工替换` : "，请继续处理"}` : "，复检已通过";
    const unavailableRoles = assetKinds.filter((kind) => !assetRequirement(kind, workspace.truth).ready).map((kind) => assetPurpose[kind].nameZh).join("、");
    const outputSummary = action === "regenerate_asset" ? "单张素材已重新生成，等待合规复检" : action === "optimize_finding" ? `单项风险已由 AI 优化并完成复检${optimizationResult}` : action === "optimize_all" ? `全部可定位风险已由 AI 优化并完成复检${optimizationResult}` : action === "generate" ? `内容与可用图片已生成${unavailableRoles ? `；${unavailableRoles}因缺少已确认事实暂未生成` : ""}` : "工作流已真实执行并保存";
    Object.assign(task, { status: "completed", outputSummary, completedAt: new Date().toISOString() });
    workspace.sources = ruleSources;
    workspace.project.updatedAt = new Date().toISOString();
    await persist(workspace, `工作流：${action}`);
    const { databaseMode } = await import("../../../../lib/repository");
    return Response.json({ workspace, task, storage: await databaseMode() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "工作流执行失败。";
    Object.assign(task, { status: "failed", error: message, completedAt: new Date().toISOString() });
    workspace.project.updatedAt = new Date().toISOString();
    try { await persist(workspace, `工作流失败：${action}`); } catch { /* original failure is more useful */ }
    const clientError = /^(请先|至少|缺少|找不到|当前没有|旧版)/.test(message);
    return Response.json({ error: message, workspace, task }, { status: clientError ? 409 : modelMode() === "live" ? 502 : 409 });
  }
}

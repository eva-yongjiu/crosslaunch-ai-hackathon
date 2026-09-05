import { getAssetRecord, saveAssetRecord } from "../../../../lib/asset-repository";
import { coverageFor, scanListing } from "../../../../lib/compliance";
import { assertModelRouterConfigured, chatJson, generateImage, modelMode, visionJson } from "../../../../lib/model-router";
import { ruleSources } from "../../../../lib/rules";
import { getStoredObject, putStoredObject } from "../../../../lib/storage";
import type { AssetVersion, Channel, ChannelListing, ComplianceFinding, DetailModule, GenerationTask, ProductFact, ProjectWorkspace } from "../../../../lib/domain";

type Action = "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "regenerate_asset";
type VisionResult = { category?: string; categoryZh?: string; categoryConfidence?: number; facts?: Array<{ name: string; nameZh?: string; value: string; valueZh?: string; confidence?: number }>; identityLocks?: string[]; missingInformation?: string[]; missingInformationZh?: string[] };
type VisualReviewResult = { passed?: boolean; consistencyScore?: number; findings?: Array<{ excerpt?: string; excerptZh?: string; severity?: "high" | "medium" | "low"; explanation?: string; explanationZh?: string; suggestion?: string; suggestionZh?: string; bbox?: [number, number, number, number] }> };
type GeneratedContent = { listings: ChannelListing[]; details: Partial<Record<Channel, DetailModule[]>> };
type TranslationResult = { categoryZh?: string; missingInformationZh?: string[]; facts?: Array<{ id?: string; nameZh?: string; valueZh?: string }>; listings?: Array<{ channel: Channel; titleZh?: string; bulletsZh?: string[]; descriptionZh?: string; searchTermsZh?: string; metaTitleZh?: string; metaDescriptionZh?: string }>; details?: Partial<Record<Channel, Array<{ id: string; titleZh?: string; bodyZh?: string }>>> };

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

function makeTask(id: string, action: Action): GenerationTask {
  return {
    id: crypto.randomUUID(), projectId: id,
    type: action === "scan" || action === "apply_fixes" ? "compliance" : action === "generate" || action === "regenerate_asset" ? "assets" : action === "translate" ? "listing" : "analyze",
    mode: modelMode(), status: "running", retries: 0, inputSummary: action, startedAt: new Date().toISOString(),
  };
}

function removeUnsupportedClaims(workspace: ProjectWorkspace) {
  const unsupported = workspace.findings.filter((item) => item.status === "open").map((item) => item.excerpt).filter(Boolean);
  workspace.listings = workspace.listings.map((listing) => {
    const clean = (value: string) => unsupported.reduce((text, excerpt) => text.replaceAll(excerpt, "").replace(/\s{2,}/g, " ").trim(), value);
    return { ...listing, title: clean(listing.title), bullets: listing.bullets.map(clean).filter(Boolean), description: clean(listing.description), claims: listing.claims.filter((claim) => !unsupported.includes(claim.text)) };
  });
}

const assetPrompts: Record<AssetVersion["kind"], string> = {
  main: "clean ecommerce main product image on pure white background, no promotional text",
  scene: "realistic lifestyle scene showing the product in a credible use context",
  model: "commercial lifestyle photo with a US-market model naturally using the exact product",
  comparison: "clean comparison infographic using only the supplied verified facts",
  size: "technical size and specification infographic using only the supplied verified facts",
};

async function generateSingleAsset(workspace: ProjectWorkspace, channel: Channel, kind: AssetVersion["kind"], sourceImage: string, version: number, replacedFromId?: string, retries = 0): Promise<AssetVersion> {
  const facts = workspace.truth.attributes.filter((fact) => fact.status === "verified").map((fact) => `${fact.name}: ${fact.value}`).join("; ");
  const prompt = `Use the supplied product photo as the authoritative visual reference. Create a ${assetPrompts[kind]}. Product: ${workspace.truth.productName}. Verified facts: ${facts}. Preserve the exact product color, shape, structure, logo, labels and included accessories. Target channel: ${channel}. Do not invent specifications, certifications, extra accessories or packaging. Keep the image understandable for a Chinese-English operator: no text on the main, scene, or model image; if comparison or size text is necessary, use short, accurate English and Simplified Chinese pairs only.`;
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
  return { id, kind, channel, url: `/api/assets/${id}`, version, consistencyScore: 0, complianceStatus: "pending", retries, prompt, replacedFromId };
}

async function generateAssets(workspace: ProjectWorkspace, channels: Channel[], sourceImage: string): Promise<AssetVersion[]> {
  const generated: AssetVersion[] = [];
  for (const channel of channels) for (const kind of Object.keys(assetPrompts) as AssetVersion["kind"][]) {
    generated.push(await generateSingleAsset(workspace, channel, kind, sourceImage, 1));
  }
  return generated;
}

async function reviewAssets(workspace: ProjectWorkspace): Promise<ComplianceFinding[]> {
  if (!workspace.assets.length) return [];
  assertModelRouterConfigured();
  const facts = workspace.truth.attributes.filter((fact) => fact.status === "verified").map((fact) => `${fact.name}: ${fact.value}`).join("; ");
  const findings: ComplianceFinding[] = [];
  for (const asset of workspace.assets) {
    const image = await assetDataUrl(asset.id, `${asset.channel}/${asset.kind} 图片`);
    const review = await visionJson<VisualReviewResult>(
      "You review ecommerce product images against the supplied verified facts and channel rules. Return strict JSON. Do not infer hidden specifications. Mark passed false when the product identity is visibly altered, extra products/accessories are added, or the image contains misleading promotional/technical claims. Return every human-readable finding in both English and Simplified Chinese.",
      `Return {passed,consistencyScore,findings:[{excerpt,excerptZh,severity,explanation,explanationZh,suggestion,suggestionZh,bbox}]}. Product: ${workspace.truth.productName}. Verified facts: ${facts}. Channel: ${asset.channel}. Asset kind: ${asset.kind}. Review exact product identity, visible text, extra objects, unsupported claims, and suitability for the channel.`,
      image,
    );
    asset.consistencyScore = Math.max(0, Math.min(1, review.consistencyScore ?? (review.passed ? 1 : 0)));
    asset.complianceStatus = review.passed ? "passed" : "failed";
    const sourceId = asset.channel === "amazon-us" ? "amazon-images" : asset.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media";
    for (const [index, issue] of (review.findings ?? []).entries()) {
      findings.push({
        id: `finding_asset_${asset.id}_${index}`,
        ruleId: "visual-asset-review",
        sourceId,
        severity: issue.severity ?? "high",
        status: "open",
        target: `${asset.channel}/${asset.kind} image`,
        excerpt: issue.excerpt || "图片视觉风险",
        explanation: issue.explanation || "视觉模型发现图片可能与商品事实或渠道要求不一致。",
        suggestion: issue.suggestion || "重新生成或人工替换该图片后再次检测。",
        bbox: issue.bbox,
        excerptZh: issue.excerptZh,
        explanationZh: issue.explanationZh,
        suggestionZh: issue.suggestionZh,
        location: { kind: "asset", channel: asset.channel, assetId: asset.id },
        version: asset.version,
      });
    }
  }
  return findings;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: Action; workspace?: ProjectWorkspace; channel?: Channel; assetId?: string };
  if (!body.action) return Response.json({ error: "缺少工作流动作。" }, { status: 400 });
  let workspace = body.workspace;
  if (!workspace) {
    const { getWorkspace } = await import("../../../../lib/repository");
    workspace = await getWorkspace(id) ?? undefined;
  }
  if (!workspace || workspace.project.id !== id) return Response.json({ error: "项目不存在或 ID 不匹配。" }, { status: 404 });
  const action = body.action;
  const task = makeTask(id, action);
  workspace.tasks = [...workspace.tasks, task];

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
        "You create US ecommerce listings grounded exclusively in verified product facts. Return strict JSON. Objective claims must include factIds; unsupported claims must set needsEvidence=true. Produce separate channel-specific content. The US marketplace fields are English for publishing, and every listing and detail module must also include faithful Simplified Chinese translations. Never invent a product parameter, certification, efficacy claim or performance number.",
        JSON.stringify({ outputLanguage: workspace.outputLanguage ?? "bilingual", productName: workspace.truth.productName, category: workspace.truth.category, verifiedFacts, channels: targetChannels, required: { listings: "one per channel with channel,strategy,title,titleZh,bullets,bulletsZh,description,descriptionZh,searchTerms,searchTermsZh,metaTitle,metaTitleZh,metaDescription,metaDescriptionZh,claims,score", details: "object keyed by channel with 3-6 modules; each module must have title, titleZh, body, bodyZh, factIds and assetIds" } }),
      );
      const generatedListings = generated.listings.filter((listing) => targetChannels.includes(listing.channel));
      workspace.listings = workspace.listings.map((listing) => {
        const next = generatedListings.find((item) => item.channel === listing.channel);
        if (!next) return listing;
        return { ...next, titleZh: next.titleZh || "", bulletsZh: next.bulletsZh ?? next.bullets.map(() => ""), descriptionZh: next.descriptionZh || "", searchTermsZh: next.searchTermsZh || "", metaTitleZh: next.metaTitleZh || "", metaDescriptionZh: next.metaDescriptionZh || "" };
      });
      workspace.details = { ...workspace.details, ...Object.fromEntries(Object.entries(generated.details ?? {}).map(([key, modules]) => [key, (modules ?? []).map((module) => ({ ...module, titleZh: module.titleZh || "", bodyZh: module.bodyZh || "" }))])) as Partial<Record<Channel, DetailModule[]>> };
      const generatedAssets = await generateAssets(workspace, targetChannels, sourceImage);
      workspace.assets = [...workspace.assets.filter((asset) => !targetChannels.includes(asset.channel)), ...generatedAssets];
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
      const listingFindings = workspace.listings.flatMap((listing) => scanListing(listing, workspace!.truth));
      const assetFindings = await reviewAssets(workspace);
      workspace.findings = [...listingFindings, ...assetFindings];
      workspace.project.coverage = Object.fromEntries(workspace.project.channels.map((channel) => [channel, coverageFor(workspace!.truth.category, channel)])) as ProjectWorkspace["project"]["coverage"];
      workspace.project.currentStep = "compliance";
      workspace.project.status = workspace.findings.length ? "needs_review" : "completed";
    } else {
      removeUnsupportedClaims(workspace);
      workspace.findings = workspace.listings.flatMap((listing) => scanListing(listing, workspace!.truth));
      workspace.project.currentStep = "compliance";
      workspace.project.status = workspace.findings.some((finding) => finding.severity === "high") ? "needs_review" : "completed";
    }
    Object.assign(task, { status: "completed", outputSummary: action === "regenerate_asset" ? "单张素材已重新生成，等待合规复检" : "工作流已真实执行并保存", completedAt: new Date().toISOString() });
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
    return Response.json({ error: message, workspace, task }, { status: modelMode() === "live" ? 502 : 409 });
  }
}

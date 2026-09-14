import type { Channel, ChannelListing, ClaimLink, ComplianceFinding, DetailModule, ListingField, ProductFact, ProjectWorkspace } from "./domain";
import { buildPlatformFields, ruleSources } from "./rules";

const allChannels: Channel[] = ["amazon-us", "tiktok-us", "shopify-us"];

function emptyListing(channel: Channel): ChannelListing {
  return {
    channel,
    strategy: "conversion",
    title: "",
    bullets: [],
    description: "",
    searchTerms: channel === "amazon-us" ? "" : undefined,
    metaTitle: channel === "shopify-us" ? "" : undefined,
    metaDescription: channel === "shopify-us" ? "" : undefined,
    claims: [],
    score: 0,
  };
}

export function createEmptyWorkspace(input: {
  id?: string;
  name?: string;
  productName: string;
  category?: string;
  channels?: Channel[];
}): ProjectWorkspace {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const channels = input.channels?.length ? input.channels : allChannels;
  const category = input.category?.trim() || "未分类";
  return {
    project: {
      id,
      name: input.name?.trim() || `${input.productName} 跨境上新`,
      productName: input.productName.trim(),
      category,
      channels,
      status: "queued",
      currentStep: "input",
      coverage: Object.fromEntries(channels.map((channel) => [channel, "partial"])) as ProjectWorkspace["project"]["coverage"],
      createdAt: now,
      updatedAt: now,
    },
    outputLanguage: "en-US",
    truth: {
      id: crypto.randomUUID(),
      projectId: id,
      productName: input.productName.trim(),
      category,
      categoryConfidence: 0,
      attributes: [],
      identityLocks: [],
      prohibitedInventions: ["未由用户确认的参数", "未提供证据的功效宣称", "无法从商品或包装确认的认证"],
      missingInformation: [],
      evidence: [],
    },
    listings: channels.map(emptyListing),
    details: Object.fromEntries(channels.map((channel) => [channel, []])) as unknown as ProjectWorkspace["details"],
    assets: [],
    findings: [],
    sources: ruleSources,
    tasks: [],
  };
}

type RawRecord = Record<string, unknown>;

function rawRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function textValue(value: unknown, separator = " "): string {
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(separator);
  if (typeof value === "string") return stripInternalMarkers(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

/** 模型只允许输出面向用户的文案，内部 FastId/UUID 永远不能进入商品内容。 */
function stripInternalMarkers(value: string) {
  return value
    .replace(/\bfact\s*(?:id\s*)?[:：=-]?\s*[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "verified fact")
    .replace(/事实\s*(?:ID\s*)?[:：=-]?\s*[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "已确认事实")
    .replace(/\b(?:fast\s*id|fastid|fact\s*id|factid|internal\s+(?:fact|reference)\s*id|uuid)\s*[:：=-]?\s*[a-z0-9_-]{4,}/gi, "")
    .replace(/\b(?:allowed\s+|supplied\s+|verified\s+|internal\s+)?fact\s*ids?\b/gi, "verified facts")
    .replace(/\binternal\s+reference\s+ids?\b/gi, "verified facts")
    .replace(/(?:事实\s*ID|内部(?:事实|引用)?\s*ID|素材\s*ID)\s*[:：=-]?\s*[a-z0-9_-]*/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "")
    .replace(/\b(?:fast\s*id|fastid|fact\s*id|factid)\b/gi, "")
    .replace(/\[\s*[,，;；:\s]*\]/g, "")
    .replace(/\[\s*(?:verified facts?|已确认事实)?\s*[,，;；:：\s]*\]/gi, "")
    .replace(/\(\s*[,，;；:\s]*\)/g, "")
    .replace(/[（(]\s*(?:事实|fact|verified facts?|已确认事实)?\s*[）)]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function stringArray(value: unknown, splitLines = false): string[] {
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean);
  if (typeof value === "string" && splitLines) return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeClaim(value: unknown): ClaimLink | null {
  const raw = rawRecord(value);
  const text = textValue(raw.text ?? raw.claim).trim();
  if (!text) return null;
  const factIds = stringArray(raw.factIds);
  return {
    ...raw,
    text,
    claimZh: textValue(raw.claimZh).trim() || undefined,
    factIds,
    needsEvidence: typeof raw.needsEvidence === "boolean" ? raw.needsEvidence : factIds.length === 0,
    intent: textValue(raw.intent),
    keywords: stringArray(raw.keywords),
  } as ClaimLink;
}

function normalizePlatformField(value: unknown): ListingField | null {
  const raw = rawRecord(value);
  const key = textValue(raw.key).trim();
  if (!key) return null;
  const status = raw.status === "ready" || raw.status === "needs_review" || raw.status === "missing" ? raw.status : textValue(raw.value).trim() ? "needs_review" : "missing";
  return {
    key,
    label: textValue(raw.label) || key,
    labelZh: textValue(raw.labelZh) || key,
    value: textValue(raw.value),
    valueZh: textValue(raw.valueZh),
    required: raw.required !== false,
    status,
    helpZh: textValue(raw.helpZh),
    factIds: stringArray(raw.factIds),
  };
}

function normalizeListing(value: ChannelListing): ChannelListing {
  const raw = rawRecord(value);
  const strategy = raw.strategy === "seo" || raw.strategy === "brand" || raw.strategy === "conversion" ? raw.strategy : "conversion";
  const claims = Array.isArray(raw.claims) ? raw.claims.map(normalizeClaim).filter((claim): claim is ClaimLink => Boolean(claim)) : [];
  return {
    ...raw,
    strategy,
    title: textValue(raw.title),
    titleZh: textValue(raw.titleZh),
    bullets: stringArray(raw.bullets, true),
    bulletsZh: stringArray(raw.bulletsZh, true),
    description: textValue(raw.description),
    descriptionZh: textValue(raw.descriptionZh),
    searchTerms: raw.searchTerms === undefined ? undefined : textValue(raw.searchTerms),
    searchTermsZh: raw.searchTermsZh === undefined ? undefined : textValue(raw.searchTermsZh),
    metaTitle: raw.metaTitle === undefined ? undefined : textValue(raw.metaTitle),
    metaTitleZh: raw.metaTitleZh === undefined ? undefined : textValue(raw.metaTitleZh),
    metaDescription: raw.metaDescription === undefined ? undefined : textValue(raw.metaDescription),
    metaDescriptionZh: raw.metaDescriptionZh === undefined ? undefined : textValue(raw.metaDescriptionZh),
    platformFields: Array.isArray(raw.platformFields) ? raw.platformFields.map(normalizePlatformField).filter((field): field is ListingField => Boolean(field)) : [],
    claims,
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : Number(raw.score) || 0,
  } as ChannelListing;
}

function normalizeFact(value: ProductFact): ProductFact {
  const raw = rawRecord(value);
  return { ...value, name: textValue(raw.name), nameZh: textValue(raw.nameZh), value: textValue(raw.value), valueZh: textValue(raw.valueZh) };
}

const detailTypeOrder: DetailModule["type"][] = ["hero", "benefits", "scenario", "specs", "faq", "comparison", "steps", "reason"];

function normalizeDetailModule(value: DetailModule, index = 0): DetailModule {
  const raw = rawRecord(value);
  const type = detailTypeOrder.includes(raw.type as DetailModule["type"]) ? raw.type as DetailModule["type"] : detailTypeOrder[index] ?? "benefits";
  return { ...value, type, title: textValue(raw.title), titleZh: textValue(raw.titleZh), body: textValue(raw.body), bodyZh: textValue(raw.bodyZh), factIds: stringArray(raw.factIds), assetIds: stringArray(raw.assetIds) };
}

function containsChinese(value: string) { return /[\u3400-\u9fff]/.test(value); }
function normalizeBilingualText(primary: unknown, secondary: unknown, fallback: string) {
  const first = textValue(primary);
  const second = textValue(secondary);
  if (containsChinese(first)) return { primary: second && !containsChinese(second) ? second : fallback, secondary: first };
  return { primary: first || fallback, secondary: second };
}
function findingEnglishFallback(ruleId: string, field: "excerpt" | "explanation" | "suggestion") {
  const copy: Record<string, Record<typeof field, string>> = {
    "fact-evidence": { excerpt: "Unsupported product claim", explanation: "This product claim is not supported by a confirmed product fact.", suggestion: "Link a confirmed fact and evidence, or remove the unsupported claim." },
    "claim-absolute": { excerpt: "Absolute or guarantee claim", explanation: "This absolute, ranking or guarantee claim may lack sufficient evidence.", suggestion: "Rewrite it as a verifiable product structure, condition or test result." },
    "tiktok-all-caps": { excerpt: "All-caps wording", explanation: "The content uses all-caps wording that may reduce readability.", suggestion: "Use normal capitalization for clear, readable product copy." },
    "shopify-seo-length": { excerpt: "SEO title is too long", explanation: "The Shopify SEO title is longer than the recommended limit.", suggestion: "Shorten the SEO title while keeping the product name and key attributes." },
    "visual-asset-review": { excerpt: "Image compliance issue", explanation: "This image needs a manual asset-quality or product-consistency review.", suggestion: "Regenerate or replace the image using confirmed product facts and the selected platform requirements." },
  };
  return copy[ruleId]?.[field] ?? (field === "excerpt" ? "Compliance issue" : field === "explanation" ? "This item needs a compliance review." : "Update this item to match confirmed product facts and official platform requirements.");
}

function normalizeFinding(value: ComplianceFinding): ComplianceFinding {
  const raw = rawRecord(value);
  const excerpt = normalizeBilingualText(raw.excerpt, raw.excerptZh, findingEnglishFallback(textValue(raw.ruleId), "excerpt"));
  const explanation = normalizeBilingualText(raw.explanation, raw.explanationZh, findingEnglishFallback(textValue(raw.ruleId), "explanation"));
  const suggestion = normalizeBilingualText(raw.suggestion, raw.suggestionZh, findingEnglishFallback(textValue(raw.ruleId), "suggestion"));
  return {
    ...value,
    target: textValue(raw.target),
    excerpt: excerpt.primary,
    excerptZh: excerpt.secondary,
    explanation: explanation.primary,
    explanationZh: explanation.secondary,
    suggestion: suggestion.primary,
    suggestionZh: suggestion.secondary,
    fixedText: raw.fixedText === undefined ? undefined : textValue(raw.fixedText),
  };
}

export function normalizeWorkspace(workspace: ProjectWorkspace): ProjectWorkspace {
  const attributes = workspace.truth.attributes.map(normalizeFact);
  const fieldFacts = [
    ...attributes,
    { id: "truth-category", name: "Product category", nameZh: "商品类目", value: textValue(workspace.truth.category), valueZh: textValue(workspace.truth.categoryZh) },
  ];
  return {
    ...workspace,
    outputLanguage: workspace.outputLanguage === "zh-CN" ? "zh-CN" : "en-US",
    truth: {
      ...workspace.truth,
      category: textValue(workspace.truth.category),
      categoryZh: textValue(workspace.truth.categoryZh),
      attributes,
      missingInformation: stringArray(workspace.truth.missingInformation),
      missingInformationZh: stringArray(workspace.truth.missingInformationZh),
    },
    listings: workspace.listings.map((listing) => ({ ...normalizeListing(listing), platformFields: buildPlatformFields(listing.channel, listing.platformFields, fieldFacts) })),
    details: Object.fromEntries(Object.entries(workspace.details).map(([channel, modules]) => [channel, (modules ?? []).map((module, index) => normalizeDetailModule(module, index))])) as ProjectWorkspace["details"],
    findings: workspace.findings.map(normalizeFinding),
  };
}

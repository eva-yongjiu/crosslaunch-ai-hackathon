import type { Channel, ChannelListing, ClaimLink, DetailModule, ProductFact, ProjectWorkspace } from "./domain";
import { ruleSources } from "./rules";

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
    outputLanguage: "bilingual",
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
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
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
    claims,
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : Number(raw.score) || 0,
  } as ChannelListing;
}

function normalizeFact(value: ProductFact): ProductFact {
  const raw = rawRecord(value);
  return { ...value, name: textValue(raw.name), nameZh: textValue(raw.nameZh), value: textValue(raw.value), valueZh: textValue(raw.valueZh) };
}

function normalizeDetailModule(value: DetailModule): DetailModule {
  const raw = rawRecord(value);
  return { ...value, title: textValue(raw.title), titleZh: textValue(raw.titleZh), body: textValue(raw.body), bodyZh: textValue(raw.bodyZh), factIds: stringArray(raw.factIds), assetIds: stringArray(raw.assetIds) };
}

export function normalizeWorkspace(workspace: ProjectWorkspace): ProjectWorkspace {
  return {
    ...workspace,
    outputLanguage: workspace.outputLanguage ?? "bilingual",
    truth: {
      ...workspace.truth,
      category: textValue(workspace.truth.category),
      categoryZh: textValue(workspace.truth.categoryZh),
      attributes: workspace.truth.attributes.map(normalizeFact),
      missingInformation: stringArray(workspace.truth.missingInformation),
      missingInformationZh: stringArray(workspace.truth.missingInformationZh),
    },
    listings: workspace.listings.map(normalizeListing),
    details: Object.fromEntries(Object.entries(workspace.details).map(([channel, modules]) => [channel, (modules ?? []).map(normalizeDetailModule)])) as ProjectWorkspace["details"],
  };
}

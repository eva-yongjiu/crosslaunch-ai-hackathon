export type ModelMode = "fixture" | "live";
export type OutputLanguage = "bilingual" | "en-US" | "zh-CN";
export type TaskStatus = "queued" | "running" | "needs_review" | "failed" | "completed";
export type CoverageStatus = "full" | "partial" | "unsupported";
export type Channel = "amazon-us" | "tiktok-us" | "shopify-us";
export type FactStatus = "verified" | "pending" | "missing";
export type FindingStatus = "open" | "fixed" | "accepted";

export interface Evidence {
  id: string;
  type: "image" | "packaging_text" | "user_input" | "document";
  label: string;
  source: string;
  confidence: number;
  bbox?: [number, number, number, number];
}

export interface ProductFact {
  id: string;
  name: string;
  nameZh?: string;
  value: string;
  valueZh?: string;
  status: FactStatus;
  confidence: number;
  evidenceIds: string[];
}

export interface ProductTruthProfile {
  id: string;
  projectId: string;
  productName: string;
  category: string;
  categoryZh?: string;
  categoryConfidence: number;
  attributes: ProductFact[];
  identityLocks: string[];
  prohibitedInventions: string[];
  missingInformation: string[];
  missingInformationZh?: string[];
  evidence: Evidence[];
  sourceAsset?: UploadedAsset;
  confirmedAt?: string;
}

export interface UploadedAsset {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  kind: "source" | AssetVersion["kind"];
}

export interface ChannelProfile {
  id: Channel;
  name: string;
  market: "US";
  language: "en-US";
  imageRequirements: { minWidth: number; minHeight: number; mainBackground: string; maxImages: number };
  listingLimits: { titleMin: number; titleMax: number; bulletMax?: number };
}

export interface ClaimLink {
  text: string;
  factIds: string[];
  needsEvidence: boolean;
  intent: string;
  keywords: string[];
}

export interface ChannelListing {
  channel: Channel;
  strategy: "seo" | "brand" | "conversion";
  title: string;
  titleZh?: string;
  bullets: string[];
  bulletsZh?: string[];
  description: string;
  descriptionZh?: string;
  searchTerms?: string;
  searchTermsZh?: string;
  metaTitle?: string;
  metaTitleZh?: string;
  metaDescription?: string;
  metaDescriptionZh?: string;
  claims: ClaimLink[];
  score: number;
}

export interface DetailModule {
  id: string;
  type: "hero" | "benefits" | "scenario" | "comparison" | "specs" | "steps" | "faq" | "reason";
  title: string;
  titleZh?: string;
  body: string;
  bodyZh?: string;
  factIds: string[];
  assetIds: string[];
}

export interface ContentVersion {
  id: string;
  projectId: string;
  channel: Channel;
  contentType: "listing" | "detail";
  version: number;
  snapshot: ChannelListing | DetailModule[];
  factIds: string[];
  reason: string;
  createdAt: string;
}

export interface AssetVersion {
  id: string;
  kind: "main" | "scene" | "model" | "comparison" | "size";
  channel: Channel;
  url: string;
  version: number;
  consistencyScore: number;
  complianceStatus: "pending" | "passed" | "failed";
  retries: number;
  prompt?: string;
  replacedFromId?: string;
}

export interface RuleSource {
  id: string;
  authority: string;
  title: string;
  url: string;
  jurisdiction: string;
  platform?: Channel;
  categories: string[];
  version: string;
  effectiveAt?: string;
  fetchedAt: string;
  excerpt: string;
  contentHash: string;
}

export interface ComplianceRule {
  id: string;
  sourceId: string;
  scope: "platform" | "advertising" | "category" | "facts";
  target: "image" | "title" | "listing" | "detail" | "all";
  severity: "high" | "medium" | "low";
  categories: string[];
  channels: Channel[];
  pattern?: string;
  message: string;
  suggestion: string;
}

export interface ComplianceFinding {
  id: string;
  ruleId: string;
  sourceId: string;
  severity: "high" | "medium" | "low";
  status: FindingStatus;
  target: string;
  excerpt: string;
  explanation: string;
  suggestion: string;
  bbox?: [number, number, number, number];
  excerptZh?: string;
  explanationZh?: string;
  suggestionZh?: string;
  location?: ComplianceLocation;
  fixedText?: string;
  version: number;
}

export interface ComplianceLocation {
  kind: "listing" | "asset" | "detail";
  channel: Channel;
  field?: "title" | "bullet" | "description" | "searchTerms" | "metaTitle" | "metaDescription" | "detailTitle" | "detailBody";
  index?: number;
  assetId?: string;
}

export interface GenerationTask {
  id: string;
  projectId: string;
  type: "analyze" | "assets" | "listing" | "detail" | "compliance" | "export";
  mode: ModelMode;
  status: TaskStatus;
  providerTaskId?: string;
  retries: number;
  inputSummary: string;
  outputSummary?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LaunchProject {
  id: string;
  name: string;
  productName: string;
  category: string;
  channels: Channel[];
  status: TaskStatus;
  currentStep: string;
  coverage: Record<Channel, CoverageStatus>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWorkspace {
  project: LaunchProject;
  outputLanguage: OutputLanguage;
  truth: ProductTruthProfile;
  listings: ChannelListing[];
  details: Record<Channel, DetailModule[]>;
  assets: AssetVersion[];
  findings: ComplianceFinding[];
  sources: RuleSource[];
  tasks: GenerationTask[];
}

export interface RuntimeStatus {
  database: "available" | "unavailable";
  databaseProvider: "d1" | "local";
  objectStorage: "configured" | "unavailable";
  objectStorageProvider: "r2" | "local";
  modelRouter: {
    configured: boolean;
    mode: ModelMode;
  };
}

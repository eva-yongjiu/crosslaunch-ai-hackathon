import type { Channel, ChannelListing, ProjectWorkspace } from "./domain";
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
    details: Object.fromEntries(channels.map((channel) => [channel, []])) as ProjectWorkspace["details"],
    assets: [],
    findings: [],
    sources: ruleSources,
    tasks: [],
  };
}

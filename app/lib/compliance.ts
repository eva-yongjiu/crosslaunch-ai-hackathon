import type { Channel, ChannelListing, ComplianceFinding, ComplianceLocation, CoverageStatus, ProductTruthProfile } from "./domain";
import { channelProfiles, complianceRules, ruleSources } from "./rules";

const categoryPacks = ["beauty", "cosmetics", "personal-care", "food", "supplement", "health", "children", "appliance", "electronics", "consumer-goods", "美妆", "食品", "保健", "儿童", "电器", "电子"];

export function coverageFor(category: string, channel: Channel): CoverageStatus {
  const platformCovered = ruleSources.some((source) => source.platform === channel);
  const categoryCovered = categoryPacks.some((pack) => category.toLowerCase().includes(pack));
  if (platformCovered && categoryCovered) return "full";
  if (category.trim() || platformCovered) return "partial";
  return "unsupported";
}

export function scanListing(listing: ChannelListing, truth: ProductTruthProfile): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const segments: Array<{ text: string; location: ComplianceLocation; label: string }> = [
    { text: listing.title, location: { kind: "listing", channel: listing.channel, field: "title" }, label: "标题" },
    ...listing.bullets.map((text, index) => ({ text, location: { kind: "listing", channel: listing.channel, field: "bullet", index } satisfies ComplianceLocation, label: `第 ${index + 1} 条卖点` })),
    { text: listing.description, location: { kind: "listing", channel: listing.channel, field: "description" }, label: "商品描述" },
    ...(listing.searchTerms ? [{ text: listing.searchTerms, location: { kind: "listing", channel: listing.channel, field: "searchTerms" } satisfies ComplianceLocation, label: "Search Terms" }] : []),
    ...(listing.metaTitle ? [{ text: listing.metaTitle, location: { kind: "listing", channel: listing.channel, field: "metaTitle" } satisfies ComplianceLocation, label: "SEO 标题" }] : []),
    ...(listing.metaDescription ? [{ text: listing.metaDescription, location: { kind: "listing", channel: listing.channel, field: "metaDescription" } satisfies ComplianceLocation, label: "Meta Description" }] : []),
  ];
  for (const rule of complianceRules) {
    if (!rule.channels.includes(listing.channel) || !rule.pattern) continue;
    if (!rule.categories.includes("*") && !rule.categories.some((category) => truth.category.toLowerCase().includes(category))) continue;
    for (const segment of segments) {
      const match = segment.text.match(new RegExp(rule.pattern, "i"));
      if (!match) continue;
      findings.push({ id: `finding_${rule.id}_${listing.channel}_${segment.location.field}_${segment.location.index ?? 0}`, ruleId: rule.id, sourceId: rule.sourceId, severity: rule.severity, status: "open", target: `${listing.channel} · ${segment.label}`, excerpt: match[0], explanation: rule.message, suggestion: rule.suggestion, location: segment.location, version: 1 });
    }
  }
  const profile = channelProfiles.find((item) => item.id === listing.channel);
  if (profile && listing.title.length > profile.listingLimits.titleMax) {
    findings.push({ id: `finding_title_length_${listing.channel}`, ruleId: "title-length", sourceId: listing.channel === "amazon-us" ? "amazon-images" : listing.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media", severity: "medium", status: "open", target: `${listing.channel} · 标题`, excerpt: `${listing.title.length} characters`, explanation: `标题超过当前渠道配置的 ${profile.listingLimits.titleMax} 字符上限。`, suggestion: "缩短标题并保留商品品类、关键属性与真实规格。", location: { kind: "listing", channel: listing.channel, field: "title" }, version: 1 });
  }
  for (const claim of listing.claims.filter((item) => item.needsEvidence)) {
    const claimLocation = segments.find((segment) => segment.text.includes(claim.text))?.location ?? { kind: "listing", channel: listing.channel, field: "description" } satisfies ComplianceLocation;
    const locationLabel = claimLocation.field === "title" ? "标题" : claimLocation.field === "bullet" ? `第 ${(claimLocation.index ?? 0) + 1} 条卖点` : "商品描述";
    findings.push({ id: `finding_evidence_${listing.channel}_${findings.length}`, ruleId: "fact-evidence", sourceId: "ftc-truth", severity: "medium", status: "open", target: `${listing.channel} · ${locationLabel}`, excerpt: claim.text, explanation: "该客观宣称尚未关联已确认事实或证明材料。", suggestion: "上传证明材料并确认事实，或删除该宣称。", location: claimLocation, version: 1 });
  }
  return findings;
}

export function sourceCoverage(findings: ComplianceFinding[]) {
  return findings.map((finding) => ({ finding, source: ruleSources.find((source) => source.id === finding.sourceId) })).filter((item) => item.source);
}

import type { Channel, ChannelListing, ComplianceFinding, CoverageStatus, ProductTruthProfile } from "./domain";
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
  const content = [listing.title, ...listing.bullets, listing.description].join("\n");
  const findings: ComplianceFinding[] = [];
  for (const rule of complianceRules) {
    if (!rule.channels.includes(listing.channel) || !rule.pattern) continue;
    if (!rule.categories.includes("*") && !rule.categories.some((category) => truth.category.toLowerCase().includes(category))) continue;
    const match = content.match(new RegExp(rule.pattern, "i"));
    if (!match) continue;
    findings.push({ id: `finding_${rule.id}_${listing.channel}`, ruleId: rule.id, sourceId: rule.sourceId, severity: rule.severity, status: "open", target: `${listing.channel} listing`, excerpt: match[0], explanation: rule.message, suggestion: rule.suggestion, version: 1 });
  }
  const profile = channelProfiles.find((item) => item.id === listing.channel);
  if (profile && listing.title.length > profile.listingLimits.titleMax) {
    findings.push({ id: `finding_title_length_${listing.channel}`, ruleId: "title-length", sourceId: listing.channel === "amazon-us" ? "amazon-images" : listing.channel === "tiktok-us" ? "tiktok-listing" : "shopify-media", severity: "medium", status: "open", target: `${listing.channel} title`, excerpt: `${listing.title.length} characters`, explanation: `标题超过当前渠道配置的 ${profile.listingLimits.titleMax} 字符上限。`, suggestion: "缩短标题并保留商品品类、关键属性与真实规格。", version: 1 });
  }
  for (const claim of listing.claims.filter((item) => item.needsEvidence)) {
    findings.push({ id: `finding_evidence_${listing.channel}_${findings.length}`, ruleId: "fact-evidence", sourceId: "ftc-truth", severity: "medium", status: "open", target: `${listing.channel} claim`, excerpt: claim.text, explanation: "该客观宣称尚未关联已确认事实或证明材料。", suggestion: "上传证明材料并确认事实，或删除该宣称。", version: 1 });
  }
  return findings;
}

export function sourceCoverage(findings: ComplianceFinding[]) {
  return findings.map((finding) => ({ finding, source: ruleSources.find((source) => source.id === finding.sourceId) })).filter((item) => item.source);
}

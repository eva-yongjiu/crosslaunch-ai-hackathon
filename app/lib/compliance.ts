import type { Channel, ChannelListing, ComplianceFinding, CoverageStatus, ProductTruthProfile } from "./domain";
import { complianceRules, ruleSources } from "./rules";

const categoryPacks = ["beauty", "cosmetics", "personal-care", "food", "supplement", "health", "children", "appliance", "electronics", "consumer-goods"];

export function coverageFor(category: string, channel: Channel): CoverageStatus {
  const platformCovered = channel !== "shopify-us";
  const categoryCovered = categoryPacks.some((pack) => category.toLowerCase().includes(pack));
  if (platformCovered && categoryCovered) return "full";
  if (category || platformCovered) return "partial";
  return "unsupported";
}

export function scanListing(listing: ChannelListing, truth: ProductTruthProfile): ComplianceFinding[] {
  const content = [listing.title, ...listing.bullets, listing.description].join("\n");
  const findings: ComplianceFinding[] = [];
  for (const rule of complianceRules) {
    if (!rule.channels.includes(listing.channel) || !rule.pattern) continue;
    if (!rule.categories.includes("*") && !rule.categories.some((category) => truth.category.includes(category))) continue;
    const expression = new RegExp(rule.pattern, "i");
    const match = content.match(expression);
    if (!match) continue;
    findings.push({
      id: `finding_${rule.id}_${listing.channel}`,
      ruleId: rule.id,
      sourceId: rule.sourceId,
      severity: rule.severity,
      status: "open",
      target: `${listing.channel} listing`,
      excerpt: match[0],
      explanation: rule.message,
      suggestion: rule.suggestion,
      version: 1,
    });
  }
  for (const claim of listing.claims.filter((item) => item.needsEvidence)) {
    findings.push({ id: `finding_evidence_${listing.channel}_${findings.length}`, ruleId: "fact-evidence", sourceId: "ftc-truth", severity: "medium", status: "open", target: `${listing.channel} claim`, excerpt: claim.text, explanation: "该客观宣称尚未关联已确认事实或证明材料。", suggestion: "上传证明材料并确认事实，或删除该宣称。", version: 1 });
  }
  return findings;
}

export function sourceCoverage(findings: ComplianceFinding[]) {
  return findings.map((finding) => ({ finding, source: ruleSources.find((source) => source.id === finding.sourceId) })).filter((item) => item.source);
}

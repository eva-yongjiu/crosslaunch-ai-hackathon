import type { Channel, ChannelListing, ComplianceFinding, ComplianceLocation, CoverageStatus, DetailModule, ProductTruthProfile } from "./domain";
import { channelProfiles, complianceRules, ruleSources } from "./rules";

const categoryPacks = ["beauty", "cosmetics", "personal-care", "food", "supplement", "health", "children", "appliance", "electronics", "consumer-goods", "美妆", "食品", "保健", "儿童", "电器", "电子"];

const factCoverageChecks = [
  { id: "performance-claim", pattern: /\b(insulated?|insulation|temperature|keeps?\s+(?:drinks?|beverages?)\s+(?:cool|warm)|cool|warm)\b/i, evidenceTerms: ["insulat", "temperature", "thermal", "保温", "温度"], suggestion: "关联保温类型、测试时长等已确认事实，或删除温度保持承诺。", suggestionZh: "关联保温类型、测试时长等已确认事实，或删除温度保持承诺。" },
  { id: "sustainability-claim", pattern: /\b(reusable|eco[- ]friendly|sustainable|single[- ]use\s+plastic|reduce\s+(?:plastic|waste))\b/i, evidenceTerms: ["reus", "eco", "sustain", "环保", "重复使用"], suggestion: "上传或确认可支持该环保/重复使用表达的事实，再保留该卖点。", suggestionZh: "上传或确认可支持该环保/重复使用表达的事实，再保留该卖点。" },
  { id: "durability-claim", pattern: /\b(durable|robust|rugged|withstand\s+(?:daily\s+)?wear|long[- ]lasting)\b/i, evidenceTerms: ["durab", "robust", "rugged", "strength", "耐用", "坚固"], suggestion: "关联材质或耐用性测试证据，或改成可从图片确认的结构描述。", suggestionZh: "关联材质或耐用性测试证据，或改成可从图片确认的结构描述。" },
  { id: "fit-and-leak-claim", pattern: /\b(cup\s+holders?|spill[- ]proof|leak[- ]proof|leak[- ]resistant|prevents?\s+spills?|ergonomic|portable)\b/i, evidenceTerms: ["cup holder", "spill", "leak", "seal", "ergonomic", "portable", "杯架", "防漏", "人体工学", "便携"], suggestion: "仅在商品事实或测试材料明确支持时保留适配、防漏或人体工学表达。", suggestionZh: "仅在商品事实或测试材料明确支持时保留适配、防漏或人体工学表达。" },
];

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
  const verifiedText = truth.attributes.filter((fact) => fact.status === "verified").map((fact) => `${fact.name} ${fact.value} ${fact.nameZh ?? ""} ${fact.valueZh ?? ""}`.toLowerCase()).join(" ");
  for (const check of factCoverageChecks) {
    if (check.evidenceTerms.some((term) => verifiedText.includes(term.toLowerCase()))) continue;
    for (const segment of segments) {
      const match = segment.text.match(check.pattern);
      if (!match) continue;
      const duplicate = findings.some((finding) => finding.location?.kind === segment.location.kind && finding.location?.field === segment.location.field && finding.location?.index === segment.location.index && finding.excerpt.toLowerCase() === match[0].toLowerCase());
      if (duplicate) continue;
      findings.push({
        id: `finding_fact_coverage_${listing.channel}_${check.id}_${segment.location.field}_${segment.location.index ?? 0}`,
        ruleId: "fact-evidence",
        sourceId: "ftc-truth",
        severity: "medium",
        status: "open",
        target: `${listing.channel} · ${segment.label}`,
        excerpt: match[0],
        excerptZh: match[0],
        explanation: "This objective product claim is not supported by a verified fact in the current product truth profile.",
        explanationZh: "这条客观商品宣称没有得到当前商品事实档案中的已确认事实支持。",
        suggestion: check.suggestion,
        suggestionZh: check.suggestionZh,
        location: segment.location,
        version: 1,
      });
    }
  }
  return findings;
}

export function scanDetail(channel: Channel, modules: DetailModule[], truth: ProductTruthProfile): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const segments = modules.flatMap((module, index) => [
    { text: module.title, location: { kind: "detail", channel, field: "detailTitle", index } satisfies ComplianceLocation, label: `详情页模块 ${index + 1} 标题` },
    { text: module.body, location: { kind: "detail", channel, field: "detailBody", index } satisfies ComplianceLocation, label: `详情页模块 ${index + 1} 正文` },
  ]);
  const verifiedText = truth.attributes.filter((fact) => fact.status === "verified").map((fact) => `${fact.name} ${fact.value} ${fact.nameZh ?? ""} ${fact.valueZh ?? ""}`.toLowerCase()).join(" ");
  for (const check of factCoverageChecks) {
    if (check.evidenceTerms.some((term) => verifiedText.includes(term.toLowerCase()))) continue;
    for (const segment of segments) {
      const match = segment.text.match(check.pattern);
      if (!match) continue;
      findings.push({
        id: `finding_detail_fact_coverage_${channel}_${check.id}_${segment.location.field}_${segment.location.index ?? 0}`,
        ruleId: "fact-evidence",
        sourceId: "ftc-truth",
        severity: "medium",
        status: "open",
        target: `${channel} · ${segment.label}`,
        excerpt: match[0],
        excerptZh: match[0],
        explanation: "This objective detail-page claim is not supported by a verified fact in the current product truth profile.",
        explanationZh: "这条详情页客观宣称没有得到当前商品事实档案中的已确认事实支持。",
        suggestion: check.suggestion,
        suggestionZh: check.suggestionZh,
        location: segment.location,
        version: 1,
      });
    }
  }
  return findings;
}

export function sourceCoverage(findings: ComplianceFinding[]) {
  return findings.map((finding) => ({ finding, source: ruleSources.find((source) => source.id === finding.sourceId) })).filter((item) => item.source);
}

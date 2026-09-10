import type { AssetVersion, ProductFact, ProductTruthProfile } from "./domain";

export const assetKinds: AssetVersion["kind"][] = ["main", "scene", "model", "comparison", "size"];

export const assetPurpose: Record<AssetVersion["kind"], { name: string; nameZh: string; description: string }> = {
  main: { name: "Main product image", nameZh: "白底主图", description: "准确呈现实际销售商品，适合渠道主图。" },
  scene: { name: "Lifestyle scene", nameZh: "场景图", description: "展示真实使用情境，商品主体必须保持一致。" },
  model: { name: "Model lifestyle image", nameZh: "模特图", description: "展示目标用户使用商品，非随售道具不得冒充配件。" },
  comparison: { name: "Feature comparison", nameZh: "对比 / 特征图", description: "只用已确认事实做功能或结构特征对比。" },
  size: { name: "Size & specification image", nameZh: "尺寸 / 规格图", description: "只展示已确认的尺寸、容量或重量数据。" },
};

const dimensionPattern = /(dimension|height|width|depth|length|diameter|capacity|volume|weight|size|尺寸|高度|宽度|深度|长度|直径|容量|体积|重量)/i;

export function verifiedFacts(truth: ProductTruthProfile) {
  return truth.attributes.filter((fact) => fact.status === "verified");
}

export function dimensionFacts(truth: ProductTruthProfile): ProductFact[] {
  return verifiedFacts(truth).filter((fact) => dimensionPattern.test(`${fact.name} ${fact.nameZh ?? ""}`));
}

export function assetRequirement(kind: AssetVersion["kind"], truth: ProductTruthProfile) {
  const facts = verifiedFacts(truth);
  if (kind === "size") {
    const dimensions = dimensionFacts(truth);
    return dimensions.length
      ? { ready: true, factIds: dimensions.map((fact) => fact.id), reasonZh: "已具备可展示的尺寸/容量/重量事实。", reason: "Verified dimensional facts are available." }
      : { ready: false, factIds: [], reasonZh: "缺少已确认的尺寸、容量或重量，不能生成真实尺寸图。", reason: "Verified dimensions, capacity or weight are required for a truthful size image." };
  }
  if (kind === "comparison") {
    return facts.length >= 2
      ? { ready: true, factIds: facts.slice(0, 4).map((fact) => fact.id), reasonZh: "将使用已确认事实生成特征对比图。", reason: "At least two verified facts are available for a feature comparison." }
      : { ready: false, factIds: [], reasonZh: "至少确认两条商品事实，才能生成特征对比图。", reason: "At least two verified product facts are required for a feature comparison." };
  }
  return { ready: true, factIds: facts.map((fact) => fact.id), reasonZh: "商品主体可由原图锁定。", reason: "The product identity can be anchored to the source image." };
}

export function assetKindForModule(moduleType: string): AssetVersion["kind"] | undefined {
  if (moduleType === "hero") return "main";
  if (moduleType === "scenario" || moduleType === "steps") return "scene";
  if (moduleType === "comparison" || moduleType === "benefits") return "comparison";
  if (moduleType === "specs") return "size";
  if (moduleType === "reason") return "model";
  return undefined;
}

import type { ProductTruthProfile } from "../../lib/domain";
import { StageHeading } from "./shared";

export function TruthPanel({ truth, onChange, onConfirm, busy }: { truth: ProductTruthProfile; onChange: (truth: ProductTruthProfile) => void; onConfirm: () => void; busy: boolean }) {
  const setStatus = (id: string, status: "verified" | "pending" | "missing") => onChange({ ...truth, attributes: truth.attributes.map((fact) => fact.id === id ? { ...fact, status } : fact) });
  return <div className="stage-wrap">
    <StageHeading eyebrow="PRODUCT TRUTH LAYER" title="先确认商品事实，再允许 AI 创作" description="每条事实都保留证据、置信度和审核状态；待确认参数不会进入图片文案、Listing 或详情页。" badge={truth.confirmedAt ? "已确认" : "强制审核点 1/2"} />
    <div className="truth-summary">
      <div className="truth-product"><span>AI 类目判断</span><strong>{truth.category}</strong><small>置信度 {Math.round(truth.categoryConfidence * 100)}%</small></div>
      <div><b>{truth.attributes.filter((f) => f.status === "verified").length}</b><span>已确认事实</span></div>
      <div><b>{truth.attributes.filter((f) => f.status === "pending").length}</b><span>待确认事实</span></div>
      <div><b>{truth.missingInformation.length}</b><span>缺失材料</span></div>
    </div>
    <div className="truth-layout">
      <section className="fact-table">
        <header><span>商品事实</span><span>值</span><span>证据 / 置信度</span><span>审核</span></header>
        {truth.attributes.map((fact) => <div className={`fact-row ${fact.status}`} key={fact.id}>
          <strong>{fact.name}</strong><input value={fact.value} onChange={(event) => onChange({ ...truth, attributes: truth.attributes.map((item) => item.id === fact.id ? { ...item, value: event.target.value } : item) })} />
          <span>{fact.evidenceIds.length ? `${fact.evidenceIds.length} 项证据 · ${Math.round(fact.confidence * 100)}%` : "缺少证据"}</span>
          <select value={fact.status} onChange={(event) => setStatus(fact.id, event.target.value as "verified" | "pending" | "missing")}><option value="verified">确认</option><option value="pending">待确认</option><option value="missing">缺失</option></select>
        </div>)}
      </section>
      <aside className="truth-guardrails">
        <div><span className="panel-kicker">IDENTITY LOCKS</span><h3>商品主体锁定</h3>{truth.identityLocks.map((item) => <p key={item}>✓ {item}</p>)}</div>
        <div className="danger-box"><span className="panel-kicker">DO NOT INVENT</span><h3>禁止 AI 编造</h3>{truth.prohibitedInventions.map((item) => <p key={item}>— {item}</p>)}</div>
        <div><span className="panel-kicker">EVIDENCE</span><h3>证据链</h3>{truth.evidence.map((item) => <p key={item.id}><b>{item.type}</b>{item.label} · {Math.round(item.confidence * 100)}%</p>)}</div>
      </aside>
    </div>
    <div className="bottom-actions"><p><strong>{truth.confirmedAt ? "事实档案已确认" : "确认后将锁定生成边界"}</strong><span>后续修改事实会标记受影响的内容版本</span></p><button className="primary-button compact" disabled={busy || Boolean(truth.confirmedAt)} onClick={onConfirm}>{busy ? "正在保存..." : truth.confirmedAt ? "已确认" : "确认事实并继续 →"}</button></div>
  </div>;
}

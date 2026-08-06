import type { Channel, ComplianceFinding, CoverageStatus, RuleSource } from "../../lib/domain";
import { CoverageBadge, StageHeading } from "./shared";

export function CompliancePanel({ findings, sources, coverage, channel, onFix, busy }: { findings: ComplianceFinding[]; sources: RuleSource[]; coverage: CoverageStatus; channel: Channel; onFix: () => void; busy: boolean }) {
  const open = findings.filter((item) => item.status === "open");
  const score = Math.max(0, 100 - open.reduce((sum, item) => sum + (item.severity === "high" ? 18 : item.severity === "medium" ? 9 : 3), 0));
  return <div className="stage-wrap">
    <StageHeading eyebrow="EVIDENCE-BASED COMPLIANCE" title="每一个风险，都必须给出依据" description="规则检测、事实核验与多模态推理共同工作；非完整覆盖品类不会显示“完全合规”。" badge="强制审核点 2/2" />
    <div className="compliance-overview">
      <div className="v2-score"><strong>{score}</strong><span>风险筛查分</span></div>
      <div><span>规则覆盖</span><CoverageBadge value={coverage} /><small>{channel} · United States</small></div>
      <div><span>待处理</span><strong>{open.length}</strong><small>{open.filter((f) => f.severity === "high").length} 高风险 · {open.filter((f) => f.severity === "medium").length} 中风险</small></div>
      <div><span>引用来源</span><strong>{new Set(findings.map((f) => f.sourceId)).size}</strong><small>官方规则快照，可追溯版本</small></div>
    </div>
    <div className="evidence-layout"><section className="finding-list">{findings.length ? findings.map((finding) => { const source = sources.find((item) => item.id === finding.sourceId); return <article className={`${finding.severity} ${finding.status}`} key={finding.id}><div className="finding-marker">{finding.status === "fixed" || finding.status === "accepted" ? "✓" : "!"}</div><div><header><span>{finding.severity.toUpperCase()} · {finding.target}</span><b>{finding.status === "open" ? "待处理" : finding.status === "fixed" ? "已修正并复检" : "已通过"}</b></header><h3>{finding.excerpt}</h3><p>{finding.explanation}</p><div className="fix-suggestion"><b>建议</b>{finding.suggestion}</div>{source && <a href={source.url} target="_blank" rel="noreferrer"><strong>{source.authority}</strong>{source.title} · {source.version} ↗</a>}</div></article> }) : <div className="empty-state"><strong>当前没有风险发现</strong><p>请先运行合规扫描。</p></div>}</section>
      <aside className="source-ledger"><span className="panel-kicker">SOURCE LEDGER</span><h3>规则来源账本</h3>{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><div><b>{source.authority}</b><small>{source.version}</small></div><strong>{source.title}</strong><p>{source.excerpt}</p><code>{source.contentHash}</code></a>)}<p className="legal-note">本系统提供风险筛查与修改辅助，不替代平台最终审核、检测认证或正式法律意见。</p></aside>
    </div>
    <div className="bottom-actions"><p><strong>{open.length ? `${open.length} 项风险等待确认` : "复检完成"}</strong><span>{coverage === "full" ? "规则包完整覆盖当前品类和渠道" : "当前为部分覆盖，导出报告将保留人工审核提示"}</span></p><button className="primary-button compact" disabled={busy || !open.length} onClick={onFix}>{busy ? "正在修正并复检..." : open.length ? "应用建议并强制复检 →" : "已完成复检"}</button></div>
  </div>;
}

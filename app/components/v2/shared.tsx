import type { CoverageStatus, TaskStatus } from "../../lib/domain";

export function ProductBottle({ compact = false }: { compact?: boolean }) {
  return <div className={`product-bottle ${compact ? "compact" : ""}`}><div className="bottle-cap"><i /><i /><i /></div><div className="bottle-body"><span>FRESH<br /><b>FLOW</b></span><em>16 OZ</em></div><div className="bottle-base"><i /><i /></div></div>;
}

export function StageHeading({ eyebrow, title, description, badge }: { eyebrow: string; title: string; description: string; badge?: string }) {
  return <div className="stage-heading v2-heading"><div><span>{eyebrow}</span>{badge && <b>{badge}</b>}</div><h1>{title}</h1><p>{description}</p></div>;
}

export function CoverageBadge({ value }: { value: CoverageStatus }) {
  const labels = { full: "完整覆盖", partial: "部分覆盖", unsupported: "未覆盖" };
  return <span className={`coverage-badge ${value}`}>{labels[value]}</span>;
}

export function StatusDot({ value }: { value: TaskStatus }) {
  const labels = { queued: "等待", running: "运行中", needs_review: "待确认", failed: "失败", completed: "完成" };
  return <span className={`task-status ${value}`}><i />{labels[value]}</span>;
}

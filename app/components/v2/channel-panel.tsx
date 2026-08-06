import type { Channel, ChannelListing, DetailModule, ProductTruthProfile } from "../../lib/domain";
import { CoverageBadge, StageHeading } from "./shared";

const names: Record<Channel, string> = { "amazon-us": "Amazon US", "tiktok-us": "TikTok Shop US", "shopify-us": "Shopify US" };

export function ChannelPanel({ channel, listing, modules, truth, coverage, onChannel, onListing, onModules, onScan }: { channel: Channel; listing: ChannelListing; modules: DetailModule[]; truth: ProductTruthProfile; coverage: "full" | "partial" | "unsupported"; onChannel: (channel: Channel) => void; onListing: (listing: ChannelListing) => void; onModules: (modules: DetailModule[]) => void; onScan: () => void }) {
  const factName = (id: string) => truth.attributes.find((fact) => fact.id === id)?.name || id;
  const move = (index: number, direction: -1 | 1) => { const next = [...modules]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onModules(next); };
  return <div className="stage-wrap">
    <StageHeading eyebrow="MULTI-CHANNEL CONTENT" title="一个事实底座，三套渠道表达" description="三渠道共享确认事实，但标题结构、搜索策略、详情模块与合规规则分别生成。" />
    <div className="channel-tabs">{(Object.keys(names) as Channel[]).map((id) => <button key={id} className={channel === id ? "active" : ""} onClick={() => onChannel(id)}>{names[id]}<CoverageBadge value={id === channel ? coverage : "partial"} /></button>)}</div>
    <div className="channel-layout">
      <section className="content-editor">
        <div className="content-head"><div><span>{names[channel]}</span><b>{listing.strategy.toUpperCase()} 版本</b></div><strong>内容得分 {listing.score}</strong></div>
        <div className="editor-label">标题 <em>{listing.title.length} 字符</em></div><textarea aria-label="Listing 标题" value={listing.title} onChange={(event) => onListing({ ...listing, title: event.target.value })} />
        <div className="editor-label">核心卖点</div>{listing.bullets.map((bullet, index) => <div className="mapped-bullet" key={index}><span>{index + 1}</span><textarea aria-label={`核心卖点 ${index + 1}`} value={bullet} onChange={(event) => onListing({ ...listing, bullets: listing.bullets.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></div>)}
        <div className="editor-label">商品描述</div><textarea aria-label="商品描述" className="description-editor" value={listing.description} onChange={(event) => onListing({ ...listing, description: event.target.value })} />
      </section>
      <aside className="claim-map">
        <span className="panel-kicker">CLAIM → FACT MAP</span><h3>宣称证据映射</h3>
        {listing.claims.map((claim, index) => <article className={claim.needsEvidence ? "needs-evidence" : ""} key={`${claim.text}-${index}`}><div><b>{claim.needsEvidence ? "需要证明" : "已关联事实"}</b><small>{claim.intent}</small></div><p>“{claim.text}”</p><span>{claim.factIds.length ? claim.factIds.map(factName).join(" · ") : "无关联事实"}</span></article>)}
        <div className="keyword-cloud">{listing.claims.flatMap((item) => item.keywords).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
      </aside>
    </div>
    <section className="module-builder"><header><div><span className="panel-kicker">DETAIL MODULES</span><h3>购买决策路径</h3></div><small>支持排序、重写和事实追溯</small></header><div>{modules.map((module, index) => <article key={module.id}><div className="module-order"><button onClick={() => move(index, -1)}>↑</button><b>{String(index + 1).padStart(2, "0")}</b><button onClick={() => move(index, 1)}>↓</button></div><div><span>{module.type}</span><input value={module.title} onChange={(event) => onModules(modules.map((item) => item.id === module.id ? { ...item, title: event.target.value } : item))} /><textarea value={module.body} onChange={(event) => onModules(modules.map((item) => item.id === module.id ? { ...item, body: event.target.value } : item))} /><small>事实：{module.factIds.length ? module.factIds.map(factName).join(" · ") : "场景表达，无客观宣称"}</small></div></article>)}</div></section>
    <div className="bottom-actions"><p><strong>三渠道内容已生成</strong><span>下一步将执行确定性规则、事实一致性与多模态风险筛查</span></p><button className="primary-button compact" onClick={onScan}>运行合规证据链 →</button></div>
  </div>;
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useState } from "react";
import type { Channel, ProjectWorkspace } from "../lib/domain";
import { cloneFixture } from "../lib/fixtures";
import { loadWorkspace, runWorkflow, saveWorkspace } from "../lib/api-client";

type Space = "home" | "workbench" | "create" | "publish";
type CreateView = "assets" | "listing" | "page";
const channelNames: Record<Channel, string> = { "amazon-us": "Amazon", "tiktok-us": "TikTok Shop", "shopify-us": "Shopify" };
const assetNames = { main: "白底主图", scene: "场景图", model: "模特图", comparison: "对比图", size: "尺寸图" };

export function ExperienceStudio() {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(() => cloneFixture());
  const [space, setSpace] = useState<Space>("home");
  const [channel, setChannel] = useState<Channel>("amazon-us");
  const [createView, setCreateView] = useState<CreateView>("assets");
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState("fixture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadWorkspace().then((result) => { setWorkspace(result.workspace); setStorage(result.storage); }); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [space]);
  const execute = async (action: "confirm_truth" | "generate" | "scan" | "apply_fixes", next?: Space) => {
    setBusy(true);
    try { const result = await runWorkflow(workspace.project.id, action, workspace); setWorkspace(result.workspace); setStorage(result.storage); if (next) setSpace(next); }
    finally { setBusy(false); }
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(URL.createObjectURL(file)); };
  const save = async () => { setBusy(true); await saveWorkspace(workspace, "演示版本保存"); setSaved(true); setBusy(false); setTimeout(() => setSaved(false), 1600); };
  const listing = workspace.listings.find((item) => item.channel === channel) ?? workspace.listings[0];
  const openFindings = workspace.findings.filter((item) => item.status === "open");

  return <main className="experience-shell">
    <header className="experience-header">
      <button className="experience-brand" onClick={() => setSpace("home")}><span>C</span><strong>上新无界<small>CROSSLAUNCH AI</small></strong></button>
      <nav aria-label="主导航">{(["home", "workbench", "create", "publish"] as Space[]).map((item, index) => <button key={item} className={space === item ? "active" : ""} onClick={() => setSpace(item)}><i>{index + 1}</i>{["项目", "商品", "创作", "发布"][index]}</button>)}</nav>
      <div className="experience-head-actions"><span className={`live-state ${storage}`}>{storage === "d1" ? "已保存" : "演示模式"}</span><button onClick={save} disabled={busy}>{saved ? "已保存 ✓" : "保存"}</button><b>V3</b></div>
    </header>
    {space === "home" && <ProjectHome workspace={workspace} onContinue={() => setSpace("workbench")} />}
    {space === "workbench" && <Workbench workspace={workspace} imageUrl={imageUrl} onUpload={upload} busy={busy} onContinue={() => execute("confirm_truth", "create")} />}
    {space === "create" && <CreationCanvas workspace={workspace} channel={channel} view={createView} imageUrl={imageUrl} listing={listing} busy={busy} onChannel={setChannel} onView={setCreateView} onWorkspace={setWorkspace} onGenerate={() => execute("generate")} onPublish={() => setSpace("publish")} />}
    {space === "publish" && <PublishCenter workspace={workspace} openFindings={openFindings} busy={busy} onScan={() => execute("scan")} onFix={() => execute("apply_fixes")} />}
  </main>;
}

function ProjectHome({ workspace, onContinue }: { workspace: ProjectWorkspace; onContinue: () => void }) {
  return <section className="home-space">
    <div className="home-hero"><div className="hero-copy"><span className="eyebrow">AI 跨境商品上新工作台</span><h1>从一张商品图，<br />到三个市场的完整上新。</h1><p>先确认事实，再生成图片与文案，最后用可追溯规则完成合规检查。</p><div className="hero-actions"><button className="main-action" onClick={onContinue}>继续当前项目 <span>→</span></button><button className="quiet-action">＋ 新建商品</button></div><div className="hero-proof"><span><b>3</b>首发渠道</span><span><b>5</b>类商品图</span><span><b>2</b>个人工门禁</span></div></div><div className="hero-product"><div className="product-orbit"><span>AMAZON</span><span>TIKTOK</span><span>SHOPIFY</span><ProductVisual /></div><div className="ai-note"><i>AI</i><p><b>商品事实已识别</b>5 条事实 · 3 项证据</p><strong>94%</strong></div></div></div>
    <div className="recent-block"><div className="section-title"><div><span>RECENT PROJECTS</span><h2>最近项目</h2></div><button>查看全部</button></div><div className="project-row"><button className="project-tile current" onClick={onContinue}><div className="tile-visual lime"><ProductVisual compact /></div><div><span className="project-state review">待确认事实</span><h3>{workspace.project.name}</h3><p>Amazon · TikTok Shop · Shopify</p><div className="tile-progress"><i style={{ width: "42%" }} /></div></div><b>继续 →</b></button><article className="project-tile muted"><div className="tile-visual sand">SKIN</div><div><span className="project-state done">已发布</span><h3>维C精华液美国站上新</h3><p>Amazon · Shopify</p></div><b>92</b></article><article className="project-tile muted"><div className="tile-visual blue">AIR</div><div><span className="project-state draft">草稿</span><h3>桌面净化器内容包</h3><p>TikTok Shop · Shopify</p></div><b>＋</b></article></div></div>
  </section>;
}

function ProductVisual({ compact = false }: { compact?: boolean }) {
  return <div className={`fresh-product ${compact ? "compact" : ""}`}><div className="fresh-cap"><i /><i /><i /></div><div className="fresh-cup"><span>FRESH<br /><b>FLOW</b></span><em>16 OZ</em></div><div className="fresh-base"><i /><i /><b /></div></div>;
}

function Workbench({ workspace, imageUrl, onUpload, busy, onContinue }: { workspace: ProjectWorkspace; imageUrl: string | null; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; busy: boolean; onContinue: () => void }) {
  const verified = workspace.truth.attributes.filter((item) => item.status === "verified");
  const pending = workspace.truth.attributes.filter((item) => item.status !== "verified");
  return <section className="focused-space"><SpaceIntro number="01" label="PRODUCT TRUTH" title="先把商品看懂，再让 AI 创作。" text="已确认的事实会成为后续所有图片和文案的边界。" />
    <div className="workbench-grid"><label className="product-stage"><input type="file" accept="image/*" onChange={onUpload} />{imageUrl ? <img src={imageUrl} alt="商品原图" /> : <ProductVisual />}<span className="stage-chip">原始商品图</span><button>更换图片</button></label>
      <section className="truth-editor"><header><div><span>AI 商品事实档案</span><h2>{workspace.truth.productName}</h2></div><strong>{Math.round(workspace.truth.categoryConfidence * 100)}%<small>识别置信度</small></strong></header><div className="category-line"><span>{workspace.truth.category}</span><i />主体特征已锁定</div><div className="fact-list">{verified.map((fact) => <div key={fact.id}><i>✓</i><span>{fact.name}</span><strong>{fact.value}</strong><small>{Math.round(fact.confidence * 100)}%</small></div>)}{pending.map((fact) => <div className="pending" key={fact.id}><i>!</i><span>{fact.name}</span><strong>{fact.value}</strong><small>待确认</small></div>)}</div><details><summary>查看证据与生成禁区 <span>＋</span></summary><div className="guardrail-grid"><div><b>证据来源</b>{workspace.truth.evidence.map((item) => <p key={item.id}>{item.label} · {Math.round(item.confidence * 100)}%</p>)}</div><div><b>禁止 AI 编造</b>{workspace.truth.prohibitedInventions.slice(0, 4).map((item) => <p key={item}>{item}</p>)}</div></div></details><footer><p><b>{pending.length} 项需要人工判断</b><span>未确认内容不会进入生成结果</span></p><button className="main-action" onClick={onContinue} disabled={busy}>{busy ? "正在确认…" : "确认事实，开始创作 →"}</button></footer></section></div>
  </section>;
}

function CreationCanvas({ workspace, channel, view, imageUrl, listing, busy, onChannel, onView, onWorkspace, onGenerate, onPublish }: { workspace: ProjectWorkspace; channel: Channel; view: CreateView; imageUrl: string | null; listing: ProjectWorkspace["listings"][number]; busy: boolean; onChannel: (value: Channel) => void; onView: (value: CreateView) => void; onWorkspace: (value: ProjectWorkspace) => void; onGenerate: () => void; onPublish: () => void }) {
  const setListing = (field: "title" | "description", value: string) => onWorkspace({ ...workspace, listings: workspace.listings.map((item) => item.channel === channel ? { ...item, [field]: value } : item) });
  return <section className="canvas-space"><div className="canvas-top"><SpaceIntro number="02" label="CREATIVE CANVAS" title="一处创作，三处精准表达。" text="渠道之间共享商品事实，但不共享模板。" compact /><div className="channel-switch">{workspace.project.channels.map((item) => <button key={item} className={channel === item ? "active" : ""} onClick={() => onChannel(item)}>{channelNames[item]}<small>US</small></button>)}</div></div>
    <div className="canvas-toolbar"><div>{(["assets", "listing", "page"] as CreateView[]).map((item, index) => <button key={item} className={view === item ? "active" : ""} onClick={() => onView(item)}>{["商品图片", "Listing", "详情页"][index]}</button>)}</div><span>所有内容均来自已确认事实</span><button className="regenerate" onClick={onGenerate} disabled={busy}>↻ {busy ? "生成中" : "重新生成"}</button></div>
    <div className="creative-layout"><section className="result-canvas">{view === "assets" && <AssetGallery workspace={workspace} imageUrl={imageUrl} />}{view === "listing" && <ListingEditor channel={channel} listing={listing} setListing={setListing} />}{view === "page" && <PagePreview workspace={workspace} channel={channel} />}</section><aside className="result-rail"><span className="rail-kicker">THIS VERSION</span><h3>{channelNames[channel]} 转化版</h3><div className="result-score"><strong>{listing.score}</strong><span>内容质量</span></div><div className="rail-stat"><span>事实关联</span><b>{listing.claims.filter((item) => !item.needsEvidence).length}/{listing.claims.length}</b></div><div className="rail-stat"><span>图片一致性</span><b>96%</b></div><div className="rail-stat"><span>渠道适配</span><b>已完成</b></div><details><summary>查看 AI 生成依据</summary><p>购买意图：便携、效率、日常使用</p><p>核心事实：USB-C、16 oz、6 叶刀头</p></details><button className="main-action" onClick={onPublish}>进入发布检查 →</button></aside></div>
  </section>;
}

function AssetGallery({ workspace, imageUrl }: { workspace: ProjectWorkspace; imageUrl: string | null }) {
  return <div className="asset-gallery">{workspace.assets.map((asset, index) => <article className={`creative-asset asset-${asset.kind}`} key={asset.id}><div>{imageUrl ? <img src={imageUrl} alt={assetNames[asset.kind]} /> : <ProductVisual compact={index > 1} />}{asset.kind === "scene" && <span className="asset-copy">Blend<br /><b>anywhere.</b></span>}{asset.kind === "comparison" && <span className="compare-lines">6 blades <i /> USB-C <i /> 16 oz</span>}{asset.kind === "size" && <span className="dimension-line">规格以事实档案为准</span>}</div><footer><span><b>{assetNames[asset.kind]}</b>{asset.consistencyScore}% 一致</span><button>•••</button></footer></article>)}</div>;
}

function ListingEditor({ channel, listing, setListing }: { channel: Channel; listing: ProjectWorkspace["listings"][number]; setListing: (field: "title" | "description", value: string) => void }) {
  return <div className="listing-paper"><header><span>{channelNames[channel]} US</span><b>{listing.strategy === "seo" ? "SEO 型" : listing.strategy === "brand" ? "品牌型" : "转化型"}</b><strong>得分 {listing.score}</strong></header><label>商品标题 <small>{listing.title.length} 字符</small><textarea value={listing.title} onChange={(event) => setListing("title", event.target.value)} /></label><div className="bullet-stack"><span>核心卖点</span>{listing.bullets.slice(0, channel === "amazon-us" ? 5 : 3).map((bullet, index) => <div key={bullet}><i>{String(index + 1).padStart(2, "0")}</i><p>{bullet}</p><b>✓ 已关联事实</b></div>)}</div><label>商品描述<textarea value={listing.description} onChange={(event) => setListing("description", event.target.value)} /></label></div>;
}

function PagePreview({ workspace, channel }: { workspace: ProjectWorkspace; channel: Channel }) {
  const modules = workspace.details[channel];
  return <div className="page-browser"><header><i /><i /><i /><span>{channelNames[channel].toLowerCase()}.com/products/freshflow</span></header><section className="page-hero"><div><small>FRESH, WHEREVER YOU GO</small><h2>{modules[0]?.title}</h2><p>{modules[0]?.body}</p><button>SHOP NOW</button></div><ProductVisual /></section><section className="page-benefits">{modules.slice(1, 4).map((module, index) => <div key={module.id}><b>0{index + 1}</b><h3>{module.title}</h3><p>{module.body}</p></div>)}</section></div>;
}

function PublishCenter({ workspace, openFindings, busy, onScan, onFix }: { workspace: ProjectWorkspace; openFindings: ProjectWorkspace["findings"]; busy: boolean; onScan: () => void; onFix: () => void }) {
  const high = openFindings.filter((item) => item.severity === "high").length;
  const score = Math.max(0, 100 - openFindings.reduce((sum, item) => sum + (item.severity === "high" ? 18 : 9), 0));
  return <section className="focused-space publish-space"><SpaceIntro number="03" label="READY TO LAUNCH" title="发布之前，只看真正影响上架的事。" text="规则依据留在系统里，决策留在你手上。" />
    <div className="publish-overview"><div className="launch-score" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong><span>发布准备度</span></div></div><div className="readiness-copy"><span>{openFindings.length ? "需要处理" : "可以发布"}</span><h2>{openFindings.length ? `${openFindings.length} 项风险阻止当前版本导出` : "三个渠道均已通过发布门禁"}</h2><p>{high ? `${high} 项高风险必须修正并重新检测。` : openFindings.length ? "没有高风险，可应用建议后快速复检。" : "交付包将严格对应当前确认版本。"}</p></div><button className="quiet-action" onClick={onScan} disabled={busy}>↻ 重新检测</button></div>
    <div className="publish-grid"><section className="channel-readiness"><header><span>渠道状态</span><small>United States</small></header>{workspace.project.channels.map((item) => <article key={item}><div className={`channel-logo ${item.split("-")[0]}`}>{channelNames[item].slice(0, 1)}</div><div><h3>{channelNames[item]} US</h3><p>{workspace.project.coverage[item] === "full" ? "平台规则完整覆盖" : "部分覆盖 · 建议人工复核"}</p></div><span className={openFindings.length ? "waiting" : "ready"}>{openFindings.length ? "待处理" : "已就绪"}</span></article>)}</section><section className="risk-focus"><header><span>需要你决定</span><small>{openFindings.length} 项</small></header>{openFindings.length ? openFindings.map((finding) => <article key={finding.id}><i className={finding.severity}>!</i><div><span>{finding.severity === "high" ? "高风险" : "需确认"} · {finding.target}</span><h3>{finding.excerpt}</h3><p>{finding.explanation}</p><strong>建议：{finding.fixedText ?? finding.suggestion}</strong><details><summary>查看规则依据</summary><p>{workspace.sources.find((item) => item.id === finding.sourceId)?.title} · {workspace.sources.find((item) => item.id === finding.sourceId)?.version}</p></details></div></article>) : <div className="all-clear"><b>✓</b><h3>所有高风险均已处理</h3><p>当前版本已经完成强制复检。</p></div>}</section></div>
    <div className="launch-bar"><div><span>最终交付包</span><b>图片 · Listing · Shopify 页面 · 合规报告 · 生成记录</b></div>{openFindings.length ? <button className="main-action" onClick={onFix} disabled={busy}>{busy ? "正在修正并复检…" : `应用建议并复检 ${openFindings.length} 项 →`}</button> : <a className="main-action" href={`/api/projects/${workspace.project.id}/export`}>下载三渠道 ZIP →</a>}</div><p className="legal-line">风险筛查不替代平台审核、检测认证或正式法律意见。</p>
  </section>;
}

function SpaceIntro({ number, label, title, text, compact = false }: { number: string; label: string; title: string; text: string; compact?: boolean }) {
  return <div className={`space-intro ${compact ? "compact" : ""}`}><div><i>{number}</i><span>{label}</span></div><h1>{title}</h1><p>{text}</p></div>;
}

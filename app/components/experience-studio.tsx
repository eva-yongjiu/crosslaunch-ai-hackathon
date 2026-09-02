"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useState } from "react";
import type { Channel, LaunchProject, ProductFact, ProjectWorkspace, RuntimeStatus } from "../lib/domain";
import { createProject, getRuntimeStatus, listProjects, loadWorkspace, runWorkflow, saveWorkspace, uploadAsset } from "../lib/api-client";

type Space = "projects" | "truth" | "create" | "compliance";
type CreateView = "assets" | "listing" | "page";
const channelNames: Record<Channel, string> = { "amazon-us": "Amazon US", "tiktok-us": "TikTok Shop US", "shopify-us": "Shopify US" };
const assetNames = { main: "白底主图", scene: "场景图", model: "模特图", comparison: "对比图", size: "尺寸图" };

export function ExperienceStudio() {
  const [projects, setProjects] = useState<LaunchProject[]>([]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [space, setSpace] = useState<Space>("projects");
  const [channel, setChannel] = useState<Channel>("amazon-us");
  const [view, setView] = useState<CreateView>("listing");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshProjects = async (selectFirst = false) => {
    const result = await listProjects();
    setProjects(result.projects);
    if (selectFirst && result.projects[0]) await openProject(result.projects[0].id);
  };
  const openProject = async (id: string) => {
    setBusy(true); setError("");
    try {
      const result = await loadWorkspace(id);
      setWorkspace(result.workspace);
      setChannel(result.workspace.project.channels[0] ?? "amazon-us");
      setSpace("truth");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    Promise.all([getRuntimeStatus(), listProjects()]).then(([status, result]) => {
      setRuntime(status); setProjects(result.projects);
    }).catch((cause) => setError(errorText(cause)));
  }, []);

  const execute = async (action: "analyze" | "confirm_truth" | "generate" | "scan" | "apply_fixes", next?: Space) => {
    if (!workspace) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await runWorkflow(workspace.project.id, action, workspace, action === "generate" ? channel : undefined);
      setWorkspace(result.workspace);
      setProjects((items) => items.map((item) => item.id === result.workspace.project.id ? result.workspace.project : item));
      if (next) setSpace(next);
      setMessage(action === "scan" || action === "apply_fixes" ? "合规检查已执行并保存。" : "操作已执行并保存。" );
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const save = async (reason = "用户保存工作区") => {
    if (!workspace) return;
    setBusy(true); setError("");
    try {
      const result = await saveWorkspace(workspace, reason);
      setWorkspace(result.workspace); setMessage(`已保存为版本 ${result.version}`);
      await refreshProjects();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  return <main className="experience-shell real-app">
    <header className="experience-header">
      <button className="experience-brand" onClick={() => setSpace("projects")}><span>C</span><strong>上新无界<small>CROSSLAUNCH AI</small></strong></button>
      <nav aria-label="主导航">
        {(["projects", "truth", "create", "compliance"] as Space[]).map((item, index) => <button key={item} className={space === item ? "active" : ""} disabled={!workspace && item !== "projects"} onClick={() => setSpace(item)}><i>{index + 1}</i>{["项目", "商品事实", "内容创作", "合规导出"][index]}</button>)}
      </nav>
      <div className="experience-head-actions">
        <span className={`live-state ${runtime?.database === "available" ? "d1" : "fixture"}`}>{runtime?.database === "available" ? (runtime.databaseProvider === "d1" ? "D1 已连接" : "本地数据库已连接") : "存储未连接"}</span>
        <span className={`live-state ${runtime?.modelRouter.configured ? "d1" : "fixture"}`}>{runtime?.modelRouter.configured ? "AI 已连接" : "AI 未配置"}</span>
        {workspace && <button disabled={busy} onClick={() => save()}>{busy ? "处理中…" : "保存"}</button>}
      </div>
    </header>
    {(error || message) && <div className={`system-banner ${error ? "error" : "success"}`}><span>{error || message}</span><button onClick={() => { setError(""); setMessage(""); }}>×</button></div>}
    {space === "projects" && <ProjectsHome projects={projects} busy={busy} onOpen={openProject} onCreated={(next) => { setWorkspace(next); setProjects((items) => [next.project, ...items]); setChannel(next.project.channels[0]); setSpace("truth"); }} onError={setError} />}
    {workspace && space === "truth" && <TruthWorkbench workspace={workspace} setWorkspace={setWorkspace} busy={busy} aiReady={Boolean(runtime?.modelRouter.configured)} onUpload={async (file) => {
      setBusy(true); setError("");
      try {
        const sourceAsset = await uploadAsset(workspace.project.id, file);
        const next = { ...workspace, truth: { ...workspace.truth, sourceAsset, confirmedAt: undefined }, project: { ...workspace.project, currentStep: "input", status: "queued" as const } };
        const saved = await saveWorkspace(next, "上传商品原图");
        setWorkspace(saved.workspace); setMessage("商品原图已写入 R2 并保存。" );
      } catch (cause) { setError(errorText(cause)); }
      finally { setBusy(false); }
    }} onAnalyze={() => execute("analyze")} onConfirm={() => execute("confirm_truth", "create")} onSave={() => save("编辑商品事实")} />}
    {workspace && space === "create" && <CreationStudio workspace={workspace} setWorkspace={setWorkspace} channel={channel} setChannel={setChannel} view={view} setView={setView} busy={busy} aiReady={Boolean(runtime?.modelRouter.configured)} onGenerate={() => execute("generate")} onSave={() => save("编辑渠道内容")} onCompliance={() => setSpace("compliance")} />}
    {workspace && space === "compliance" && <ComplianceCenter workspace={workspace} busy={busy} onScan={() => execute("scan")} onFix={() => execute("apply_fixes")} />}
  </main>;
}

function ProjectsHome({ projects, busy, onOpen, onCreated, onError }: { projects: LaunchProject[]; busy: boolean; onOpen: (id: string) => void; onCreated: (workspace: ProjectWorkspace) => void; onError: (value: string) => void }) {
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const submit = async () => {
    if (!productName.trim()) return onError("请输入真实商品名称。" );
    setCreating(true); onError("");
    try { const result = await createProject({ productName, category, channels: ["amazon-us", "tiktok-us", "shopify-us"] }); onCreated(result.workspace); }
    catch (cause) { onError(errorText(cause)); }
    finally { setCreating(false); }
  };
  return <section className="home-space real-home">
    <div className="home-hero compact-real"><div className="hero-copy"><span className="eyebrow">真实数据工作台</span><h1>从真实商品开始，<br />生成可追溯的跨境内容。</h1><p>项目写入 D1，图片写入 R2。接口失败会直接提示，不再回退为演示数据。</p></div>
      <div className="create-card"><h2>新建商品项目</h2><label>商品名称<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：不锈钢保温杯" /></label><label>商品品类<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="例如：厨房用品（可稍后修改）" /></label><p>首发渠道：Amazon US · TikTok Shop US · Shopify US</p><button className="main-action" disabled={creating || busy} onClick={submit}>{creating ? "正在创建…" : "创建空白项目 →"}</button></div></div>
    <div className="recent-block"><div className="section-title"><div><span>REAL PROJECTS</span><h2>已保存项目</h2></div><b>{projects.length} 个</b></div>
      {projects.length ? <div className="project-row real-projects">{projects.map((project) => <button className="project-tile current" key={project.id} onClick={() => onOpen(project.id)} disabled={busy}><div className="tile-visual neutral">{project.productName.slice(0, 1).toUpperCase()}</div><div><span className={`project-state ${project.status === "completed" ? "done" : "review"}`}>{statusName(project.status)}</span><h3>{project.name}</h3><p>{project.channels.map((item) => channelNames[item]).join(" · ")}</p><small>更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}</small></div><b>打开 →</b></button>)}</div> : <div className="empty-panel"><b>还没有项目</b><p>上方创建的将是空白、可持久化的真实项目。</p></div>}
    </div>
  </section>;
}

function TruthWorkbench({ workspace, setWorkspace, busy, aiReady, onUpload, onAnalyze, onConfirm, onSave }: { workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; busy: boolean; aiReady: boolean; onUpload: (file: File) => void; onAnalyze: () => void; onConfirm: () => void; onSave: () => void }) {
  const updateTruth = (patch: Partial<ProjectWorkspace["truth"]>) => setWorkspace({ ...workspace, truth: { ...workspace.truth, ...patch, confirmedAt: undefined } });
  const updateFact = (id: string, patch: Partial<ProductFact>) => updateTruth({ attributes: workspace.truth.attributes.map((fact) => fact.id === id ? { ...fact, ...patch } : fact) });
  const addFact = () => updateTruth({ attributes: [...workspace.truth.attributes, { id: crypto.randomUUID(), name: "", value: "", status: "pending", confidence: 1, evidenceIds: [] }] });
  const verified = workspace.truth.attributes.filter((fact) => fact.status === "verified").length;
  return <section className="focused-space"><SpaceIntro number="01" label="PRODUCT TRUTH" title="先建立真实商品事实，再让 AI 创作。" text="你可以上传原图让视觉模型识别，也可以手动录入。只有标记为“已确认”的事实能进入生成结果。" />
    <div className="workbench-grid"><label className="product-stage"><input type="file" accept="image/*" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />{workspace.truth.sourceAsset ? <img src={workspace.truth.sourceAsset.url} alt="商品原图" /> : <div className="upload-placeholder"><b>上传真实商品原图</b><span>JPG / PNG / WEBP，最大 8MB</span></div>}<span className="stage-chip">R2 原始素材</span><button type="button">{workspace.truth.sourceAsset ? "更换图片" : "选择图片"}</button></label>
      <section className="truth-editor real-editor"><header><div><span>商品事实档案</span><input className="title-input" value={workspace.truth.productName} onChange={(event) => updateTruth({ productName: event.target.value })} /></div><strong>{verified}<small>已确认事实</small></strong></header>
        <label className="inline-field">商品品类<input value={workspace.truth.category} onChange={(event) => updateTruth({ category: event.target.value })} /></label>
        <div className="truth-actions"><button className="quiet-action" onClick={onAnalyze} disabled={busy || !aiReady || !workspace.truth.sourceAsset}>{aiReady ? "AI 识别原图" : "AI 未配置"}</button><button className="quiet-action" onClick={addFact}>＋ 手动添加事实</button></div>
        <div className="fact-table">{workspace.truth.attributes.map((fact) => <div className="fact-row" key={fact.id}><input aria-label="事实名称" value={fact.name} placeholder="属性，如：材质" onChange={(event) => updateFact(fact.id, { name: event.target.value })} /><input aria-label="事实值" value={fact.value} placeholder="真实值" onChange={(event) => updateFact(fact.id, { value: event.target.value })} /><select value={fact.status} onChange={(event) => updateFact(fact.id, { status: event.target.value as ProductFact["status"] })}><option value="pending">待确认</option><option value="verified">已确认</option><option value="missing">缺失</option></select><button aria-label="删除事实" onClick={() => updateTruth({ attributes: workspace.truth.attributes.filter((item) => item.id !== fact.id) })}>×</button></div>)}{!workspace.truth.attributes.length && <div className="empty-panel"><b>尚无商品事实</b><p>上传图片后调用 AI 识别，或手动添加可证明的事实。</p></div>}</div>
        <footer><p><b>{workspace.truth.confirmedAt ? "档案已确认" : `${verified} 条事实可以用于生成`}</b><span>修改任何事实后都需要重新确认。</span></p><div><button className="quiet-action" disabled={busy} onClick={onSave}>保存草稿</button><button className="main-action" disabled={busy || verified === 0} onClick={onConfirm}>确认事实并进入创作 →</button></div></footer>
      </section></div>
  </section>;
}

function CreationStudio({ workspace, setWorkspace, channel, setChannel, view, setView, busy, aiReady, onGenerate, onSave, onCompliance }: { workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; channel: Channel; setChannel: (value: Channel) => void; view: CreateView; setView: (value: CreateView) => void; busy: boolean; aiReady: boolean; onGenerate: () => void; onSave: () => void; onCompliance: () => void }) {
  const listing = workspace.listings.find((item) => item.channel === channel)!;
  const setListing = (patch: Partial<typeof listing>) => setWorkspace({ ...workspace, listings: workspace.listings.map((item) => item.channel === channel ? { ...item, ...patch } : item) });
  return <section className="canvas-space"><div className="canvas-top"><SpaceIntro number="02" label="CREATIVE CANVAS" title="每个渠道独立生成、独立编辑。" text="当前区域只显示项目中真实存在的内容；空结果不会用模板填充。" compact /><div className="channel-switch">{workspace.project.channels.map((item) => <button key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>{channelNames[item]}</button>)}</div></div>
    <div className="canvas-toolbar"><div>{(["assets", "listing", "page"] as CreateView[]).map((item, index) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{["商品图片", "Listing", "详情页"][index]}</button>)}</div><span>{workspace.truth.confirmedAt ? "事实档案已确认" : "事实档案未确认"}</span><button className="regenerate" disabled={busy || !aiReady || !workspace.truth.confirmedAt} onClick={onGenerate}>{aiReady ? (busy ? "真实模型生成中…" : `生成 ${channelNames[channel]}`) : "配置 Token 后可生成"}</button></div>
    <div className="creative-layout"><section className="result-canvas">{view === "assets" && <AssetGallery workspace={workspace} channel={channel} />}{view === "listing" && <ListingEditor listing={listing} setListing={setListing} />}{view === "page" && <PagePreview workspace={workspace} channel={channel} />}</section>
      <aside className="result-rail"><span className="rail-kicker">CURRENT DATA</span><h3>{channelNames[channel]}</h3><div className="result-score"><strong>{listing.score || "—"}</strong><span>{listing.score ? "模型评分" : "尚未生成"}</span></div><div className="rail-stat"><span>事实关联</span><b>{listing.claims.filter((item) => !item.needsEvidence).length}/{listing.claims.length}</b></div><div className="rail-stat"><span>真实图片</span><b>{workspace.assets.filter((asset) => asset.channel === channel).length}</b></div><button className="quiet-action" onClick={onSave} disabled={busy}>保存修改</button><button className="main-action" onClick={onCompliance}>进入合规检查 →</button></aside></div>
  </section>;
}

function AssetGallery({ workspace, channel }: { workspace: ProjectWorkspace; channel: Channel }) {
  const assets = workspace.assets.filter((asset) => asset.channel === channel);
  if (!assets.length) return <div className="empty-panel large"><b>尚未生成商品图片</b><p>配置 Token Plan API Key 并确认商品事实后，系统会参考商品原图生成五类真实素材。</p></div>;
  return <div className="asset-gallery">{assets.map((asset) => <article className={`creative-asset asset-${asset.kind}`} key={asset.id}><div><img src={asset.url} alt={assetNames[asset.kind]} /></div><footer><span><b>{assetNames[asset.kind]}</b>{asset.complianceStatus === "pending" ? "待复检" : asset.complianceStatus}</span><small>v{asset.version}</small></footer></article>)}</div>;
}

function ListingEditor({ listing, setListing }: { listing: ProjectWorkspace["listings"][number]; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  return <div className="listing-paper"><header><span>{channelNames[listing.channel]}</span><b>{listing.strategy.toUpperCase()}</b><strong>{listing.score ? `得分 ${listing.score}` : "未生成"}</strong></header><label>商品标题 <small>{listing.title.length} 字符</small><textarea value={listing.title} placeholder="AI 生成后显示，也可手动输入真实内容" onChange={(event) => setListing({ title: event.target.value })} /></label><label>核心卖点（每行一条）<textarea value={listing.bullets.join("\n")} placeholder="每行一个卖点" onChange={(event) => setListing({ bullets: event.target.value.split("\n").filter(Boolean) })} /></label><label>商品描述<textarea value={listing.description} placeholder="商品描述" onChange={(event) => setListing({ description: event.target.value })} /></label></div>;
}

function PagePreview({ workspace, channel }: { workspace: ProjectWorkspace; channel: Channel }) {
  const modules = workspace.details[channel] ?? [];
  if (!modules.length) return <div className="empty-panel large"><b>尚未生成详情页模块</b><p>生成后这里会展示该渠道独立的模块结构与真实文案。</p></div>;
  return <div className="page-browser"><header><i /><i /><i /><span>{channelNames[channel]} / product preview</span></header>{modules.map((module) => <section className="real-module" key={module.id}><small>{module.type}</small><h2>{module.title}</h2><p>{module.body}</p></section>)}</div>;
}

function ComplianceCenter({ workspace, busy, onScan, onFix }: { workspace: ProjectWorkspace; busy: boolean; onScan: () => void; onFix: () => void }) {
  const open = workspace.findings.filter((finding) => finding.status === "open");
  const high = open.filter((finding) => finding.severity === "high");
  const failedAssets = workspace.assets.filter((asset) => asset.complianceStatus === "failed");
  const unreviewedAssets = workspace.assets.filter((asset) => asset.complianceStatus !== "passed");
  const canExport = Boolean(workspace.truth.confirmedAt) && workspace.listings.every((listing) => listing.title.trim()) && high.length === 0 && unreviewedAssets.length === 0;
  return <section className="focused-space publish-space"><SpaceIntro number="03" label="COMPLIANCE & EXPORT" title="检测结果必须有依据，导出必须过门禁。" text="规则扫描使用当前保存内容。没有专项规则包的品类只显示部分覆盖，不会声称完全合规。" />
    <div className="publish-overview"><div className="readiness-copy"><span>{open.length ? "需要处理" : "等待检测或已通过"}</span><h2>{open.length ? `${open.length} 项风险` : "当前没有未处理发现"}</h2><p>此功能是风险筛查工具，不替代平台审核、检测认证或法律意见。{failedAssets.length ? ` ${failedAssets.length} 张图片需要重新生成或替换。` : ""}</p></div><button className="main-action" disabled={busy || workspace.listings.some((listing) => !listing.title.trim())} onClick={onScan}>{busy ? "检测中…" : "运行真实规则检测"}</button></div>
    <div className="publish-grid"><section className="channel-readiness"><header><span>规则覆盖</span><small>United States</small></header>{workspace.project.channels.map((item) => <article key={item}><div className="channel-logo">{channelNames[item][0]}</div><div><h3>{channelNames[item]}</h3><p>{coverageName(workspace.project.coverage[item])}</p></div></article>)}</section><section className="risk-focus"><header><span>检测发现</span><small>{open.length} 项</small></header>{open.length ? open.map((finding) => <article key={finding.id}><i className={finding.severity}>!</i><div><span>{finding.severity.toUpperCase()} · {finding.target}</span><h3>{finding.excerpt}</h3><p>{finding.explanation}</p><strong>建议：{finding.suggestion}</strong><p>来源：{workspace.sources.find((source) => source.id === finding.sourceId)?.title || "规则来源缺失"}</p></div></article>) : <div className="empty-panel"><b>暂无风险记录</b><p>请运行检测；空记录不等同于已完成合规审查。</p></div>}</section></div>
    <div className="launch-bar"><div><span>最终交付包</span><b>Listing · 详情页 · 图片文件 · 合规报告 · 生成记录</b></div>{open.length && !failedAssets.length ? <button className="main-action" onClick={onFix} disabled={busy}>删除不支持宣称并复检</button> : canExport ? <a className="main-action" href={`/api/projects/${workspace.project.id}/export`}>下载真实项目 ZIP →</a> : <button className="main-action" disabled>{failedAssets.length ? "请重新生成或替换图片后复检" : "完成事实确认、内容和图片复检后可导出"}</button>}</div>
  </section>;
}

function SpaceIntro({ number, label, title, text, compact = false }: { number: string; label: string; title: string; text: string; compact?: boolean }) {
  return <div className={`space-intro ${compact ? "compact" : ""}`}><div><i>{number}</i><span>{label}</span></div><h1>{title}</h1><p>{text}</p></div>;
}

function errorText(cause: unknown) { return cause instanceof Error ? cause.message : "操作失败。"; }
function statusName(status: LaunchProject["status"]) { return ({ queued: "待开始", running: "进行中", needs_review: "待审核", failed: "失败", completed: "已完成" } as const)[status]; }
function coverageName(status: "full" | "partial" | "unsupported") { return status === "full" ? "已发布规则包完整覆盖" : status === "partial" ? "部分覆盖，需要人工复核" : "暂未覆盖，需要人工审核"; }

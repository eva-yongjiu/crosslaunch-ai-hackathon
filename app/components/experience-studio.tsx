"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useState } from "react";
import type { AssetVersion, Channel, ComplianceFinding, ComplianceLocation, LaunchProject, OutputLanguage, ProductFact, ProjectWorkspace, RuntimeStatus } from "../lib/domain";
import { createProject, getRuntimeStatus, listProjects, loadWorkspace, runWorkflow, saveWorkspace, uploadAsset } from "../lib/api-client";
import { assetKindForModule, assetKinds, assetPurpose, assetRequirement } from "../lib/asset-policy";

type Space = "projects" | "truth" | "create" | "compliance";
type CreateView = "assets" | "listing" | "page";
const channelNames: Record<Channel, string> = { "amazon-us": "Amazon US", "tiktok-us": "TikTok Shop US", "shopify-us": "Shopify US" };

export function ExperienceStudio() {
  const [projects, setProjects] = useState<LaunchProject[]>([]);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [space, setSpace] = useState<Space>("projects");
  const [channel, setChannel] = useState<Channel>("amazon-us");
  const [view, setView] = useState<CreateView>("listing");
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<"analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "optimize_finding" | "optimize_all" | "regenerate_asset" | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const setSavedWorkspace = (next: ProjectWorkspace) => {
    setWorkspace(next);
    setSavedFingerprint(workspaceFingerprint(next));
  };
  const hasUnsavedChanges = Boolean(workspace && workspaceFingerprint(workspace) !== savedFingerprint);
  const aiReady = Boolean(runtime?.modelRouter.configured && !runtimeLoading);
  const changeOutputLanguage = (outputLanguage: OutputLanguage) => {
    if (!workspace || (workspace.outputLanguage ?? "bilingual") === outputLanguage) return;
    setWorkspace({ ...workspace, outputLanguage });
    setMessage(`语言偏好已改为${outputLanguageName(outputLanguage)}；请重新生成内容后应用。`);
  };
  const locateFinding = (finding: ComplianceFinding) => {
    const location = finding.location;
    if (!location) {
      setMessage("这条记录来自旧版检测结果，无法精确定位；请重新运行规则检测生成新的定位信息。");
      return;
    }
    const targetId = complianceTargetId(location);
    setFocusTarget(targetId);
    setChannel(location.channel);
    setSpace("create");
    setView(location.kind === "asset" ? "assets" : "listing");
    setMessage(`已定位到${locationLabel(location)}，可直接修改并保存。`);
  };

  const refreshProjects = async (selectFirst = false) => {
    const result = await listProjects();
    setProjects(result.projects);
    if (selectFirst && result.projects[0]) await openProject(result.projects[0].id);
  };
  const openProject = async (id: string) => {
    setBusy(true); setError("");
    try {
      const result = await loadWorkspace(id);
      setSavedWorkspace(result.workspace);
      setChannel(result.workspace.project.channels[0] ?? "amazon-us");
      setSpace("truth");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let disposed = false;
    const loadRuntime = async () => {
      setRuntimeLoading(true);
      try {
        const status = await getRuntimeStatus();
        if (!disposed) setRuntime(status);
      } catch (cause) {
        if (!disposed) setError(`AI 状态检测失败：${errorText(cause)} 请稍后重试。`);
      } finally {
        if (!disposed) setRuntimeLoading(false);
      }
    };
    const loadProjects = async () => {
      try {
        const result = await listProjects();
        if (!disposed) setProjects(result.projects);
      } catch (cause) {
        if (!disposed) setError(errorText(cause));
      }
    };
    void loadRuntime();
    void loadProjects();
    const refreshRuntimeOnFocus = () => { void loadRuntime(); };
    window.addEventListener("focus", refreshRuntimeOnFocus);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshRuntimeOnFocus);
    };
  }, []);

  const execute = async (action: "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "optimize_finding" | "optimize_all" | "regenerate_asset", next?: Space, assetId?: string, findingId?: string) => {
    if (!workspace) return;
    setBusy(true); setActiveAction(action); setError(""); setMessage("");
    try {
      const result = await runWorkflow(workspace.project.id, action, workspace, action === "generate" ? channel : undefined, assetId, findingId);
      setSavedWorkspace(result.workspace);
      setProjects((items) => items.map((item) => item.id === result.workspace.project.id ? result.workspace.project : item));
      if (next) setSpace(next);
      const remaining = result.workspace.findings.filter((finding) => finding.status === "open").length;
      const exhaustedImages = result.workspace.assets.filter((asset) => asset.complianceStatus === "failed" && asset.retries >= 2).length;
      setMessage(action === "regenerate_asset" ? "单张素材已重新生成，请重新运行合规检查。" : action === "optimize_finding" ? remaining ? `AI 已完成该项优化并复检，但仍有 ${remaining} 项风险${exhaustedImages ? `，${exhaustedImages} 张图片已达到自动重试上限` : ""}。` : "AI 已优化该问题并完成重新检测。" : action === "optimize_all" ? remaining ? `AI 已完成优化并复检，但仍有 ${remaining} 项风险${exhaustedImages ? `，${exhaustedImages} 张图片已达到自动重试上限，请人工替换` : ""}。` : "AI 已优化全部风险并完成重新检测。" : action === "translate" ? "中英双语译稿已生成并保存。" : action === "scan" || action === "apply_fixes" ? "合规检查已执行并保存。" : "操作已执行并保存。" );
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); setActiveAction(null); }
  };

  const save = async (reason = "用户保存工作区") => {
    if (!workspace) return;
    if (!hasUnsavedChanges) {
      setMessage("当前没有新的修改，无需重复保存。");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await saveWorkspace(workspace, reason);
      setSavedWorkspace(result.workspace); setMessage(`已保存为版本 ${result.version}`);
      await refreshProjects();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const replaceAsset = async (assetId: string, file: File) => {
    if (!workspace) return;
    const current = workspace.assets.find((asset) => asset.id === assetId);
    if (!current) return setError("需要替换的图片不存在，可能已被其他操作替换。" );
    setBusy(true); setError(""); setMessage("");
    try {
      const uploaded = await uploadAsset(workspace.project.id, file, current.kind);
      const replacement: AssetVersion = { ...current, id: uploaded.id, url: uploaded.url, version: current.version + 1, consistencyScore: 0, complianceStatus: "pending", replacedFromId: current.id };
      const next: ProjectWorkspace = { ...workspace, assets: workspace.assets.map((asset) => asset.id === current.id ? replacement : asset), findings: workspace.findings.filter((finding) => finding.target !== `${current.channel}/${current.kind} image`), project: { ...workspace.project, currentStep: "compliance", status: "needs_review", updatedAt: new Date().toISOString() } };
      const saved = await saveWorkspace(next, "替换商品图片");
      setSavedWorkspace(saved.workspace); await refreshProjects(); setMessage("图片已替换，请重新运行合规检查。" );
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
        <span className={`live-state ${runtimeLoading ? "fixture" : runtime?.modelRouter.configured ? "d1" : "fixture"}`}>{runtimeLoading ? "AI 状态检测中…" : runtime ? runtime.modelRouter.configured ? "AI 已连接" : "AI 未配置" : "AI 状态未知"}</span>
        {workspace && <button disabled={busy || !hasUnsavedChanges} onClick={() => save()} title={hasUnsavedChanges ? "保存当前修改" : "当前没有新的修改"}>{busy ? "处理中…" : hasUnsavedChanges ? "保存" : "已保存"}</button>}
      </div>
    </header>
    {(error || message) && <div className={`system-banner ${error ? "error" : "success"}`}><span>{error || message}</span><button onClick={() => { setError(""); setMessage(""); }}>×</button></div>}
    {space === "projects" && <ProjectsHome projects={projects} busy={busy} onOpen={openProject} onCreated={(next) => { setSavedWorkspace(next); setProjects((items) => [next.project, ...items]); setChannel(next.project.channels[0]); setSpace("truth"); }} onError={setError} />}
    {workspace && space === "truth" && <TruthWorkbench workspace={workspace} setWorkspace={setWorkspace} busy={busy} aiReady={aiReady} analyzing={activeAction === "analyze"} hasUnsavedChanges={hasUnsavedChanges} outputLanguage={workspace.outputLanguage ?? "bilingual"} onLanguageChange={changeOutputLanguage} onTranslate={() => execute("translate")} onUpload={async (file) => {
      setBusy(true); setError("");
      try {
        const sourceAsset = await uploadAsset(workspace.project.id, file);
        const next = { ...workspace, truth: { ...workspace.truth, sourceAsset, confirmedAt: undefined }, project: { ...workspace.project, currentStep: "input", status: "queued" as const } };
        const saved = await saveWorkspace(next, "上传商品原图");
        setSavedWorkspace(saved.workspace); setMessage("商品原图已写入对象存储并保存。" );
      } catch (cause) { setError(errorText(cause)); }
      finally { setBusy(false); }
    }} onAnalyze={() => execute("analyze")} onConfirm={() => execute("confirm_truth", "create")} onSave={() => save("编辑商品事实")} />}
    {workspace && space === "create" && <CreationStudio workspace={workspace} setWorkspace={setWorkspace} channel={channel} setChannel={setChannel} view={view} setView={setView} busy={busy} aiReady={aiReady} hasUnsavedChanges={hasUnsavedChanges} outputLanguage={workspace.outputLanguage ?? "bilingual"} focusTarget={focusTarget} onLanguageChange={changeOutputLanguage} onTranslate={() => execute("translate")} onGenerate={() => execute("generate")} onRegenerateAsset={(assetId) => execute("regenerate_asset", undefined, assetId)} onReplaceAsset={replaceAsset} onSave={() => save("编辑渠道内容")} onCompliance={() => setSpace("compliance")} />}
    {workspace && space === "compliance" && <ComplianceCenter workspace={workspace} busy={busy} aiReady={aiReady} onScan={() => execute("scan")} onFix={() => execute("apply_fixes")} onOptimizeFinding={(finding) => execute("optimize_finding", undefined, undefined, finding.id)} onOptimizeAll={() => execute("optimize_all")} onLocate={locateFinding} />}
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
      <div className="home-hero compact-real"><div className="hero-copy"><span className="eyebrow">真实数据工作台</span><h1>从真实商品开始，<br />生成可追溯的跨境内容。</h1><p>项目和图片写入持久化存储。接口失败会直接提示，不再回退为演示数据。</p></div>
      <div className="create-card"><h2>新建商品项目</h2><label>商品名称<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：不锈钢保温杯" /></label><label>商品品类<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="例如：厨房用品（可稍后修改）" /></label><p>首发渠道：Amazon US · TikTok Shop US · Shopify US</p><button className="main-action" disabled={creating || busy} onClick={submit}>{creating ? "正在创建…" : "创建空白项目 →"}</button></div></div>
    <div className="recent-block"><div className="section-title"><div><span>REAL PROJECTS</span><h2>已保存项目</h2></div><b>{projects.length} 个</b></div>
      {projects.length ? <div className="project-row real-projects">{projects.map((project) => <button className="project-tile current" key={project.id} onClick={() => onOpen(project.id)} disabled={busy}><div className="tile-visual neutral">{project.productName.slice(0, 1).toUpperCase()}</div><div><span className={`project-state ${project.status === "completed" ? "done" : "review"}`}>{statusName(project.status)}</span><h3>{project.name}</h3><p>{project.channels.map((item) => channelNames[item]).join(" · ")}</p><small>更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}</small></div><b>打开 →</b></button>)}</div> : <div className="empty-panel"><b>还没有项目</b><p>上方创建的将是空白、可持久化的真实项目。</p></div>}
    </div>
  </section>;
}

function TruthWorkbench({ workspace, setWorkspace, busy, aiReady, analyzing, hasUnsavedChanges, outputLanguage, onLanguageChange, onTranslate, onUpload, onAnalyze, onConfirm, onSave }: { workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; busy: boolean; aiReady: boolean; analyzing: boolean; hasUnsavedChanges: boolean; outputLanguage: OutputLanguage; onLanguageChange: (value: OutputLanguage) => void; onTranslate: () => void; onUpload: (file: File) => void; onAnalyze: () => void; onConfirm: () => void; onSave: () => void }) {
  const updateTruth = (patch: Partial<ProjectWorkspace["truth"]>) => setWorkspace({ ...workspace, truth: { ...workspace.truth, ...patch, confirmedAt: undefined } });
  const updateFact = (id: string, patch: Partial<ProductFact>) => updateTruth({ attributes: workspace.truth.attributes.map((fact) => fact.id === id ? { ...fact, ...patch } : fact) });
  const addFact = () => updateTruth({ attributes: [...workspace.truth.attributes, { id: crypto.randomUUID(), name: "", value: "", status: "pending", confidence: 1, evidenceIds: [] }] });
  const verified = workspace.truth.attributes.filter((fact) => fact.status === "verified").length;
  const canConfirm = verified > 0 && !workspace.truth.confirmedAt && !busy;
  return <section className="focused-space"><SpaceIntro number="01" label="PRODUCT TRUTH" title="先建立真实商品事实，再让 AI 创作。" text="你可以上传原图让视觉模型识别，也可以手动录入。只有标记为“已确认”的事实能进入生成结果。" />
      <div className="workbench-grid"><label className="product-stage"><input type="file" accept="image/*" disabled={busy} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />{workspace.truth.sourceAsset ? <ResilientImage src={workspace.truth.sourceAsset.url} alt="商品原图" /> : <div className="upload-placeholder"><b>上传真实商品原图</b><span>JPG / PNG / WEBP，最大 8MB</span></div>}<span className="stage-chip">原始商品素材</span><button type="button">{workspace.truth.sourceAsset ? "更换图片" : "选择图片"}</button></label>
      <section className="truth-editor real-editor"><header><div><span>商品事实档案</span><input className="title-input" value={workspace.truth.productName} onChange={(event) => updateTruth({ productName: event.target.value })} /></div><div className="truth-header-tools"><label>AI 输出<select aria-label="AI输出语言" value={outputLanguage} onChange={(event) => onLanguageChange(event.target.value as OutputLanguage)}><option value="bilingual">中英对照</option><option value="zh-CN">中文优先</option><option value="en-US">English first</option></select></label><strong>{verified}<small>已确认事实</small></strong></div></header>
        <div className="bilingual-category"><label className="inline-field">商品品类（英文）<input value={workspace.truth.category} onChange={(event) => updateTruth({ category: event.target.value })} /></label><label className="inline-field">商品品类（中文）<input aria-label="商品品类（中文）" value={workspace.truth.categoryZh ?? ""} placeholder="AI 识别后显示中文分类" onChange={(event) => updateTruth({ categoryZh: event.target.value })} /></label></div>
        <div className="truth-actions"><button className="quiet-action" onClick={onAnalyze} disabled={busy || !aiReady || !workspace.truth.sourceAsset}>{analyzing ? "正在识别商品事实…" : aiReady ? "AI 识别原图" : "AI 未配置"}</button><button className="quiet-action" onClick={onTranslate} disabled={busy || !aiReady || !translationNeeded(workspace)}>{busy ? "处理中…" : "补齐中文对照"}</button><button className="quiet-action" onClick={addFact} disabled={busy}>＋ 手动添加事实</button></div>
        {(analyzing || workspace.truth.attributes.length > 0) && <div className={`truth-status-row ${analyzing ? "loading" : ""}`} role="status" aria-live="polite"><strong>{analyzing ? "AI 正在分析商品图片" : `已识别 ${workspace.truth.attributes.length} 条候选事实`}</strong><span>{analyzing ? "正在调用视觉模型，请稍候，不要重复点击。" : "请逐条检查事实来源，再将确认项改为“已确认”。"}</span></div>}
        <div className="fact-table">{workspace.truth.attributes.map((fact) => <div className="fact-row" key={fact.id}><div className="fact-copy"><input aria-label="事实名称（英文）" value={fact.name} placeholder="属性，如：Material" onChange={(event) => updateFact(fact.id, { name: event.target.value })} /><input aria-label="事实名称（中文）" value={fact.nameZh ?? ""} placeholder="中文属性名" onChange={(event) => updateFact(fact.id, { nameZh: event.target.value })} /></div><div className="fact-copy"><input aria-label="事实值（英文）" value={fact.value} placeholder="真实值" onChange={(event) => updateFact(fact.id, { value: event.target.value })} /><input aria-label="事实值（中文）" value={fact.valueZh ?? ""} placeholder="中文真实值" onChange={(event) => updateFact(fact.id, { valueZh: event.target.value })} /></div><select aria-label="事实状态" value={fact.status} onChange={(event) => updateFact(fact.id, { status: event.target.value as ProductFact["status"] })}><option value="pending">待确认</option><option value="verified">已确认</option><option value="missing">缺失</option></select><button aria-label="删除事实" onClick={() => updateTruth({ attributes: workspace.truth.attributes.filter((item) => item.id !== fact.id) })}>×</button></div>)}{!workspace.truth.attributes.length && <div className="empty-panel"><b>尚无商品事实</b><p>上传图片后调用 AI 识别，或手动添加可证明的事实。</p></div>}</div>
        <footer><p><b>{workspace.truth.confirmedAt ? "档案已确认" : verified ? `${verified} 条事实已标记确认` : "请先确认至少一条事实"}</b><span>{workspace.truth.confirmedAt ? "已进入创作阶段，可从顶部导航返回查看。" : "下拉选择“已确认”后，才能进入创作；待确认事实不会被用于生成。"}</span><small id="truth-confirm-hint" className={`truth-confirm-hint ${canConfirm ? "ready" : ""}`}>{workspace.truth.confirmedAt ? "事实档案已确认。" : analyzing ? "AI 识别完成后，请先审核候选事实。" : verified ? "可以确认并进入创作。" : "当前按钮不可用：请将至少一条事实改为“已确认”。"}</small></p><div><button className="quiet-action" disabled={busy || !hasUnsavedChanges} onClick={onSave}>{hasUnsavedChanges ? "保存草稿" : "已保存"}</button><button className="main-action" aria-describedby="truth-confirm-hint" disabled={!canConfirm} onClick={onConfirm}>{workspace.truth.confirmedAt ? "事实已确认" : "确认事实并进入创作 →"}</button></div></footer>
      </section></div>
  </section>;
}

function CreationStudio({ workspace, setWorkspace, channel, setChannel, view, setView, busy, aiReady, hasUnsavedChanges, outputLanguage, focusTarget, onLanguageChange, onTranslate, onGenerate, onRegenerateAsset, onReplaceAsset, onSave, onCompliance }: { workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; channel: Channel; setChannel: (value: Channel) => void; view: CreateView; setView: (value: CreateView) => void; busy: boolean; aiReady: boolean; hasUnsavedChanges: boolean; outputLanguage: OutputLanguage; focusTarget: string | null; onLanguageChange: (value: OutputLanguage) => void; onTranslate: () => void; onGenerate: () => void; onRegenerateAsset: (assetId: string) => void; onReplaceAsset: (assetId: string, file: File) => void; onSave: () => void; onCompliance: () => void }) {
  const listing = workspace.listings.find((item) => item.channel === channel)!;
  const channelAssets = workspace.assets.filter((asset) => asset.channel === channel);
  const usableAssetCount = channelAssets.filter((asset) => assetRequirement(asset.kind, workspace.truth).ready && asset.complianceStatus !== "failed" && !(!asset.factIds?.length && (asset.kind === "comparison" || asset.kind === "size"))).length;
  const setListing = (patch: Partial<typeof listing>) => setWorkspace({ ...workspace, listings: workspace.listings.map((item) => item.channel === channel ? { ...item, ...patch } : item) });
  useEffect(() => { if (!focusTarget) return; const element = document.getElementById(focusTarget); if (!(element instanceof HTMLElement)) return; element.scrollIntoView({ behavior: "smooth", block: "center" }); element.focus(); }, [focusTarget, channel, view]);
  return <section className="canvas-space"><div className="canvas-top"><SpaceIntro number="02" label="CREATIVE CANVAS" title="每个渠道独立生成、独立编辑。" text="当前区域只显示项目中真实存在的内容；空结果不会用模板填充。" compact /><div className="channel-switch">{workspace.project.channels.map((item) => <button key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>{channelNames[item]}</button>)}</div></div>
    <div className="canvas-toolbar"><div>{(["assets", "listing", "page"] as CreateView[]).map((item, index) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{["商品图片", "Listing", "详情页"][index]}</button>)}</div><label className="language-control">AI 输出<select aria-label="AI输出语言" value={outputLanguage} onChange={(event) => onLanguageChange(event.target.value as OutputLanguage)}><option value="bilingual">中英对照</option><option value="zh-CN">中文优先</option><option value="en-US">English first</option></select></label><span>{workspace.truth.confirmedAt ? "事实档案已确认" : "事实档案未确认"}</span><button className="secondary-action" disabled={busy || !aiReady || !translationNeeded(workspace)} onClick={onTranslate}>{busy ? "翻译中…" : "补齐中文译稿"}</button><button className="regenerate" disabled={busy || !aiReady || !workspace.truth.confirmedAt} onClick={onGenerate}>{aiReady ? (busy ? "真实模型生成中…" : `重新生成中英内容 · ${channelNames[channel]}`) : "配置 Token 后可生成"}</button></div>
     <div className="creative-layout"><section className="result-canvas">{view === "assets" && <AssetGallery workspace={workspace} channel={channel} busy={busy} aiReady={aiReady} focusTarget={focusTarget} onRegenerate={onRegenerateAsset} onReplace={onReplaceAsset} />}{view === "listing" && <ListingEditor listing={listing} outputLanguage={outputLanguage} setListing={setListing} />}{view === "page" && <PagePreview workspace={workspace} channel={channel} />}</section>
       <aside className="result-rail"><span className="rail-kicker">CURRENT DATA</span><h3>{channelNames[channel]}</h3><div className="result-score"><strong>{listing.score || "—"}</strong><span>{listing.score ? "模型评分" : "尚未生成"}</span></div><div className="rail-stat"><span>事实关联</span><b>{listing.claims.filter((item) => !item.needsEvidence).length}/{listing.claims.length}</b></div><div className="rail-stat"><span>文字风险</span><b>{workspace.findings.filter((finding) => finding.status === "open" && finding.location?.kind === "listing" && finding.location.channel === channel).length || "无"}</b></div><div className="rail-stat"><span>可用图片</span><b>{usableAssetCount}/{assetKinds.length}</b></div><button className="quiet-action" onClick={onSave} disabled={busy || !hasUnsavedChanges}>{hasUnsavedChanges ? "保存修改" : "已保存"}</button><button className="main-action" onClick={onCompliance}>进入合规检查 →</button></aside></div>
  </section>;
}

function ResilientImage({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = () => { setFailed(false); setAttempt((value) => value + 1); };
  if (failed) return <div className="asset-image-fallback" role="status"><strong>图片暂时无法加载</strong><span>可能是网络或对象存储响应中断</span><button type="button" onClick={retry}>重新加载</button></div>;
  const separator = src.includes("?") ? "&" : "?";
  return <img key={`${src}-${attempt}`} src={attempt ? `${src}${separator}retry=${attempt}` : src} alt={alt} onError={() => setFailed(true)} />;
}

function AssetGallery({ workspace, channel, busy, aiReady, focusTarget, onRegenerate, onReplace }: { workspace: ProjectWorkspace; channel: Channel; busy: boolean; aiReady: boolean; focusTarget: string | null; onRegenerate: (assetId: string) => void; onReplace: (assetId: string, file: File) => void }) {
  const assets = workspace.assets.filter((asset) => asset.channel === channel);
  const byKind = new Map(assets.map((asset) => [asset.kind, asset]));
  return <div className="asset-gallery">{assetKinds.map((kind) => {
    const asset = byKind.get(kind);
    const purpose = assetPurpose[kind];
    const requirement = assetRequirement(kind, workspace.truth);
    if (!asset) return <article className="creative-asset asset-missing" key={kind}><div className="asset-empty-visual"><strong>尚未生成</strong><span>{requirement.ready ? "确认事实后可生成" : "需要补充事实"}</span></div><footer><div><b>{purpose.nameZh}</b><span>{requirement.reasonZh}</span><p>{purpose.description}</p></div></footer></article>;
    const blocked = !requirement.ready;
    const legacyRoleReview = !asset.factIds?.length && (kind === "comparison" || kind === "size");
    const status = blocked ? "不可用" : legacyRoleReview ? "需重新检测" : assetStatusName(asset.complianceStatus);
    return <article id={`asset-${asset.id}`} tabIndex={-1} className={`creative-asset asset-${asset.kind} ${blocked ? "asset-blocked" : ""} ${legacyRoleReview ? "asset-needs-review" : ""} ${focusTarget === `asset-${asset.id}` ? "focus-target" : ""}`} key={asset.id}><div><ResilientImage src={asset.url} alt={purpose.nameZh} />{blocked && <span className="asset-overlay">缺少事实 · 不可用于导出</span>}{legacyRoleReview && <span className="asset-overlay asset-overlay-warning">新规则需复检用途</span>}</div><footer><div className="asset-copy-meta"><b>{purpose.nameZh}</b><span className={blocked ? "asset-status blocked" : legacyRoleReview ? "asset-status pending" : `asset-status ${asset.complianceStatus}`}>{status}</span><p>{blocked ? requirement.reasonZh : legacyRoleReview ? "该素材由旧版本生成，重新检测后才能确认它真的符合用途。" : purpose.description}</p><small>{asset.factIds?.length ?? requirement.factIds.length} 条事实依据 · {blocked ? "补充事实后复检" : legacyRoleReview ? "等待用途复检" : `一致性 ${Math.round(asset.consistencyScore * 100)}%`}</small></div><div className="asset-actions"><small>v{asset.version}</small><button type="button" disabled={busy || !aiReady || !workspace.truth.confirmedAt || blocked} onClick={() => onRegenerate(asset.id)}>{busy ? "处理中…" : "重新生成"}</button><label className={`asset-replace ${busy || !workspace.truth.confirmedAt ? "disabled" : ""}`}>在此处替换<input type="file" accept="image/*" disabled={busy || !workspace.truth.confirmedAt} onChange={(event) => { const file = event.target.files?.[0]; if (file) onReplace(asset.id, file); event.target.value = ""; }} /></label></div></footer></article>;
  })}</div>;
}

function ListingEditor({ listing, outputLanguage, setListing }: { listing: ProjectWorkspace["listings"][number]; outputLanguage: OutputLanguage; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  const bulletsZh = listing.bulletsZh ?? [];
  const updateBulletTranslation = (index: number, value: string) => setListing({ bulletsZh: listing.bulletsZh?.map((item, itemIndex) => itemIndex === index ? value : item) ?? listing.bullets.map((item, itemIndex) => itemIndex === index ? value : "") });
  const evidenced = listing.claims.filter((claim) => !claim.needsEvidence).length;
  return <div className={`listing-paper language-${outputLanguage}`}><header><div><span>{channelNames[listing.channel]}</span><b>{listing.strategy.toUpperCase()}</b></div><strong>{listing.score ? `得分 ${listing.score}` : "未生成"}</strong></header><p className="language-note">英文版用于美国渠道发布；中文译稿用于阅读、校对和定位修改。每条客观卖点必须关联商品事实；运行合规检查后才能导出。</p><div className={`fact-coverage ${listing.claims.length && evidenced === listing.claims.length ? "covered" : "needs-review"}`}><strong>事实依据追踪</strong><span>{evidenced}/{listing.claims.length || 0} 条 AI 宣称已关联已确认事实</span>{listing.claims.filter((claim) => claim.needsEvidence).map((claim) => <em key={claim.text}>待证明：{claim.claimZh || claim.text}</em>)}</div><label>英文商品标题（发布） <small>{listing.title.length} 字符</small><textarea id={`listing-${listing.channel}-title`} value={listing.title} placeholder="AI 生成后显示，也可手动输入真实内容" onChange={(event) => setListing({ title: event.target.value })} /></label><label>中文商品标题（对照）<textarea id={`listing-${listing.channel}-titleZh`} value={listing.titleZh ?? ""} placeholder="AI 生成后会显示中文译稿" onChange={(event) => setListing({ titleZh: event.target.value })} /></label><div className="bilingual-section"><div className="bilingual-label">核心卖点（英文发布） / 中文对照</div>{listing.bullets.length ? listing.bullets.map((bullet, index) => <div className="bilingual-line" key={`${listing.channel}-bullet-${index}`}><span>{index + 1}</span><textarea id={`listing-${listing.channel}-bullet-${index}`} value={bullet} placeholder={`第 ${index + 1} 条英文卖点`} onChange={(event) => setListing({ bullets: listing.bullets.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><textarea id={`listing-${listing.channel}-bulletZh-${index}`} value={bulletsZh[index] ?? ""} placeholder="中文卖点对照" onChange={(event) => updateBulletTranslation(index, event.target.value)} /></div>) : <div className="empty-inline">暂无英文卖点</div>}</div><label>商品描述（英文发布）<textarea id={`listing-${listing.channel}-description`} value={listing.description} placeholder="商品描述" onChange={(event) => setListing({ description: event.target.value })} /></label><label>商品描述（中文对照）<textarea id={`listing-${listing.channel}-descriptionZh`} value={listing.descriptionZh ?? ""} placeholder="AI 生成后会显示中文译稿" onChange={(event) => setListing({ descriptionZh: event.target.value })} /></label>{listing.searchTerms !== undefined && <label>Search Terms（英文发布）<textarea id={`listing-${listing.channel}-searchTerms`} value={listing.searchTerms} placeholder="搜索词" onChange={(event) => setListing({ searchTerms: event.target.value })} /></label>}{listing.searchTerms !== undefined && <label>Search Terms（中文对照）<textarea id={`listing-${listing.channel}-searchTermsZh`} value={listing.searchTermsZh ?? ""} placeholder="搜索词中文说明" onChange={(event) => setListing({ searchTermsZh: event.target.value })} /></label>}{listing.metaTitle !== undefined && <label>SEO 标题（英文发布）<textarea id={`listing-${listing.channel}-metaTitle`} value={listing.metaTitle} placeholder="SEO 标题" onChange={(event) => setListing({ metaTitle: event.target.value })} /></label>}{listing.metaTitle !== undefined && <label>SEO 标题（中文对照）<textarea id={`listing-${listing.channel}-metaTitleZh`} value={listing.metaTitleZh ?? ""} placeholder="SEO 标题中文说明" onChange={(event) => setListing({ metaTitleZh: event.target.value })} /></label>}{listing.metaDescription !== undefined && <label>Meta Description（英文发布）<textarea id={`listing-${listing.channel}-metaDescription`} value={listing.metaDescription} placeholder="Meta Description" onChange={(event) => setListing({ metaDescription: event.target.value })} /></label>}{listing.metaDescription !== undefined && <label>Meta Description（中文对照）<textarea id={`listing-${listing.channel}-metaDescriptionZh`} value={listing.metaDescriptionZh ?? ""} placeholder="Meta Description 中文说明" onChange={(event) => setListing({ metaDescriptionZh: event.target.value })} /></label>}</div>;
}

function PagePreview({ workspace, channel }: { workspace: ProjectWorkspace; channel: Channel }) {
  const modules = workspace.details[channel] ?? [];
  if (!modules.length) return <div className="empty-panel large"><b>尚未生成详情页模块</b><p>生成后这里会展示该渠道独立的模块结构与真实文案。</p></div>;
  const channelAssets = workspace.assets.filter((asset) => asset.channel === channel);
  const factNames = new Map(workspace.truth.attributes.map((fact) => [fact.id, `${fact.nameZh || fact.name} · ${fact.valueZh || fact.value}`]));
  return <div className="page-browser"><header><i /><i /><i /><span>{channelNames[channel]} / 中英双语详情页预览</span></header><div className="page-proof"><strong>真实素材已嵌入预览</strong><span>图片、文案与商品事实保持同一版本，可直接检查购买决策路径。</span></div>{modules.map((module, index) => {
    const kind = assetKindForModule(module.type);
    const asset = module.assetIds.map((id) => channelAssets.find((item) => item.id === id)).find(Boolean) ?? (kind ? channelAssets.find((item) => item.kind === kind) : undefined);
     return <section className={`detail-module-preview detail-module-${module.type} ${index === 0 ? "detail-module-first" : ""}`} key={module.id}>{asset && <div className="detail-module-media"><ResilientImage src={asset.url} alt={`${assetPurpose[asset.kind].nameZh} · ${module.title}`} /><span>{assetPurpose[asset.kind].nameZh}</span></div>}<div className="detail-module-copy"><small>{module.type} · 模块 {index + 1}</small><h2>{module.title}</h2><p>{module.body}</p><div className="module-translation"><b>中文对照</b><h3>{module.titleZh || "中文标题尚未生成"}</h3><p>{module.bodyZh || "中文译稿尚未生成，请重新生成该渠道内容。"}</p></div>{module.factIds.length > 0 && <div className="module-facts"><span>事实依据</span>{module.factIds.map((factId) => <em key={factId}>{factNames.get(factId) || "事实已更新，请重新生成"}</em>)}</div>}</div></section>;
  })}</div>;
}

function ComplianceCenter({ workspace, busy, aiReady, onScan, onFix, onOptimizeFinding, onOptimizeAll, onLocate }: { workspace: ProjectWorkspace; busy: boolean; aiReady: boolean; onScan: () => void; onFix: () => void; onOptimizeFinding: (finding: ComplianceFinding) => void; onOptimizeAll: () => void; onLocate: (finding: ComplianceFinding) => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const open = workspace.findings.filter((finding) => finding.status === "open");
  const high = open.filter((finding) => finding.severity === "high");
  const failedAssets = workspace.assets.filter((asset) => asset.complianceStatus === "failed");
  const unreviewedAssets = workspace.assets.filter((asset) => asset.complianceStatus !== "passed");
  const canExport = Boolean(workspace.truth.confirmedAt) && workspace.listings.every((listing) => listing.title.trim()) && high.length === 0 && unreviewedAssets.length === 0;
  const downloadExport = async () => {
    setExporting(true); setExportError("");
    try {
      const response = await fetch(`/api/projects/${workspace.project.id}/export`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `导出失败（${response.status}）`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `crosslaunch-${workspace.project.id}.zip`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "导出失败，请查看服务器日志后重试。");
    } finally { setExporting(false); }
  };
  return <section className="focused-space publish-space"><SpaceIntro number="03" label="COMPLIANCE & EXPORT" title="检测结果必须有依据，导出必须过门禁。" text="规则扫描使用当前保存内容。没有专项规则包的品类只显示部分覆盖，不会声称完全合规。" />
    <div className="publish-overview"><div className="readiness-copy"><span>{open.length ? "需要处理" : "等待检测或已通过"}</span><h2>{open.length ? `${open.length} 项风险` : "当前没有未处理发现"}</h2><p>此功能是风险筛查工具，不替代平台审核、检测认证或法律意见。{failedAssets.length ? ` ${failedAssets.length} 张图片需要重新生成或替换。` : ""}</p></div><button className="main-action" disabled={busy || workspace.listings.some((listing) => !listing.title.trim())} onClick={onScan}>{busy ? "检测中…" : "运行真实规则检测"}</button></div>
    <div className="publish-grid"><section className="channel-readiness"><header><span>规则覆盖</span><small>United States</small></header>{workspace.project.channels.map((item) => <article key={item}><div className="channel-logo">{channelNames[item][0]}</div><div><h3>{channelNames[item]}</h3><p>{coverageName(workspace.project.coverage[item])}</p></div></article>)}</section><section className="risk-focus"><header className="risk-header"><div><span>检测发现</span><small>{open.length} 项</small></div>{open.length ? <div className="risk-actions"><button className="main-action" onClick={onOptimizeAll} disabled={busy || !aiReady}>{busy ? "AI 优化并复检中…" : aiReady ? "AI 一键优化全部并复检 →" : "配置 AI 后可一键优化"}</button><button className="secondary-action" onClick={onFix} disabled={busy}>仅清理文字并复检</button></div> : null}</header><div className="risk-list">{open.length ? open.map((finding) => { const source = workspace.sources.find((item) => item.id === finding.sourceId); return <article key={finding.id}><i className={finding.severity}>!</i><div><span>{finding.severity.toUpperCase()} · {finding.location ? locationLabel(finding.location) : finding.target}</span><h3>{finding.excerpt}</h3><p className="finding-translation">中文：{finding.excerptZh || finding.excerpt}</p><p>{finding.explanationZh || finding.explanation}</p><strong>建议：{finding.suggestionZh || finding.suggestion}</strong><div className="finding-actions">{finding.location ? <><button type="button" className="finding-locate" onClick={() => onLocate(finding)}>定位并编辑：{locationLabel(finding.location)} →</button><button type="button" className="finding-optimize" disabled={busy || !aiReady} onClick={() => onOptimizeFinding(finding)}>{aiReady ? "AI 优化此项并复检" : "配置 AI 后可优化"}</button></> : <span className="finding-legacy">旧版记录，请重新检测后定位</span>}{source ? <a href={source.url} target="_blank" rel="noreferrer">查看规则来源 ↗</a> : <span>规则来源缺失</span>}</div></div></article>; }) : <div className="empty-panel"><b>暂无风险记录</b><p>请运行检测；空记录不等同于已完成合规审查。</p></div>}</div></section></div>
    <DeliveryGuide workspace={workspace} />
     <div className="launch-bar"><div><span>分平台最终交付包</span><b>Amazon · TikTok Shop · Shopify 各自独立文件夹</b><small>运营只需打开对应平台的 START-HERE.txt、01-listing-copy.csv 和 02-image-order.csv；审计 JSON 已移入 audit / technical。</small>{exportError && <em className="export-error" role="alert">导出错误：{exportError}</em>}</div>{open.length ? <button className="main-action" disabled>处理上方风险后再导出</button> : canExport ? <button className="main-action" disabled={exporting} onClick={downloadExport}>{exporting ? "正在打包导出…" : "下载分平台交付 ZIP →"}</button> : <button className="main-action" disabled>{failedAssets.length ? "请重新生成或替换图片后复检" : "完成事实确认、内容和图片复检后可导出"}</button>}</div>
  </section>;
}

function DeliveryGuide({ workspace }: { workspace: ProjectWorkspace }) {
  const specs: Record<Channel, { need: string; ready: string; note: string; tag: string }> = {
    "amazon-us": { need: "标题 · 5 条 Bullet · 描述 · Search Terms · 主图/附图 · Brand/SKU/价格/库存/GTIN", ready: "可复制内容 + 图片顺序 + A+ 模块", note: "批量上传必须先下载 Amazon 当前叶子类目的官方 Inventory File Template；本包不是通用 Amazon 模板。", tag: "复制到 Seller Central" },
    "tiktok-us": { need: "标题 · 描述 · 叶子类目属性 · 至少 5 张图 · SKU/价格/库存/包裹和物流", ready: "可复制内容 + 图片顺序 + 详情模块", note: "批量上传必须使用 Seller Center 当前叶子类目的官方 Excel；不可直接上传自制 CSV。", tag: "复制到 Seller Center" },
    "shopify-us": { need: "Product CSV · 图片公开 HTTPS URL · Vendor · SKU/价格/库存 · Product Category", ready: "标准 products-import.csv + 详情页 HTML + 图片映射", note: "从本地地址导出时图片 URL 会留空；上传到公开 HTTPS 地址后填入 CSV，再到 Shopify Products > Import。", tag: "CSV 可导入" },
  };
  return <section className="delivery-guide"><header><div><span>HOW TO USE THE DELIVERY</span><h2>下载后，按平台直接交付</h2></div><p>三个平台的上传格式不同，系统已把“可直接使用”和“必须补充”分开标注。</p></header><div className="delivery-grid">{workspace.project.channels.map((channel) => { const spec = specs[channel]; return <article className={`delivery-card ${channel}`} key={channel}><div className="delivery-card-head"><div className="channel-logo">{channelNames[channel][0]}</div><div><h3>{channelNames[channel]}</h3><span>{spec.tag}</span></div></div><dl><div><dt>平台需要</dt><dd>{spec.need}</dd></div><div><dt>本包已准备</dt><dd>{spec.ready}</dd></div></dl><p className="delivery-note">{spec.note}</p><a href={channel === "shopify-us" ? "https://help.shopify.com/en/manual/products/import-export/using-csv" : channel === "tiktok-us" ? "https://seller-us.tiktok.com/university/essay?knowledge_id=428445525411626" : "https://sellercentral.amazon.com/"} target="_blank" rel="noreferrer">查看平台官方说明 ↗</a></article>; })}</div></section>;
}

function SpaceIntro({ number, label, title, text, compact = false }: { number: string; label: string; title: string; text: string; compact?: boolean }) {
  return <div className={`space-intro ${compact ? "compact" : ""}`}><div><i>{number}</i><span>{label}</span></div><h1>{title}</h1><p>{text}</p></div>;
}

function errorText(cause: unknown) { return cause instanceof Error ? cause.message : "操作失败。"; }
function workspaceFingerprint(workspace: ProjectWorkspace) { return JSON.stringify({ ...workspace, project: { ...workspace.project, updatedAt: "" } }); }
function outputLanguageName(language: OutputLanguage) { return language === "bilingual" ? "中英对照" : language === "zh-CN" ? "中文优先" : "English first"; }
function translationNeeded(workspace: ProjectWorkspace) {
  const categoryNeedsTranslation = Boolean(workspace.truth.category.trim() && !workspace.truth.categoryZh?.trim());
  const factsNeedTranslation = workspace.truth.attributes.some((fact) => !fact.nameZh?.trim() || !fact.valueZh?.trim());
  const listingsNeedTranslation = workspace.listings.some((listing) => listing.title.trim() && (!listing.titleZh?.trim() || !listing.descriptionZh?.trim() || listing.bullets.some((_, index) => !listing.bulletsZh?.[index]?.trim()) || Boolean(listing.searchTerms?.trim() && !listing.searchTermsZh?.trim()) || Boolean(listing.metaTitle?.trim() && !listing.metaTitleZh?.trim()) || Boolean(listing.metaDescription?.trim() && !listing.metaDescriptionZh?.trim())));
  const detailsNeedTranslation = Object.values(workspace.details).some((modules) => modules.some((module) => !module.titleZh?.trim() || !module.bodyZh?.trim()));
  return categoryNeedsTranslation || factsNeedTranslation || listingsNeedTranslation || detailsNeedTranslation;
}
function complianceTargetId(location: ComplianceLocation) {
  if (location.kind === "asset") return `asset-${location.assetId}`;
  const suffix = location.field === "bullet" ? `-${location.index ?? 0}` : "";
  return `listing-${location.channel}-${location.field ?? "description"}${suffix}`;
}
function locationLabel(location: ComplianceLocation) {
  if (location.kind === "asset") return `${channelNames[location.channel]} · 商品图片`;
  const labels = { title: "英文标题", bullet: `第 ${(location.index ?? 0) + 1} 条英文卖点`, description: "英文商品描述", searchTerms: "英文搜索词", metaTitle: "英文 SEO 标题", metaDescription: "英文 Meta Description", detailTitle: "详情页标题", detailBody: "详情页正文" };
  return `${channelNames[location.channel]} · ${labels[location.field ?? "description"]}`;
}
function statusName(status: LaunchProject["status"]) { return ({ queued: "待开始", running: "进行中", needs_review: "待审核", failed: "失败", completed: "已完成" } as const)[status]; }
function coverageName(status: "full" | "partial" | "unsupported") { return status === "full" ? "已发布规则包完整覆盖" : status === "partial" ? "部分覆盖，需要人工复核" : "暂未覆盖，需要人工审核"; }
function assetStatusName(status: "pending" | "passed" | "failed") { return status === "passed" ? "已通过" : status === "failed" ? "需替换" : "待复检"; }

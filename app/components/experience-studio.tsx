"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { AssetVersion, Channel, ComplianceFinding, ComplianceLocation, LaunchProject, OutputLanguage, ProductFact, ProjectWorkspace, RuntimeStatus } from "../lib/domain";
import { appPath, createProject, deleteProject, getRuntimeStatus, getTask, listProjects, loadWorkspace, runWorkflow, saveWorkspace, uploadAsset } from "../lib/api-client";
import { assetKindForModule, assetKinds, assetPurpose, assetRequirement } from "../lib/asset-policy";
import { complianceRules, ruleSources } from "../lib/rules";

type Space = "projects" | "truth" | "create" | "compliance";
type CreateView = "assets" | "listing" | "page";
type UiLanguage = "zh-CN" | "en-US";
const channelNames: Record<Channel, string> = { "amazon-us": "Amazon US", "tiktok-us": "TikTok Shop US", "shopify-us": "Shopify US" };
const uiText = (language: UiLanguage, zh: string, en: string) => language === "zh-CN" ? zh : en;
const uiLanguageOf = (language?: OutputLanguage): UiLanguage => language === "en-US" ? "en-US" : "zh-CN";
const navNames: Record<UiLanguage, string[]> = { "zh-CN": ["项目", "商品规格", "内容创作", "合规导出"], "en-US": ["Projects", "Product specifications", "Content", "Compliance & export"] };

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
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("zh-CN");
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingFindingIds, setPendingFindingIds] = useState<string[]>([]);
  const runtimeRequest = useRef<Promise<RuntimeStatus> | null>(null);
  const submittingFindingIds = useRef(new Set<string>());
  const optimizingAll = useRef(false);
  const t = (zh: string, en: string) => uiText(uiLanguage, zh, en);

  useEffect(() => {
    const stored = window.localStorage.getItem("crosslaunch-ui-language");
    if (stored === "zh-CN" || stored === "en-US") {
      // The persisted browser preference is intentionally restored after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUiLanguage(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = uiLanguage;
    window.localStorage.setItem("crosslaunch-ui-language", uiLanguage);
  }, [uiLanguage]);

  const setSavedWorkspace = (next: ProjectWorkspace) => {
    setWorkspace(next);
    setSavedFingerprint(workspaceFingerprint(next));
  };
  const hasUnsavedChanges = Boolean(workspace && workspaceFingerprint(workspace) !== savedFingerprint);
  const aiReady = Boolean(runtime?.modelRouter.configured && !runtimeLoading);
  const changeOutputLanguage = (outputLanguage: OutputLanguage) => {
    const nextLanguage = uiLanguageOf(outputLanguage);
    setUiLanguage(nextLanguage);
    if (!workspace || (workspace.outputLanguage ?? "en-US") === outputLanguage) {
      setMessage(uiText(nextLanguage, "界面和内容语言已切换为中文。", "The interface and content language is now English."));
      return;
    }
    setWorkspace({ ...workspace, outputLanguage });
    setMessage(uiText(nextLanguage, "界面和内容语言已切换为中文；请重新生成内容后应用。", "The interface and content language is now English. Regenerate content to apply it."));
  };
  const locateFinding = (finding: ComplianceFinding) => {
    const location = finding.location;
    if (!location) {
      setMessage(t("这条记录来自旧版检测结果，无法精确定位；请重新运行规则检测生成新的定位信息。", "This is a legacy finding without an exact location. Run the check again to create a new location."));
      return;
    }
    const targetId = complianceTargetId(location);
    setFocusTarget(targetId);
    setChannel(location.channel);
    setSpace("create");
    setView(location.kind === "asset" ? "assets" : "listing");
    setMessage(`${t("已定位到", "Located at ")}${locationLabel(location, uiLanguage)}${t("，可直接修改并保存。", ". Edit it directly and save.")}`);
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
      setUiLanguage(uiLanguageOf(result.workspace.outputLanguage));
      setChannel(result.workspace.project.channels[0] ?? "amazon-us");
      setSpace("truth");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  const removeProject = async (id: string) => {
    const target = projects.find((item) => item.id === id);
    if (!target || !window.confirm(`确定删除“${target.name}”吗？项目中的图片和历史版本也会一并删除。`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await deleteProject(id);
      setProjects((items) => items.filter((item) => item.id !== id));
      if (workspace?.project.id === id) {
        setWorkspace(null);
        setSavedFingerprint("");
        setSpace("projects");
      }
      setMessage(t("项目已删除。", "Project deleted."));
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let disposed = false;
    const loadRuntime = async () => {
      setRuntimeLoading(true);
      try {
        if (!runtimeRequest.current) runtimeRequest.current = getRuntimeStatus();
        const request = runtimeRequest.current;
        const status = await request;
        if (!disposed) setRuntime(status);
      } catch (cause) {
        if (!disposed) setError(`${uiText(uiLanguage, "AI 状态检测失败：", "AI status check failed: ")}${errorText(cause)} ${uiText(uiLanguage, "请稍后重试。", "Please try again later.")}`);
      } finally {
        runtimeRequest.current = null;
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
  }, [uiLanguage]);

  const pollBackgroundTask = async (projectId: string, taskId: string, findingId?: string) => {
    let missingTaskRetries = 0;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        const result = await getTask(projectId, taskId);
        setSavedWorkspace(result.workspace);
        setProjects((items) => items.map((item) => item.id === result.workspace.project.id ? result.workspace.project : item));
        if (result.task.status === "completed" || result.task.status === "failed") {
          if (findingId) { submittingFindingIds.current.delete(findingId); setPendingFindingIds((items) => items.filter((id) => id !== findingId)); }
          else optimizingAll.current = false;
          const remaining = result.workspace.findings.filter((finding) => finding.status === "open").length;
          if (result.task.status === "failed") setError(result.task.error || t("后台优化失败，请重试。", "Background optimization failed. Please try again."));
          else {
            const reasons = result.task.failureReasons?.length
              ? ` ${t("未自动修改的原因：", "Automatic-fix reasons: ")}${result.task.failureReasons.map((item) => `${item.target}（${item.message}）`).join("；")}`
              : "";
            setMessage((result.task.outputSummary || (remaining ? `${t("后台处理完成，仍有 ", "Background processing finished with ")}${remaining}${t(" 项风险。", " risks remaining.")}` : t("后台处理完成，复检已通过。", "Background processing finished and the recheck passed."))) + reasons);
          }
          return;
        }
      } catch (cause) {
        // 刚创建任务时，持久化层可能短暂返回旧快照；给任务状态接口几次机会，避免误报“任务不存在”。
        if (errorText(cause).includes("任务不存在") && missingTaskRetries < 5) {
          missingTaskRetries += 1;
          continue;
        }
        if (findingId) { submittingFindingIds.current.delete(findingId); setPendingFindingIds((items) => items.filter((id) => id !== findingId)); }
        else optimizingAll.current = false;
        setError(`${t("读取后台任务进度失败：", "Could not read background task progress: ")}${errorText(cause)}`);
        return;
      }
    }
  };

  const execute = async (action: "analyze" | "confirm_truth" | "generate" | "translate" | "scan" | "apply_fixes" | "optimize_finding" | "optimize_all" | "regenerate_asset", next?: Space, assetId?: string, findingId?: string, generateAll = false, workflowChannel?: Channel) => {
    if (!workspace) return;
    const background = action === "optimize_finding" || action === "optimize_all";
    if (action === "optimize_finding" && findingId && submittingFindingIds.current.has(findingId)) return;
    if (action === "optimize_all" && optimizingAll.current) return;
    if (action === "optimize_finding" && findingId) submittingFindingIds.current.add(findingId);
    if (action === "optimize_all") optimizingAll.current = true;
    if (background && action === "optimize_finding" && findingId) setPendingFindingIds((items) => items.includes(findingId) ? items : [...items, findingId]);
    if (!background) { setBusy(true); setActiveAction(action); }
    setError(""); setMessage("");
    try {
      const targetChannel = workflowChannel ?? (action === "generate" && !generateAll ? channel : undefined);
      const result = await runWorkflow(workspace.project.id, action, workspace, targetChannel, assetId, findingId, background);
      setSavedWorkspace(result.workspace);
      setProjects((items) => items.map((item) => item.id === result.workspace.project.id ? result.workspace.project : item));
      if (background && result.task) {
        setMessage(t("任务已开始，其他风险可以继续提交；下方会显示处理进度。", "Task started. You can submit other risks too; progress appears below each item."));
        void pollBackgroundTask(workspace.project.id, result.task.id, findingId);
        return;
      }
      if (findingId) { submittingFindingIds.current.delete(findingId); setPendingFindingIds((items) => items.filter((id) => id !== findingId)); }
      if (action === "optimize_all") optimizingAll.current = false;
      if (next) setSpace(next);
      const remaining = result.workspace.findings.filter((finding) => finding.status === "open").length;
      setMessage(action === "regenerate_asset" ? t("单张素材已重新生成，请重新运行合规检查。", "Asset regenerated. Run the compliance check again.") : action === "optimize_finding" ? remaining ? `${t("AI 已完成该项优化并复检，但仍有 ", "The item was optimized and rechecked, but ")}${remaining}${t(" 项风险。", " risks remain.")}` : t("AI 已优化该问题并完成重新检测。", "The issue was optimized and rechecked.") : action === "optimize_all" ? remaining ? `${t("AI 已完成优化并复检，但仍有 ", "Optimization and recheck finished, but ")}${remaining}${t(" 项风险。", " risks remain.")}` : t("AI 已优化全部风险并完成重新检测。", "All risks were optimized and rechecked.") : action === "translate" ? t("中英双语译稿已生成并保存。", "Bilingual translation generated and saved.") : action === "scan" || action === "apply_fixes" ? t("合规检查已执行并保存。", "Compliance check completed and saved.") : action === "generate" ? generateAll ? t("三个渠道的 Listing、详情页和商品图片已生成。", "Listings, product pages and images were generated for all three channels.") : `${channelNames[channel]} ${t("的内容和图片已生成。", "content and images were generated.")}` : t("操作已执行并保存。", "Action completed and saved."));
    } catch (cause) { if (findingId) { submittingFindingIds.current.delete(findingId); setPendingFindingIds((items) => items.filter((id) => id !== findingId)); } if (action === "optimize_all") optimizingAll.current = false; setError(errorText(cause)); }
    finally { if (!background) { setBusy(false); setActiveAction(null); } }
  };

  const save = async (reason = "用户保存工作区") => {
    if (!workspace) return;
    if (!hasUnsavedChanges) {
      setMessage(t("当前没有新的修改，无需重复保存。", "There are no new changes to save."));
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await saveWorkspace(workspace, reason);
      setSavedWorkspace(result.workspace); setMessage(`${t("已保存为版本 ", "Saved as version ")}${result.version}`);
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
      <nav aria-label={t("主导航", "Main navigation")}>
        {(["projects", "truth", "create", "compliance"] as Space[]).map((item, index) => <button key={item} className={space === item ? "active" : ""} disabled={(!workspace && item !== "projects") || (item === "compliance" && !hasGeneratedContent(workspace))} onClick={() => setSpace(item)}><i>{index + 1}</i>{navNames[uiLanguage][index]}</button>)}
      </nav>
      <div className="experience-head-actions">
        <label className="global-language-control"><span>{t("界面与内容", "UI & content")}</span><select aria-label={t("界面与内容语言", "UI and content language")} value={uiLanguage} onChange={(event) => changeOutputLanguage(event.target.value as OutputLanguage)}><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
        {workspace && <button disabled={busy || !hasUnsavedChanges} onClick={() => save()} title={hasUnsavedChanges ? t("保存当前修改", "Save changes") : t("当前没有新的修改", "No new changes")}>{busy ? t("处理中…", "Working…") : hasUnsavedChanges ? t("保存", "Save") : t("已保存", "Saved")}</button>}
      </div>
    </header>
    {(error || message) && <div className={`system-banner ${error ? "error" : "success"}`}><span>{error || message}</span><button onClick={() => { setError(""); setMessage(""); }}>×</button></div>}
    {space === "projects" && <ProjectsHome language={uiLanguage} projects={projects} busy={busy} onOpen={openProject} onDelete={removeProject} onCreated={(next) => { const localized = { ...next, outputLanguage: uiLanguage }; setSavedWorkspace(localized); setProjects((items) => [localized.project, ...items]); setChannel(localized.project.channels[0]); setSpace("truth"); }} onError={setError} />}
    {workspace && space === "truth" && <TruthWorkbench language={uiLanguage} workspace={workspace} setWorkspace={setWorkspace} busy={busy} aiReady={aiReady} analyzing={activeAction === "analyze"} hasUnsavedChanges={hasUnsavedChanges} onUpload={async (file) => {
      setBusy(true); setError("");
      try {
        const supportedType = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);
        if (!supportedType) throw new Error("请选择 JPG、PNG、WEBP、GIF 或 SVG 图片。");
        if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8MB，请压缩后重新上传。");
        setMessage(t("正在上传商品图片，请稍候…", "Uploading the product image…"));
        const sourceAsset = await uploadAsset(workspace.project.id, file);
        const next = { ...workspace, truth: { ...workspace.truth, sourceAsset, confirmedAt: undefined }, project: { ...workspace.project, currentStep: "input", status: "queued" as const } };
        const saved = await saveWorkspace(next, "上传商品原图");
        setSavedWorkspace(saved.workspace); setMessage(t("商品图片上传成功，已保存到当前项目。", "Product image uploaded and saved to this project."));
      } catch (cause) { setError(errorText(cause)); }
      finally { setBusy(false); }
    }} onAnalyze={() => execute("analyze")} onConfirm={() => execute("confirm_truth", "create")} onSave={() => save("编辑商品规格")} />}
    {workspace && space === "create" && <CreationStudio language={uiLanguage} workspace={workspace} setWorkspace={setWorkspace} channel={channel} setChannel={setChannel} view={view} setView={setView} busy={busy} aiReady={aiReady} hasUnsavedChanges={hasUnsavedChanges} outputLanguage={workspace.outputLanguage ?? "en-US"} focusTarget={focusTarget} onGenerate={() => execute("generate")} onGenerateAll={() => execute("generate", undefined, undefined, undefined, true)} onRegenerateAsset={(assetId) => execute("regenerate_asset", undefined, assetId)} onReplaceAsset={replaceAsset} onSave={() => save("编辑渠道内容")} onCompliance={() => setSpace("compliance")} />}
     {workspace && space === "compliance" && <ComplianceCenter language={uiLanguage} workspace={workspace} busy={busy} aiReady={aiReady} pendingFindingIds={pendingFindingIds} onScan={(targetChannel) => execute("scan", undefined, undefined, undefined, false, targetChannel)} onFix={(targetChannel) => execute("apply_fixes", undefined, undefined, undefined, false, targetChannel)} onOptimizeFinding={(finding, targetChannel) => execute("optimize_finding", undefined, undefined, finding.id, false, targetChannel)} onOptimizeAll={(targetChannel) => execute("optimize_all", undefined, undefined, undefined, false, targetChannel)} onLocate={locateFinding} />}
  </main>;
}

function ProjectsHome({ language, projects, busy, onOpen, onDelete, onCreated, onError }: { language: UiLanguage; projects: LaunchProject[]; busy: boolean; onOpen: (id: string) => void; onDelete: (id: string) => void; onCreated: (workspace: ProjectWorkspace) => void; onError: (value: string) => void }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const submit = async () => {
    if (!productName.trim()) return onError(t("请输入真实商品名称。", "Enter a real product name."));
    setCreating(true); onError("");
    try { const result = await createProject({ productName, category, channels: ["amazon-us", "tiktok-us", "shopify-us"] }); onCreated(result.workspace); }
    catch (cause) { onError(errorText(cause)); }
    finally { setCreating(false); }
  };
  return <section className="home-space real-home">
      <div className="home-hero compact-real"><div className="hero-copy"><span className="eyebrow">{t("真实数据工作台", "Real-data workspace")}</span><h1>{t("从真实商品开始，", "Start with a real product,")}<br />{t("生成可追溯的跨境内容。", "create traceable cross-border content.")}</h1></div>
      <div className="create-card"><h2>{t("新建商品项目", "Create a product project")}</h2><label>{t("商品名称", "Product name")}<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder={t("例如：不锈钢保温杯", "e.g. stainless steel bottle")} /></label><label>{t("商品品类", "Product category")}<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder={t("例如：厨房用品（可稍后修改）", "e.g. kitchenware (editable later)")} /></label><p>{t("首发渠道：", "Launch channels: ")}Amazon US · TikTok Shop US · Shopify US</p><button className="main-action" disabled={creating || busy} onClick={submit}>{creating ? t("正在创建…", "Creating…") : t("创建空白项目 →", "Create blank project →")}</button></div></div>
    <div className="recent-block"><div className="section-title"><div><span>{t("我的项目", "My projects")}</span><h2>{t("已保存项目", "Saved projects")}</h2></div><b>{projects.length} {t("个", "")}</b></div>
      {projects.length ? <div className="project-row real-projects">{projects.map((project) => <article className="project-tile current" key={project.id}><button className="project-open" onClick={() => onOpen(project.id)} disabled={busy}><div className="tile-visual neutral">{project.productName.slice(0, 1).toUpperCase()}</div><div><span className={`project-state ${project.status === "completed" ? "done" : "review"}`}>{statusName(project.status, language)}</span><h3>{project.name}</h3><p>{project.channels.map((item) => channelNames[item]).join(" · ")}</p><small>{t("更新于", "Updated ")} {new Date(project.updatedAt).toLocaleString(language === "zh-CN" ? "zh-CN" : "en-US")}</small></div><b>{t("打开 →", "Open →")}</b></button><button type="button" className="project-delete" onClick={() => onDelete(project.id)} disabled={busy}>{t("删除项目", "Delete project")}</button></article>)}</div> : <div className="empty-panel"><b>{t("还没有项目", "No projects yet")}</b><p>{t("上方创建的将是空白、可持久化的真实项目。", "Create a real, persistent project above to get started.")}</p></div>}
    </div>
  </section>;
}

function TruthWorkbench({ language, workspace, setWorkspace, busy, aiReady, analyzing, hasUnsavedChanges, onUpload, onAnalyze, onConfirm, onSave }: { language: UiLanguage; workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; busy: boolean; aiReady: boolean; analyzing: boolean; hasUnsavedChanges: boolean; onUpload: (file: File) => void; onAnalyze: () => void; onConfirm: () => void; onSave: () => void }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateTruth = (patch: Partial<ProjectWorkspace["truth"]>) => setWorkspace({ ...workspace, truth: { ...workspace.truth, ...patch, confirmedAt: undefined } });
  const updateFact = (id: string, patch: Partial<ProductFact>) => updateTruth({ attributes: workspace.truth.attributes.map((fact) => fact.id === id ? { ...fact, ...patch } : fact) });
  const addFact = () => updateTruth({ attributes: [...workspace.truth.attributes, { id: crypto.randomUUID(), name: "", value: "", status: "pending", confidence: 1, evidenceIds: [] }] });
  const verified = workspace.truth.attributes.filter((fact) => fact.status === "verified").length;
  const canConfirm = verified > 0 && !workspace.truth.confirmedAt && !busy;
  const chooseImage = () => { if (!busy) fileInputRef.current?.click(); };
  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); };
  return <section className="focused-space"><SpaceIntro number="01" label={t("商品规格", "Product specifications")} title={t("先确认真实商品规格，再让 AI 创作。", "Confirm real product specifications before creating with AI.")} text={t("你可以上传原图让 AI 识别，也可以手动录入。只有你确认过的商品规格才会用于生成。", "Upload an original image for AI recognition or enter specifications manually. Only confirmed specifications are used for generation.")} />
      <div className="workbench-grid"><div className="product-stage"><input ref={fileInputRef} id="source-product-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" aria-label={t("商品图片", "Product image")} disabled={busy} onChange={handleImageChange} />{workspace.truth.sourceAsset ? <ResilientImage language={language} src={appPath(workspace.truth.sourceAsset.url)} alt={t("商品原图", "Original product image")} /> : <div className="upload-placeholder"><b>{t("上传真实商品原图", "Upload the original product image")}</b><span>JPG / PNG / WEBP · {t("最大 8MB", "max 8MB")}</span></div>}<span className="stage-chip">{t("原始商品图片", "Original product image")}</span><button type="button" onClick={chooseImage} disabled={busy}>{workspace.truth.sourceAsset ? t("更换图片", "Replace image") : t("选择图片", "Choose image")}</button></div>
      <section className="truth-editor real-editor"><header><div><span>{t("商品规格档案", "Product specification profile")}</span><input className="title-input" value={workspace.truth.productName} onChange={(event) => updateTruth({ productName: event.target.value })} /></div><div className="truth-header-tools"><strong>{verified}<small>{t("已确认规格", "verified specifications")}</small></strong></div></header>
        <div className="bilingual-category"><label className="inline-field">{t("商品品类（英文）", "Product category (English)")}<input value={workspace.truth.category} onChange={(event) => updateTruth({ category: event.target.value })} /></label><label className="inline-field">{t("商品品类（中文）", "Product category (Chinese)")}<input aria-label={t("商品品类（中文）", "Product category (Chinese)")} value={workspace.truth.categoryZh ?? ""} placeholder={t("AI 识别后显示中文分类", "AI category in Chinese") } onChange={(event) => updateTruth({ categoryZh: event.target.value })} /></label></div>
        <div className="truth-actions"><button className="quiet-action" onClick={onAnalyze} disabled={busy || !aiReady || !workspace.truth.sourceAsset}>{analyzing ? t("正在识别商品规格…", "Recognizing product specifications…") : aiReady ? t("AI 识别原图", "Recognize original image") : t("AI 未配置", "AI not configured")}</button><button className="quiet-action" onClick={addFact} disabled={busy}>＋ {t("手动添加规格", "Add specification manually")}</button></div>
         {(analyzing || workspace.truth.attributes.length > 0) && <div className={`truth-status-row ${analyzing ? "loading" : ""}`} role="status" aria-live="polite"><strong>{analyzing ? t("AI 正在分析商品图片", "AI is analyzing the product image") : `${t("已识别 ", "Recognized ")}${workspace.truth.attributes.length}${t(" 条候选规格", " candidate specifications")}`}</strong><span>{analyzing ? t("正在调用视觉模型，请稍候，不要重复点击。", "The vision model is working. Please wait and do not click again.") : t("请逐条检查规格来源，再将确认项改为“已确认”。", "Review each specification and mark only verified items as confirmed.")}</span></div>}
         <div className="fact-table">{workspace.truth.attributes.map((fact) => <div className="fact-row" key={fact.id}><div className="fact-copy"><input aria-label={t("规格名称（英文）", "Specification name (English)")} value={fact.name} placeholder={t("属性，如：Material", "e.g. Material")} onChange={(event) => updateFact(fact.id, { name: event.target.value })} /><input aria-label={t("规格名称（中文）", "Specification name (Chinese)")} value={fact.nameZh ?? ""} placeholder={t("中文规格名", "Chinese name")} onChange={(event) => updateFact(fact.id, { nameZh: event.target.value })} /></div><div className="fact-copy"><input aria-label={t("规格值（英文）", "Specification value (English)")} value={fact.value} placeholder={t("真实值", "Verified value")} onChange={(event) => updateFact(fact.id, { value: event.target.value })} /><input aria-label={t("规格值（中文）", "Specification value (Chinese)")} value={fact.valueZh ?? ""} placeholder={t("中文规格值", "Chinese value")} onChange={(event) => updateFact(fact.id, { valueZh: event.target.value })} /></div><select aria-label={t("规格状态", "Specification status")} value={fact.status} onChange={(event) => updateFact(fact.id, { status: event.target.value as ProductFact["status"] })}><option value="pending">{t("待确认", "Pending")}</option><option value="verified">{t("已确认", "Confirmed")}</option><option value="missing">{t("缺失", "Missing")}</option></select><button aria-label={t("删除规格", "Delete specification")} onClick={() => updateTruth({ attributes: workspace.truth.attributes.filter((item) => item.id !== fact.id) })}>×</button></div>)}{!workspace.truth.attributes.length && <div className="empty-panel"><b>{t("尚无商品规格", "No product specifications yet")}</b><p>{t("上传图片后调用 AI 识别，或手动添加可证明的商品规格。", "Upload an image for AI recognition, or add verifiable product specifications.")}</p></div>}</div>
        <footer><p><b>{workspace.truth.confirmedAt ? t("档案已确认", "Profile confirmed") : verified ? `${verified}${t(" 条规格已标记确认", " specifications marked confirmed")}` : t("请先确认至少一条规格", "Confirm at least one specification first")}</b><span>{workspace.truth.confirmedAt ? t("已进入创作阶段，可从顶部导航返回查看。", "Creation is unlocked; use the top navigation to continue.") : t("下拉选择“已确认”后，才能进入创作；待确认规格不会被用于生成。", "Mark specifications as confirmed before creation; pending specifications are not used.")}</span><small id="truth-confirm-hint" className={`truth-confirm-hint ${canConfirm ? "ready" : ""}`}>{workspace.truth.confirmedAt ? t("商品规格档案已确认。", "Product specification profile confirmed.") : analyzing ? t("AI 识别完成后，请先审核候选规格。", "Review the candidate specifications after AI finishes.") : verified ? t("可以确认并进入创作。", "You can confirm and continue.") : t("当前按钮不可用：请将至少一条规格改为“已确认”。", "This button is disabled until one specification is confirmed.")}</small></p><div><button className="quiet-action" disabled={busy || !hasUnsavedChanges} onClick={onSave}>{hasUnsavedChanges ? t("保存草稿", "Save draft") : t("已保存", "Saved")}</button><button className="main-action" aria-describedby="truth-confirm-hint" disabled={!canConfirm} onClick={onConfirm}>{workspace.truth.confirmedAt ? t("规格已确认", "Specifications confirmed") : t("确认规格并进入创作 →", "Confirm specifications and continue →")}</button></div></footer>
      </section></div>
  </section>;
}

function CreationStudio({ language, workspace, setWorkspace, channel, setChannel, view, setView, busy, aiReady, hasUnsavedChanges, outputLanguage, focusTarget, onGenerate, onGenerateAll, onRegenerateAsset, onReplaceAsset, onSave, onCompliance }: { language: UiLanguage; workspace: ProjectWorkspace; setWorkspace: (value: ProjectWorkspace) => void; channel: Channel; setChannel: (value: Channel) => void; view: CreateView; setView: (value: CreateView) => void; busy: boolean; aiReady: boolean; hasUnsavedChanges: boolean; outputLanguage: OutputLanguage; focusTarget: string | null; onGenerate: () => void; onGenerateAll: () => void; onRegenerateAsset: (assetId: string) => void; onReplaceAsset: (assetId: string, file: File) => void; onSave: () => void; onCompliance: () => void }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const listing = workspace.listings.find((item) => item.channel === channel)!;
  const channelAssets = workspace.assets.filter((asset) => asset.channel === channel);
  const usableAssetCount = channelAssets.filter((asset) => assetRequirement(asset.kind, workspace.truth).ready && asset.complianceStatus !== "failed" && !(!asset.factIds?.length && (asset.kind === "comparison" || asset.kind === "size"))).length;
  const setListing = (patch: Partial<typeof listing>) => setWorkspace({ ...workspace, listings: workspace.listings.map((item) => item.channel === channel ? { ...item, ...patch } : item) });
  useEffect(() => { if (!focusTarget) return; const element = document.getElementById(focusTarget); if (!(element instanceof HTMLElement)) return; element.scrollIntoView({ behavior: "smooth", block: "center" }); element.focus(); }, [focusTarget, channel, view]);
  return <section className="canvas-space"><div className="canvas-top"><SpaceIntro number="02" label={t("内容制作", "Content creation")} title={t("每个平台单独生成、单独修改。", "Generate and edit each channel separately.")} text={t("这里显示当前项目已经生成的真实内容；没有生成的内容会明确提示。", "This area shows real generated content; missing content is clearly marked.")} compact /><div className="channel-switch">{workspace.project.channels.map((item) => <button key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>{channelNames[item]}</button>)}</div></div>
    <div className="canvas-toolbar"><div>{(["assets", "listing", "page"] as CreateView[]).map((item, index) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{[t("商品图片", "Product images"), "Listing", t("详情页", "Product page")][index]}</button>)}</div><span>{workspace.truth.confirmedAt ? t("商品规格已确认", "Product specifications confirmed") : t("商品规格未确认", "Product specifications not confirmed")}</span><button className="regenerate" disabled={busy || !aiReady || !workspace.truth.confirmedAt} onClick={onGenerate}>{aiReady ? (busy ? t("生成中…", "Generating…") : `${t("生成", "Generate ")} ${channelNames[channel]}`) : t("配置 AI 后可生成", "Configure AI to generate")}</button><button className="main-action generate-all" disabled={busy || !aiReady || !workspace.truth.confirmedAt} onClick={onGenerateAll}>{aiReady ? (busy ? t("正在生成全部渠道…", "Generating all channels…") : t("同时生成三个渠道", "Generate all three channels") ) : t("配置 AI 后可生成", "Configure AI to generate")}</button></div>
      <div className="creative-layout"><section className="result-canvas">{view === "assets" && <AssetGallery language={language} workspace={workspace} channel={channel} busy={busy} aiReady={aiReady} focusTarget={focusTarget} onRegenerate={onRegenerateAsset} onReplace={onReplaceAsset} />}{view === "listing" && <ListingEditor listing={listing} outputLanguage={outputLanguage} setListing={setListing} />}{view === "page" && <PagePreview workspace={workspace} channel={channel} />}</section>
        <aside className="result-rail"><span className="rail-kicker">{t("当前渠道", "Current channel")}</span><h3>{channelNames[channel]}</h3><div className="result-score"><strong>{listing.score || "—"}</strong><span>{listing.score ? t("内容评分", "Content score") : t("尚未生成", "Not generated")}</span></div><div className="rail-stat"><span>{t("已关联商品信息", "Linked product facts")}</span><b>{listing.claims.filter((item) => !item.needsEvidence).length}/{listing.claims.length}</b></div><div className="rail-stat"><span>{t("文字风险", "Text risks")}</span><b>{workspace.findings.filter((finding) => finding.status === "open" && finding.location?.kind === "listing" && finding.location.channel === channel).length || t("无", "None")}</b></div><div className="rail-stat"><span>{t("可用图片", "Usable images")}</span><b>{usableAssetCount}/{assetKinds.length}</b></div><button className="quiet-action" onClick={onSave} disabled={busy || !hasUnsavedChanges}>{hasUnsavedChanges ? t("保存修改", "Save changes") : t("已保存", "Saved")}</button><button className="main-action" disabled={!hasGeneratedContent(workspace)} onClick={onCompliance}>{t("进入合规检查 →", "Go to compliance →")}</button></aside></div>
  </section>;
}

function ResilientImage({ language = "en-US", src, alt }: { language?: UiLanguage; src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = () => { setFailed(false); setAttempt((value) => value + 1); };
  if (failed) return <div className="asset-image-fallback" role="status"><strong>{uiText(language, "图片暂时无法加载", "Image unavailable")}</strong><span>{uiText(language, "网络或对象存储响应中断", "Network or storage response interrupted")}</span><button type="button" onClick={retry}>{uiText(language, "重新加载", "Reload")}</button></div>;
  const separator = src.includes("?") ? "&" : "?";
  return <img key={`${src}-${attempt}`} src={attempt ? `${src}${separator}retry=${attempt}` : src} alt={alt} onError={() => setFailed(true)} />;
}

function AssetGallery({ language, workspace, channel, busy, aiReady, focusTarget, onRegenerate, onReplace }: { language: UiLanguage; workspace: ProjectWorkspace; channel: Channel; busy: boolean; aiReady: boolean; focusTarget: string | null; onRegenerate: (assetId: string) => void; onReplace: (assetId: string, file: File) => void }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const assets = workspace.assets.filter((asset) => asset.channel === channel);
  const byKind = new Map(assets.map((asset) => [asset.kind, asset]));
  return <div className="asset-gallery">{assetKinds.map((kind) => {
    const asset = byKind.get(kind);
    const purpose = assetPurpose[kind];
    const requirement = assetRequirement(kind, workspace.truth);
    const purposeName = language === "zh-CN" ? purpose.nameZh : purpose.name;
    const purposeDescription = language === "zh-CN" ? purpose.description : ({ main: "Accurately show the product for sale; suitable for a channel main image.", scene: "Show a real use context while keeping the product identity unchanged.", model: "Show the target customer using the product; unrelated props must not look like included accessories.", comparison: "Use only confirmed facts for feature or structure comparisons.", size: "Show only confirmed dimensions, capacity or weight data." } as Record<AssetVersion["kind"], string>)[kind];
    const requirementReason = language === "zh-CN" ? requirement.reasonZh : requirement.reason;
    if (!asset) return <article className="creative-asset asset-missing" key={kind}><div className="asset-empty-visual"><strong>{t("尚未生成", "Not generated")}</strong><span>{requirement.ready ? t("确认事实后可生成", "Confirm facts to generate") : t("需要补充事实", "More facts required")}</span></div><footer><div><b>{purposeName}</b><span>{requirementReason}</span><p>{purposeDescription}</p></div></footer></article>;
    const blocked = !requirement.ready;
    const legacyRoleReview = !asset.factIds?.length && (kind === "comparison" || kind === "size");
    const status = blocked ? t("不可用", "Unavailable") : legacyRoleReview ? t("需重新检测", "Recheck required") : assetStatusName(asset.complianceStatus, language);
    return <article id={`asset-${asset.id}`} tabIndex={-1} className={`creative-asset asset-${asset.kind} ${blocked ? "asset-blocked" : ""} ${legacyRoleReview ? "asset-needs-review" : ""} ${focusTarget === `asset-${asset.id}` ? "focus-target" : ""}`} key={asset.id}><div><ResilientImage language={language} src={appPath(asset.url)} alt={purposeName} />{blocked && <span className="asset-overlay">{t("缺少商品信息 · 不能导出", "Missing product facts · cannot export")}</span>}{legacyRoleReview && <span className="asset-overlay asset-overlay-warning">{t("需要重新检查用途", "Role recheck required")}</span>}</div><footer><div className="asset-copy-meta"><b>{purposeName}</b><span className={blocked ? "asset-status blocked" : legacyRoleReview ? "asset-status pending" : `asset-status ${asset.complianceStatus}`}>{status}</span><p>{blocked ? requirementReason : legacyRoleReview ? t("该素材由旧版本生成，重新检查后才能确认它真的符合用途。", "This asset was created by an older version and needs a role recheck.") : purposeDescription}</p><small>{asset.factIds?.length ?? requirement.factIds.length} {t("条商品信息", "product facts")} · {blocked ? t("补充信息后重新检查", "Add facts and recheck") : legacyRoleReview ? t("等待用途检查", "Waiting for role check") : `${t("一致性", "Consistency")} ${Math.round(asset.consistencyScore * 100)}%`}</small></div><div className="asset-actions"><button type="button" disabled={busy || !aiReady || !workspace.truth.confirmedAt || blocked} onClick={() => onRegenerate(asset.id)}>{busy ? t("处理中…", "Working…") : t("重新生成", "Regenerate")}</button><label className={`asset-replace ${busy || !workspace.truth.confirmedAt ? "disabled" : ""}`}>{t("在此处替换", "Replace here")}<input type="file" accept="image/*" disabled={busy || !workspace.truth.confirmedAt} onChange={(event) => { const file = event.target.files?.[0]; if (file) onReplace(asset.id, file); event.target.value = ""; }} /></label></div></footer></article>;
  })}</div>;
}

// 保留旧组件仅用于兼容历史分支，当前界面统一使用单语言编辑器。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ListingEditorLegacy({ listing, outputLanguage, setListing }: { listing: ProjectWorkspace["listings"][number]; outputLanguage: OutputLanguage; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  const bulletsZh = Array.isArray(listing.bulletsZh) ? listing.bulletsZh.map(displayText) : [];
  const updateBulletTranslation = (index: number, value: string) => {
    const next = [...bulletsZh];
    while (next.length < listing.bullets.length) next.push("");
    next[index] = value;
    setListing({ bulletsZh: next });
  };
  const evidenced = listing.claims.filter((claim) => !claim.needsEvidence).length;
  return <div className={`listing-paper language-${outputLanguage}`}><header><div><span>{channelNames[listing.channel]}</span><b>{strategyName(listing.strategy)}</b></div><strong>{listing.score ? `得分 ${listing.score}` : "未生成"}</strong></header><p className="language-note">英文版用于美国渠道发布；中文译稿用于阅读、校对和定位修改。每条客观卖点必须关联商品信息；完成检查后才能导出。</p><div className={`fact-coverage ${listing.claims.length && evidenced === listing.claims.length ? "covered" : "needs-review"}`}><strong>商品信息来源</strong><span>{evidenced}/{listing.claims.length || 0} 条卖点已关联已确认信息</span>{listing.claims.filter((claim) => claim.needsEvidence).map((claim) => <em key={claim.text}>待证明：{claim.claimZh || claim.text}</em>)}</div><label>英文商品标题（发布） <small>{listing.title.length} 字符</small><textarea id={`listing-${listing.channel}-title`} value={listing.title} placeholder="AI 生成后显示，也可手动输入真实内容" onChange={(event) => setListing({ title: event.target.value })} /></label><label>中文商品标题（对照）<textarea id={`listing-${listing.channel}-titleZh`} value={listing.titleZh ?? ""} placeholder="AI 生成后会显示中文译稿" onChange={(event) => setListing({ titleZh: event.target.value })} /></label><div className="bilingual-section"><div className="bilingual-label">核心卖点（英文发布） / 中文对照</div>{listing.bullets.length ? listing.bullets.map((bullet, index) => <div className="bilingual-line" key={`${listing.channel}-bullet-${index}`}><span>{index + 1}</span><textarea id={`listing-${listing.channel}-bullet-${index}`} value={bullet} placeholder={`第 ${index + 1} 条英文卖点`} onChange={(event) => setListing({ bullets: listing.bullets.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><textarea id={`listing-${listing.channel}-bulletZh-${index}`} value={bulletsZh[index] ?? ""} placeholder="中文卖点对照" onChange={(event) => updateBulletTranslation(index, event.target.value)} /></div>) : <div className="empty-inline">暂无英文卖点</div>}</div><label>商品描述（英文发布）<textarea id={`listing-${listing.channel}-description`} value={listing.description} placeholder="商品描述" onChange={(event) => setListing({ description: event.target.value })} /></label><label>商品描述（中文对照）<textarea id={`listing-${listing.channel}-descriptionZh`} value={listing.descriptionZh ?? ""} placeholder="AI 生成后会显示中文译稿" onChange={(event) => setListing({ descriptionZh: event.target.value })} /></label>{listing.searchTerms !== undefined && <label>Search Terms（英文发布）<textarea id={`listing-${listing.channel}-searchTerms`} value={listing.searchTerms} placeholder="搜索词" onChange={(event) => setListing({ searchTerms: event.target.value })} /></label>}{listing.searchTerms !== undefined && <label>Search Terms（中文对照）<textarea id={`listing-${listing.channel}-searchTermsZh`} value={listing.searchTermsZh ?? ""} placeholder="搜索词中文说明" onChange={(event) => setListing({ searchTermsZh: event.target.value })} /></label>}{listing.metaTitle !== undefined && <label>SEO 标题（英文发布）<textarea id={`listing-${listing.channel}-metaTitle`} value={listing.metaTitle} placeholder="SEO 标题" onChange={(event) => setListing({ metaTitle: event.target.value })} /></label>}{listing.metaTitle !== undefined && <label>SEO 标题（中文对照）<textarea id={`listing-${listing.channel}-metaTitleZh`} value={listing.metaTitleZh ?? ""} placeholder="SEO 标题中文说明" onChange={(event) => setListing({ metaTitleZh: event.target.value })} /></label>}{listing.metaDescription !== undefined && <label>Meta Description（英文发布）<textarea id={`listing-${listing.channel}-metaDescription`} value={listing.metaDescription} placeholder="Meta Description" onChange={(event) => setListing({ metaDescription: event.target.value })} /></label>}{listing.metaDescription !== undefined && <label>Meta Description（中文对照）<textarea id={`listing-${listing.channel}-metaDescriptionZh`} value={listing.metaDescriptionZh ?? ""} placeholder="Meta Description 中文说明" onChange={(event) => setListing({ metaDescriptionZh: event.target.value })} /></label>}</div>;
}

function PlatformFieldEditor({ listing, outputLanguage, setListing }: { listing: ProjectWorkspace["listings"][number]; outputLanguage: OutputLanguage; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  const fields = Array.isArray(listing.platformFields) ? listing.platformFields : [];
  if (!fields.length) return null;
  const chinese = outputLanguage === "zh-CN";
  const update = (key: string, value: string) => setListing({ platformFields: fields.map((field) => field.key === key ? { ...field, ...(chinese ? { valueZh: value } : { value }), status: value.trim() ? "needs_review" : "missing" } : field) });
  return <section className="platform-fields"><header><div><strong>{chinese ? "平台发布信息" : "Platform publishing information"}</strong><span>{chinese ? "AI 会根据已确认商品信息自动填写；品牌、价格、库存等经营信息请你确认。" : "AI fills fields from confirmed product facts; confirm brand, price, stock and other business information."}</span></div><b>{fields.filter((field) => (chinese ? field.valueZh ?? "" : field.value).trim()).length}/{fields.length} {chinese ? "已填写" : "filled"}</b></header><div className="platform-field-grid">{fields.map((field) => <label key={field.key}><span>{chinese ? field.labelZh : field.label}{field.required && <em>{chinese ? "必填" : "Required"}</em>}</span><input value={chinese ? field.valueZh ?? "" : field.value} placeholder={chinese ? field.helpZh : field.label} onChange={(event) => update(field.key, event.target.value)} /><i className={field.status}>{field.status === "ready" ? (chinese ? "已准备" : "Ready") : field.status === "needs_review" ? (chinese ? "待确认" : "Review") : (chinese ? "待填写" : "Missing")}</i></label>)}</div></section>;
}

function ListingEditor(props: { listing: ProjectWorkspace["listings"][number]; outputLanguage: OutputLanguage; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  return <><PlatformFieldEditor listing={props.listing} outputLanguage={props.outputLanguage} setListing={props.setListing} /><SingleLanguageListingEditor {...props} /></>;
}

function SingleLanguageListingEditor({ listing, outputLanguage, setListing }: { listing: ProjectWorkspace["listings"][number]; outputLanguage: OutputLanguage; setListing: (patch: Partial<ProjectWorkspace["listings"][number]>) => void }) {
  const chinese = outputLanguage === "zh-CN";
  const t = (zh: string, en: string) => uiText(chinese ? "zh-CN" : "en-US", zh, en);
  const title = chinese ? listing.titleZh ?? "" : listing.title;
  const bullets = chinese ? (listing.bulletsZh ?? []) : listing.bullets;
  const description = chinese ? listing.descriptionZh : listing.description;
  const searchTerms = chinese ? listing.searchTermsZh || "" : listing.searchTerms || "";
  const metaTitle = chinese ? listing.metaTitleZh || "" : listing.metaTitle || "";
  const metaDescription = chinese ? listing.metaDescriptionZh || "" : listing.metaDescription || "";
  const update = (field: "title" | "description" | "searchTerms" | "metaTitle" | "metaDescription", value: string) => setListing({ [chinese ? `${field}Zh` : field]: value } as Partial<ProjectWorkspace["listings"][number]>);
  const updateBullet = (index: number, value: string) => {
    const next = [...bullets];
    next[index] = value;
    setListing({ [chinese ? "bulletsZh" : "bullets"]: next } as Partial<ProjectWorkspace["listings"][number]>);
  };
  const languageName = t("中文", "English");
  const evidenced = listing.claims.filter((claim) => !claim.needsEvidence).length;
  return <div className={`listing-paper language-${chinese ? "zh-CN" : "en-US"}`}><header><div><span>{channelNames[listing.channel]}</span><b>{strategyName(listing.strategy, chinese ? "zh-CN" : "en-US")}</b></div><strong>{listing.score ? `${chinese ? "得分" : "Score"} ${listing.score}` : chinese ? "未生成" : "Not generated"}</strong></header><p className="language-note">{chinese ? `当前为 ${languageName} 内容模式。生成、编辑和导出内容只显示一种语言，避免中英文混排。` : `Content mode: ${languageName}. Generation, editing and export use one language only.`}</p><div className={`fact-coverage ${listing.claims.length && evidenced === listing.claims.length ? "covered" : "needs-review"}`}><strong>{chinese ? "商品信息来源" : "Product fact sources"}</strong><span>{evidenced}/{listing.claims.length || 0} {chinese ? "条卖点已关联已确认信息" : "selling points linked to confirmed facts"}</span>{listing.claims.filter((claim) => claim.needsEvidence).map((claim) => <em key={claim.text}>{chinese ? "待证明：" : "Needs evidence: "}{chinese ? claim.claimZh || claim.text : claim.text}</em>)}</div><label>{chinese ? "商品标题" : "Product title"}<small>{title.length} {chinese ? "字符" : "characters"}</small><textarea id={`listing-${listing.channel}-title`} value={title} placeholder={chinese ? "生成后显示中文标题" : "Generated English title"} onChange={(event) => update("title", event.target.value)} /></label><div className="single-language-bullets"><span>{chinese ? "核心卖点" : "Key selling points"}</span>{bullets.length ? bullets.map((bullet, index) => <div key={`${listing.channel}-bullet-${index}`}><i>{index + 1}</i><textarea id={`listing-${listing.channel}-bullet-${index}`} aria-label={`${chinese ? "第" : "Bullet "} ${index + 1}${chinese ? "条卖点" : ""}`} value={bullet} placeholder={chinese ? "中文卖点" : "English bullet point"} onChange={(event) => updateBullet(index, event.target.value)} /></div>) : <div className="empty-inline">{chinese ? "暂无中文卖点" : "No English selling points yet"}</div>}</div><label>{chinese ? "商品描述" : "Product description"}<textarea id={`listing-${listing.channel}-description`} value={description} placeholder={chinese ? "生成后显示中文描述" : "Generated English description"} onChange={(event) => update("description", event.target.value)} /></label>{listing.searchTerms !== undefined && <label>{chinese ? "搜索词" : "Search terms"}<textarea id={`listing-${listing.channel}-searchTerms`} value={searchTerms} placeholder={chinese ? "中文搜索词" : "English search terms"} onChange={(event) => update("searchTerms", event.target.value)} /></label>}{listing.metaTitle !== undefined && <label>{chinese ? "SEO 标题" : "SEO title"}<textarea id={`listing-${listing.channel}-metaTitle`} value={metaTitle} placeholder={chinese ? "中文 SEO 标题" : "English SEO title"} onChange={(event) => update("metaTitle", event.target.value)} /></label>}{listing.metaDescription !== undefined && <label>{chinese ? "SEO 描述" : "SEO description"}<textarea id={`listing-${listing.channel}-metaDescription`} value={metaDescription} placeholder={chinese ? "中文 SEO 描述" : "English SEO description"} onChange={(event) => update("metaDescription", event.target.value)} /></label>}</div>;
}

function PagePreview({ workspace, channel }: { workspace: ProjectWorkspace; channel: Channel }) {
  const modules = workspace.details[channel] ?? [];
  if (!modules.length) return <div className="empty-panel large"><b>尚未生成详情页模块</b><p>生成后这里会展示该渠道独立的模块结构与真实文案。</p></div>;
  const chinese = workspace.outputLanguage === "zh-CN";
  const channelAssets = workspace.assets.filter((asset) => asset.channel === channel);
  const factNames = new Map(workspace.truth.attributes.map((fact) => [fact.id, chinese ? `${fact.nameZh || "商品信息"} · ${fact.valueZh || ""}` : `${fact.name} · ${fact.value}`]));
  return <div className="page-browser"><header><i /><i /><i /><span>{channelNames[channel]} / {chinese ? "中文详情页预览" : "English product page preview"}</span></header><div className="page-proof"><strong>{chinese ? "真实素材已嵌入预览" : "Real assets are included"}</strong><span>{chinese ? "图片、文案与商品规格保持同一版本。" : "Images, copy and product facts use the same confirmed version."}</span></div>{modules.map((module, index) => {
    const kind = assetKindForModule(module.type);
    const asset = module.assetIds.map((id) => channelAssets.find((item) => item.id === id)).find(Boolean) ?? (kind ? channelAssets.find((item) => item.kind === kind) : undefined);
    return <section className={`detail-module-preview detail-module-${module.type} ${index === 0 ? "detail-module-first" : ""}`} key={module.id}>{asset && <div className="detail-module-media"><ResilientImage language={chinese ? "zh-CN" : "en-US"} src={appPath(asset.url)} alt={`${chinese ? assetPurpose[asset.kind].nameZh : assetPurpose[asset.kind].name} · ${chinese ? module.titleZh : module.title}`} /><span>{chinese ? assetPurpose[asset.kind].nameZh : assetPurpose[asset.kind].name}</span></div>}<div className="detail-module-copy"><small>{detailTypeName(module.type, chinese ? "zh-CN" : "en-US")} · {chinese ? "第" : "Module "} {index + 1} {chinese ? "个模块" : ""}</small><h2>{chinese ? module.titleZh : module.title}</h2><p>{chinese ? module.bodyZh : module.body}</p>{module.factIds.length > 0 && <div className="module-facts"><span>{chinese ? "商品信息来源" : "Product facts"}</span>{module.factIds.map((factId) => <em key={factId}>{factNames.get(factId) || (chinese ? "商品信息已更新，请重新生成" : "Product facts changed; regenerate this module")}</em>)}</div>}</div></section>;
  })}</div>;
}

function ComplianceCenter({ language, workspace, busy, aiReady, pendingFindingIds, onScan, onFix, onOptimizeFinding, onOptimizeAll, onLocate }: { language: UiLanguage; workspace: ProjectWorkspace; busy: boolean; aiReady: boolean; pendingFindingIds: string[]; onScan: (channel: Channel) => void; onFix: (channel: Channel) => void; onOptimizeFinding: (finding: ComplianceFinding, channel: Channel) => void; onOptimizeAll: (channel: Channel) => void; onLocate: (finding: ComplianceFinding) => void }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const [selectedChannel, setSelectedChannel] = useState<Channel>(workspace.project.channels[0] ?? "amazon-us");
  const [exporting, setExporting] = useState<Channel | null>(null);
  const [exportError, setExportError] = useState("");
  const currentChannel = workspace.project.channels.includes(selectedChannel) ? selectedChannel : workspace.project.channels[0] ?? "amazon-us";
  const allOpen = workspace.findings.filter((finding) => finding.status === "open");
  const open = allOpen.filter((finding) => finding.location?.channel === currentChannel);
  const channelAssets = workspace.assets.filter((asset) => asset.channel === currentChannel);
  const failedAssets = channelAssets.filter((asset) => asset.complianceStatus === "failed");
  const selectedListing = workspace.listings.find((listing) => listing.channel === currentChannel);
  const hasCompletedCheck = workspace.tasks.some((task) => task.type === "compliance" && task.status === "completed" && task.channel === currentChannel);
  const activeTasks = workspace.tasks.filter((task) => task.type === "compliance" && task.channel === currentChannel && (task.status === "queued" || task.status === "running"));
  const latestOptimizationFailure = [...workspace.tasks].reverse().find((task) => task.type === "compliance" && task.channel === currentChannel && (task.operation === "optimize_finding" || task.operation === "optimize_all") && task.status === "completed" && task.failureReasons?.length);
  const activeOptimization = activeTasks.some((task) => task.operation === "optimize_all");
  const selectedHasContent = Boolean(selectedListing?.title.trim()) || (workspace.details[currentChannel] ?? []).length > 0 || channelAssets.length > 0;
  const channelReady = (channel: Channel) => {
    const listing = workspace.listings.find((item) => item.channel === channel);
    const assets = workspace.assets.filter((item) => item.channel === channel);
    const risks = allOpen.filter((finding) => finding.location?.channel === channel);
    const checked = workspace.tasks.some((task) => task.type === "compliance" && task.status === "completed" && task.channel === channel);
    return Boolean(workspace.truth.confirmedAt && checked && listing?.title.trim() && assets.length > 0 && risks.length === 0 && assets.every((asset) => asset.complianceStatus === "passed"));
  };
  const downloadExport = async (targetChannel: Channel) => {
    setExporting(targetChannel); setExportError("");
    try {
      const response = await fetch(appPath(`/api/projects/${workspace.project.id}/export?channel=${encodeURIComponent(targetChannel)}`));
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `导出失败（${response.status}）`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `crosslaunch-${targetChannel}-${workspace.project.id}.zip`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "导出失败，请查看服务器日志后重试。");
    } finally { setExporting(null); }
  };
  return <section className="focused-space publish-space">
    <SpaceIntro number="03" label={t("检查与导出", "Compliance & export")} title={t("按平台分别检查，再分别导出。", "Check and export one platform at a time.")} text={t("每个平台只检查自己的上架规则、Listing、详情页和图片。修复当前平台后，另外两个平台的结果不会被混入或覆盖。", "Each platform checks only its own listing rules, copy, product page and images. Fixing one platform never mixes with or overwrites the other two.")} />
    <div className="compliance-channel-tabs" role="tablist" aria-label={t("选择要检查的平台", "Choose a platform to check")}>
      {workspace.project.channels.map((item) => {
        const risks = allOpen.filter((finding) => finding.location?.channel === item).length;
        const checked = workspace.tasks.some((task) => task.type === "compliance" && task.status === "completed" && task.channel === item);
        return <button key={item} type="button" role="tab" aria-selected={currentChannel === item} className={currentChannel === item ? "active" : ""} onClick={() => setSelectedChannel(item)}><span>{channelNames[item]}</span><b>{risks ? `${risks} ${t("项风险", "risks")}` : checked ? t("已检查", "Checked") : t("尚未检查", "Not checked")}</b></button>;
      })}
    </div>
    <div className="publish-overview"><div className="readiness-copy"><span>{channelNames[currentChannel]} · {open.length ? t("需要处理", "Needs attention") : hasCompletedCheck ? t("已检查", "Checked") : t("尚未检查", "Not checked")}</span><h2>{open.length ? `${open.length} ${t("项风险", "risks")}` : hasCompletedCheck ? t("当前平台没有未处理发现", "No unresolved findings for this platform") : t("请选择开始检查", "Start the platform check")}</h2><p>{t("这是上线前的风险筛查，不代替平台审核、检测认证或法律意见。", "This is a pre-launch risk screen. It does not replace platform review, testing, certification or legal advice.")}{failedAssets.length ? ` ${failedAssets.length} ${t("张图片需要重新生成或替换。", "image(s) need regeneration or replacement.")}` : ""}</p></div><button className="main-action" disabled={busy || !selectedHasContent || Boolean(selectedListing && !selectedListing.title.trim())} onClick={() => onScan(currentChannel)}>{busy ? t("检测中…", "Checking…") : `${t("检查", "Check")} ${channelNames[currentChannel]}`}</button></div>
    <div className="publish-grid"><section className="channel-readiness"><header><span>{t("当前平台检查范围", "Current platform checks")}</span><small>{t("美国市场", "US market")}</small></header>{[currentChannel].map((item) => { const rules = rulesForChannel(workspace, item); return <article key={item} className="selected"><div className="channel-logo">{channelNames[item][0]}</div><div><h3>{channelNames[item]}</h3><p>{coverageName(workspace.project.coverage[item], language)}</p><details><summary>{t("查看该平台官方检查项目", "View this platform's official checks")} <span>{rules.length} {t("项", "items")}</span></summary><ul>{rules.map((rule) => { const source = (workspace.sources.length ? workspace.sources : ruleSources).find((entry) => entry.id === rule.sourceId); const copy = ruleCopy(rule.id, language, rule.message, rule.suggestion); return <li key={rule.id}><b>{ruleName(rule.id, language)}</b><span>{source?.authority} · {source?.title}</span><em>{copy.message}</em></li>; })}</ul></details></div></article>; })}</section><section className="risk-focus"><header className="risk-header"><div><span>{channelNames[currentChannel]} · {t("检查结果", "Check results")}</span><small>{open.length} {t("项", "items")}</small></div>{open.length ? <div className="risk-actions"><button className="main-action" onClick={() => onOptimizeAll(currentChannel)} disabled={busy || !aiReady || activeOptimization}>{activeOptimization ? t("一键优化任务处理中…", "Bulk optimization in progress…") : aiReady ? t("优化该平台全部风险并复查", "Optimize all risks for this platform") : t("配置 AI 后可一键优化", "Configure AI to optimize")}</button><button className="secondary-action" onClick={() => onFix(currentChannel)} disabled={busy}>{t("清理该平台文字并复查", "Clean this platform's text and recheck")}</button></div> : null}</header>{latestOptimizationFailure && <div className="optimization-failure-summary" role="alert"><b>{t("本次自动优化未完成", "Automatic optimization needs input")}</b>{latestOptimizationFailure.failureReasons?.map((item, index) => <p key={`${item.target}-${index}`}><span>{item.target}</span>{item.message}</p>)}</div>}<div className="risk-list">{open.length ? open.map((finding) => { const source = (workspace.sources.length ? workspace.sources : ruleSources).find((item) => item.id === finding.sourceId); const pending = pendingFindingIds.includes(finding.id); const findingTask = activeTasks.find((task) => task.targetFindingIds?.includes(finding.id)); const progress = findingTask?.progress; const percent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0; const excerpt = language === "zh-CN" ? finding.excerptZh || finding.excerpt : finding.excerpt; const explanation = language === "zh-CN" ? finding.explanationZh || finding.explanation : finding.explanation; const suggestion = language === "zh-CN" ? finding.suggestionZh || finding.suggestion : finding.suggestion; return <article key={finding.id}><i className={finding.severity}>!</i><div><span>{severityName(finding.severity, language)} · {locationLabel(finding.location!, language)}</span><h3>{excerpt}</h3><p>{explanation}</p><strong>{t("建议：", "Suggestion: ")}{suggestion}</strong><div className="finding-actions"><button type="button" className="finding-locate" onClick={() => onLocate(finding)}>{t("定位并编辑：", "Locate and edit: ")}{locationLabel(finding.location!, language)} →</button><button type="button" className="finding-optimize" disabled={pending || !aiReady || Boolean(findingTask)} onClick={() => onOptimizeFinding(finding, currentChannel)}>{pending ? t("已提交，处理中…", "Submitted…") : findingTask ? t("任务处理中…", "Task in progress…") : aiReady ? t("AI 优化此项并复查", "Optimize this item and recheck") : t("配置 AI 后可优化", "Configure AI to optimize")}</button>{source ? <a href={source.url} target="_blank" rel="noreferrer">{t("查看该平台官方规则来源 ↗", "View this platform's official source ↗")}</a> : <span>{t("规则来源缺失", "Rule source unavailable")}</span>}</div>{findingTask && <div className="finding-task-progress" role="status" aria-live="polite"><div className="finding-task-progress-head"><strong>{findingTask.operation === "optimize_all" ? t("该平台一键优化任务", "Platform bulk optimization") : t("正在优化此项", "Optimizing this item")}</strong><span>{progress ? `${progress.completed}/${progress.total} ${t("项 · 成功", "items · succeeded")} ${progress.succeeded} · ${t("待复核", "needs review")} ${progress.failed}` : t("任务排队中…", "Queued…")}</span></div>{progress && <><div className="task-progress-track"><i style={{ width: `${percent}%` }} /></div><small>{progress.current || t("正在准备优化…", "Preparing optimization…")}</small></>}</div>}</div></article>; }) : <div className="empty-panel"><b>{hasCompletedCheck ? t("该平台暂无风险记录", "No findings for this platform") : t("该平台尚未检查", "This platform has not been checked")}</b><p>{hasCompletedCheck ? t("可以查看下方平台状态；如修改了内容，请重新检查该平台。", "Review the platform status below; if content changes, check this platform again.") : t("只会检查当前选中的平台，不会把其他平台的结果混进来。", "Only the selected platform will be checked; other platforms are not mixed in.")}</p></div>}</div></section></div>
    <DeliveryGuide language={language} workspace={workspace} />
    <section className="platform-export-panel"><header><div><span>{t("单个平台发布包", "Single-platform delivery packages")}</span><h2>{t("每个平台单独检查、单独下载", "Check and download each platform separately")}</h2></div><p>{t("只有当前平台通过检查，才会开放该平台的下载按钮。三个 ZIP 互不混用。", "A platform download is enabled only after that platform passes. The three ZIP files are independent.")}</p></header><div className="platform-export-grid">{workspace.project.channels.map((item) => { const ready = channelReady(item); const risks = allOpen.filter((finding) => finding.location?.channel === item).length; return <article key={item} className={`platform-export-card ${item === currentChannel ? "selected" : ""}`}><div><h3>{channelNames[item]}</h3><p>{risks ? `${risks} ${t("项风险待处理", "risks need attention")}` : ready ? t("已检查通过，可下载", "Checked and ready") : t("需要先完成该平台检查", "Complete this platform check first")}</p></div><button type="button" disabled={!ready || exporting !== null} onClick={() => { setSelectedChannel(item); void downloadExport(item); }}>{exporting === item ? t("正在生成发布包…", "Preparing package…") : t("下载该平台发布包", "Download this platform package")}</button></article>; })}</div>{exportError && <p className="export-error" role="alert">{t("导出错误：", "Export error: ")}{exportError}</p>}</section>
  </section>;
}

function DeliveryGuide({ language, workspace }: { language: UiLanguage; workspace: ProjectWorkspace }) {
  const t = (zh: string, en: string) => uiText(language, zh, en);
  const specs: Record<Channel, { need: string; ready: string; note: string; tag: string; officialRules: string[] }> = language === "zh-CN" ? {
    "amazon-us": { need: "标题 · 最多 5 条卖点 · 描述 · 搜索词 · 主图/附图 · 品牌/编码/售价/库存/配送", ready: "发布字段表 + 图片顺序 + 详情页文案", note: "批量上传前，先下载 Amazon 当前叶子类目的官方 Inventory File Template；本包字段表用于复制填入官方模板。", tag: "复制到 Seller Central", officialRules: ["主图为实际商品和纯白背景，不得有文字、Logo、水印、边框或误导性道具。", "标题、卖点、描述和图片必须准确描述实际销售商品，不得放卖家促销、联系方式或未经证实的参数。", "商品详情页还要补齐数量、价格、商品状态、配送和类目所需字段。"] },
    "tiktok-us": { need: "标题 · 描述 · 叶子类目 · 规格/变体 · 至少 5 张图 · 售价/库存/编码/物流", ready: "发布字段表 + 图片顺序 + 详情页文案", note: "批量发布时，使用 Seller Center 当前叶子类目生成的官方 Excel；本包字段表用于复制填入官方模板。", tag: "复制到 Seller Center", officialRules: ["商品发布包括基础信息、商品详情、销售和物流；部分类目还要求认证或法定警示。", "最多 9 张方图、至少 600×600；主图使用纯白背景，图片不能有文字、Logo、水印、边框或遮挡。", "不能放网址、二维码、站外联系方式、折扣、Best Seller、Buy Now 等内容。"] },
    "shopify-us": { need: "产品 CSV · 图片 HTTPS 地址 · Vendor · SKU/售价/库存 · 分类/标签 · SEO", ready: "标准产品 CSV + 详情页 HTML + 图片文件夹", note: "先把图片上传到 Shopify Files 或其他公开 HTTPS 地址，再填写 Image Src；导入后建议先保持 draft。", tag: "CSV 可导入", officialRules: ["新建商品的 Title 必填，CSV 第一行必须使用 Shopify 官方字段名并保存为 UTF-8。", "图片必须是可用图片 URL；本地 ZIP 中的图片不能直接作为 Image Src。", "SEO Title 建议不超过 70 个字符，SEO Description 建议不超过 320 个字符。"] },
  } : {
    "amazon-us": { need: "Title · Up to 5 bullets · Description · Search terms · Main/supporting images · Brand/ID/price/stock/fulfillment", ready: "Publishing field sheet + image order + product copy", note: "For bulk upload, first download the official Inventory File Template for the current Amazon leaf category. Copy this package’s fields into that template.", tag: "Copy to Seller Central", officialRules: ["The main image must show the actual product on pure white, with no text, logo, watermark, border or misleading props.", "Titles, bullets, descriptions and images must accurately describe the product; seller promotions, contact details and unsupported parameters are not allowed.", "Complete quantity, price, condition, fulfillment and category fields before publishing."] },
    "tiktok-us": { need: "Title · Description · Leaf category · Variations · At least 5 images · Price/stock/ID/shipping", ready: "Publishing field sheet + image order + product copy", note: "For bulk publishing, use the official Excel generated for the current Seller Center leaf category. Copy this package’s fields into that template.", tag: "Copy to Seller Center", officialRules: ["Product setup includes basic information, product details, sales and shipping; some categories require certifications or legal warnings.", "Use up to 9 square images at least 600×600; the main image should be pure white with no text, logo, watermark, border or obstruction.", "Do not include URLs, QR codes, off-platform contact details, discounts, Best Seller or Buy Now claims."] },
    "shopify-us": { need: "Product CSV · HTTPS image URLs · Vendor · SKU/price/stock · Category/tags · SEO", ready: "Standard product CSV + product-page HTML + image folder", note: "Upload images to Shopify Files or another public HTTPS host before filling Image Src. Keep the imported product as draft until store details are confirmed.", tag: "CSV import ready", officialRules: ["Title is required for new products; use Shopify’s official headers and save the CSV as UTF-8.", "Images must use working image URLs; local ZIP images cannot be used directly as Image Src.", "Keep SEO Title within about 70 characters and SEO Description within about 320 characters."] },
  };
  return <section className="delivery-guide"><header><div><span>{t("交付说明", "Delivery guide")}</span><h2>{t("下载后，按平台直接使用", "Download and use by platform")}</h2></div><p>{t("三个平台的上传格式不同，系统已把可以直接使用和还需要补充的内容分开标注。", "Each platform has a different upload format. Ready-to-use files and items that still need your input are clearly separated.")}</p></header><div className="delivery-grid">{workspace.project.channels.map((channel) => { const spec = specs[channel]; return <article className={`delivery-card ${channel}`} key={channel}><div className="delivery-card-head"><div className="channel-logo">{channelNames[channel][0]}</div><div><h3>{channelNames[channel]}</h3><span>{spec.tag}</span></div></div><dl><div><dt>{t("平台需要", "Platform needs")}</dt><dd>{spec.need}</dd></div><div><dt>{t("本包已准备", "Included in this package")}</dt><dd>{spec.ready}</dd></div></dl><p className="delivery-note">{spec.note}</p><details><summary>{t("官方规则要点", "Official rule highlights")}</summary><ul>{spec.officialRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></details><a href={channel === "shopify-us" ? "https://help.shopify.com/en/manual/products/import-export/using-csv" : channel === "tiktok-us" ? "https://seller-us.tiktok.com/university/essay?knowledge_id=428445525411626" : "https://sellercentral.amazon.com/"} target="_blank" rel="noreferrer">{t("查看平台官方说明 ↗", "View official platform guidance ↗")}</a></article>; })}</div></section>;
}

function SpaceIntro({ number, label, title, text, compact = false }: { number: string; label: string; title: string; text: string; compact?: boolean }) {
  return <div className={`space-intro ${compact ? "compact" : ""}`}><div><i>{number}</i><span>{label}</span></div><h1>{title}</h1><p>{text}</p></div>;
}

function errorText(cause: unknown) { return cause instanceof Error ? cause.message : "操作失败。"; }
function displayText(value: unknown) { return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value); }
function workspaceFingerprint(workspace: ProjectWorkspace) { return JSON.stringify({ ...workspace, project: { ...workspace.project, updatedAt: "" } }); }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function translationNeeded(workspace: ProjectWorkspace) {
  const hasText = (value: unknown) => displayText(value).trim().length > 0;
  const categoryNeedsTranslation = Boolean(hasText(workspace.truth.category) && !hasText(workspace.truth.categoryZh));
  const factsNeedTranslation = workspace.truth.attributes.some((fact) => !hasText(fact.nameZh) || !hasText(fact.valueZh));
  const listingsNeedTranslation = workspace.listings.some((listing) => hasText(listing.title) && (!hasText(listing.titleZh) || !hasText(listing.descriptionZh) || listing.bullets.some((_, index) => !hasText(listing.bulletsZh?.[index])) || Boolean(hasText(listing.searchTerms) && !hasText(listing.searchTermsZh)) || Boolean(hasText(listing.metaTitle) && !hasText(listing.metaTitleZh)) || Boolean(hasText(listing.metaDescription) && !hasText(listing.metaDescriptionZh))));
  const detailsNeedTranslation = Object.values(workspace.details).some((modules) => modules.some((module) => !hasText(module.titleZh) || !hasText(module.bodyZh)));
  return categoryNeedsTranslation || factsNeedTranslation || listingsNeedTranslation || detailsNeedTranslation;
}
function complianceTargetId(location: ComplianceLocation) {
  if (location.kind === "asset") return `asset-${location.assetId}`;
  const suffix = location.field === "bullet" ? `-${location.index ?? 0}` : "";
  return `listing-${location.channel}-${location.field ?? "description"}${suffix}`;
}
function locationLabel(location: ComplianceLocation, language: UiLanguage = "zh-CN") {
  if (location.kind === "asset") return `${channelNames[location.channel]} · ${uiText(language, "商品图片", "Product image")}`;
  const labels = language === "zh-CN" ? { title: "英文标题", bullet: `第 ${(location.index ?? 0) + 1} 条英文卖点`, description: "英文商品描述", searchTerms: "英文搜索词", metaTitle: "英文 SEO 标题", metaDescription: "英文 Meta Description", detailTitle: "详情页标题", detailBody: "详情页正文" } : { title: "English title", bullet: `English bullet ${(location.index ?? 0) + 1}`, description: "English description", searchTerms: "English search terms", metaTitle: "English SEO title", metaDescription: "English Meta Description", detailTitle: "Product page title", detailBody: "Product page body" };
  return `${channelNames[location.channel]} · ${labels[location.field ?? "description"]}`;
}
function statusName(status: LaunchProject["status"], language: UiLanguage = "zh-CN") { return (language === "zh-CN" ? { queued: "待开始", running: "进行中", needs_review: "待审核", failed: "失败", completed: "已完成" } : { queued: "Queued", running: "In progress", needs_review: "Needs review", failed: "Failed", completed: "Completed" })[status]; }
function coverageName(status: "full" | "partial" | "unsupported", language: UiLanguage = "zh-CN") { return status === "full" ? uiText(language, "已发布规则包完整覆盖", "Published rule package coverage") : status === "partial" ? uiText(language, "部分覆盖，需要人工复核", "Partial coverage; manual review required") : uiText(language, "暂未覆盖，需要人工审核", "Not covered; manual review required"); }
function assetStatusName(status: "pending" | "passed" | "failed", language: UiLanguage = "zh-CN") { return status === "passed" ? uiText(language, "已通过", "Passed") : status === "failed" ? uiText(language, "需替换", "Replace") : uiText(language, "待复检", "Recheck"); }
function strategyName(strategy: "seo" | "brand" | "conversion", language: UiLanguage = "zh-CN") { return (language === "zh-CN" ? { seo: "搜索优化", brand: "品牌表达", conversion: "转化优先" } : { seo: "SEO", brand: "Brand", conversion: "Conversion" })[strategy]; }
function detailTypeName(type: string, language: UiLanguage = "zh-CN") { return (language === "zh-CN" ? { hero: "首屏介绍", benefits: "核心优势", scenario: "使用场景", comparison: "特征对比", specs: "规格信息", steps: "使用步骤", faq: "常见问题", reason: "选择理由" } : { hero: "Hero", benefits: "Key benefits", scenario: "Use case", comparison: "Comparison", specs: "Specifications", steps: "How to use", faq: "FAQ", reason: "Why choose it" } as Record<string, string>)[type] ?? uiText(language, "详情模块", "Product-page module"); }
function severityName(severity: "high" | "medium" | "low", language: UiLanguage = "zh-CN") { return (language === "zh-CN" ? { high: "高风险", medium: "中风险", low: "低风险" } : { high: "High risk", medium: "Medium risk", low: "Low risk" })[severity]; }
function hasGeneratedContent(workspace: ProjectWorkspace | null) {
  if (!workspace) return false;
  const hasListing = workspace.listings.some((listing) => [listing.title, listing.description, ...listing.bullets].some((value) => displayText(value).trim().length > 0));
  return hasListing || Object.values(workspace.details).some((modules) => modules.length > 0) || workspace.assets.length > 0;
}
function rulesForChannel(workspace: ProjectWorkspace, channel: Channel) {
  const category = workspace.truth.category.trim().toLowerCase();
  const explicit = complianceRules.filter((rule) => rule.channels.includes(channel) && (rule.categories.includes("*") || rule.categories.some((item) => item === category)));
  const knownSources = new Set(explicit.map((rule) => rule.sourceId));
  const officialSourceRules = (workspace.sources.length ? workspace.sources : ruleSources).filter((source) => source.platform === channel && !knownSources.has(source.id)).map((source) => ({ id: `official-source-${source.id}`, sourceId: source.id, scope: "platform" as const, target: "all" as const, severity: "low" as const, categories: ["*"], channels: [channel], message: source.excerpt, suggestion: "打开官方页面，按当前页面要求人工确认并补齐。" }));
  return [...explicit, ...officialSourceRules];
}
const ruleNames = {
  "fact-evidence": ["商品信息证据", "Product-fact evidence"],
  "claim-absolute": ["绝对化和保证性用语", "Absolute, ranking or guarantee claims"],
  "fact-duration": ["时长、数量等数字信息", "Duration and numeric claims"],
  "health-treatment": ["健康或治疗效果表述", "Health or treatment claims"],
  "amazon-main-promo": ["Amazon 主图要求", "Amazon main-image requirements"],
  "amazon-detail-rules": ["Amazon 商品详情页规则", "Amazon product-page rules"],
  "tiktok-title-clickbait": ["TikTok 标题规范", "TikTok title rules"],
  "tiktok-off-platform": ["TikTok 禁止站外导流", "TikTok off-platform promotion"],
  "tiktok-all-caps": ["TikTok 标题大小写", "TikTok title capitalization"],
  "asset-role-facts": ["图片用途和商品信息一致", "Asset role must match product facts"],
  "visual-asset-review": ["图片真实性和用途检查", "Image authenticity and role check"],
  "shopify-external-link": ["Shopify 商品描述链接", "Shopify product-description links"],
  "shopify-seo-length": ["Shopify SEO 字段长度", "Shopify SEO field length"],
} as Record<string, [string, string]>;
const ruleEnglishCopy: Record<string, [string, string]> = {
  "fact-evidence": ["This product claim is not supported by a confirmed product fact.", "Link a confirmed fact and evidence, or remove the unsupported claim."],
  "claim-absolute": ["This absolute, ranking or guarantee claim may lack sufficient evidence.", "Rewrite it as a verifiable product structure, condition or test result."],
  "fact-duration": ["This numeric claim needs a confirmed product fact or test evidence.", "Link a confirmed fact and evidence, or remove the unverified number."],
  "health-treatment": ["This beauty claim may imply treatment of disease or an effect on body structure or function.", "Use cosmetic wording such as appearance, cleansing or moisturizing, then verify supporting evidence."],
  "amazon-main-promo": ["Amazon main images cannot contain promotional text, watermarks or props not included with the product.", "Use a pure white background and keep only the actual product for sale."],
  "amazon-detail-rules": ["Amazon product pages cannot include seller promotions, contact details or off-platform links.", "Remove promotions, contact details and external links; keep only product information."],
  "tiktok-title-clickbait": ["The TikTok Shop title contains clickbait or promotional wording.", "Keep accurate category, attribute, specification and use-case information."],
  "tiktok-off-platform": ["TikTok Shop content cannot direct shoppers away from the platform.", "Remove URLs, social accounts, QR codes and external contact details."],
  "tiktok-all-caps": ["TikTok Shop does not recommend using all-caps words throughout the content.", "Use normal capitalization for clear, readable product copy."],
  "shopify-external-link": ["The Shopify product description contains an external link that cannot be verified.", "Remove the link or confirm that it is long-term valid and belongs to your store."],
  "shopify-seo-length": ["Shopify SEO titles should stay within about 70 characters.", "Shorten the SEO title while keeping the product name and key attributes."],
  "asset-role-facts": ["Dimension and feature images can show only confirmed product facts; a generic product image is not a substitute.", "Add and confirm the relevant fact, regenerate the image, or replace it with a real asset."],
  "visual-asset-review": ["This image needs a manual asset-quality or product-consistency review.", "Regenerate or replace the image using confirmed product facts and official platform requirements."],
};
function ruleName(ruleId: string, language: UiLanguage = "zh-CN") { const pair = ruleNames[ruleId] ?? ["官方平台规则要点", "Official platform rule"]; return pair[language === "zh-CN" ? 0 : 1]; }
function ruleCopy(ruleId: string, language: UiLanguage, message: string, suggestion: string) { if (language === "zh-CN") return { message, suggestion }; const pair = ruleEnglishCopy[ruleId]; return pair ? { message: pair[0], suggestion: pair[1] } : { message, suggestion };
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useState } from "react";
import type { Channel, ProductTruthProfile, ProjectWorkspace } from "../../lib/domain";
import { cloneFixture } from "../../lib/fixtures";
import { loadWorkspace, runWorkflow, saveWorkspace } from "../../lib/api-client";
import { ChannelPanel } from "./channel-panel";
import { CompliancePanel } from "./compliance-panel";
import { ProductBottle, StageHeading, StatusDot } from "./shared";
import { TruthPanel } from "./truth-panel";

type Step = "projects" | "truth" | "assets" | "content" | "compliance" | "export";
const steps: Array<{ id: Step; label: string }> = [{ id: "projects", label: "项目中心" }, { id: "truth", label: "商品事实" }, { id: "assets", label: "素材矩阵" }, { id: "content", label: "三渠道内容" }, { id: "compliance", label: "合规证据链" }, { id: "export", label: "版本与导出" }];

export function V2Studio() {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(() => cloneFixture());
  const [active, setActive] = useState<Step>("projects");
  const [channel, setChannel] = useState<Channel>("amazon-us");
  const [storage, setStorage] = useState("fixture");
  const [versions, setVersions] = useState<Array<{ id: string; version: number; reason: string; createdAt: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Fixture 模式已就绪");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => { loadWorkspace().then((result) => { setWorkspace(result.workspace); setStorage(result.storage); setVersions(result.versions); }); }, []);

  const execute = async (action: "analyze" | "confirm_truth" | "generate" | "scan" | "apply_fixes", next: Step) => {
    setBusy(true); setNotice("工作流正在运行...");
    const result = await runWorkflow(workspace.project.id, action, workspace);
    setWorkspace(result.workspace); setStorage(result.storage); setActive(next); setBusy(false); setNotice(`${action} 已完成`);
  };
  const persist = async (reason: string) => { setBusy(true); const result = await saveWorkspace(workspace, reason); setStorage(result.storage); setNotice(`已保存版本 v${result.version}`); setBusy(false); };
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (imageUrl) URL.revokeObjectURL(imageUrl); setImageUrl(URL.createObjectURL(file)); setNotice(`已载入 ${file.name}`); };
  const currentListing = workspace.listings.find((item) => item.channel === channel) ?? workspace.listings[0];
  const currentModules = workspace.details[channel] ?? [];
  const blocking = workspace.findings.some((item) => item.severity === "high" && item.status === "open");
  const progress = Math.round(((steps.findIndex((step) => step.id === active) + 1) / steps.length) * 100);

  const panel = (() => {
    if (active === "projects") return <ProjectCenter workspace={workspace} imageUrl={imageUrl} onUpload={handleUpload} onAnalyze={() => execute("analyze", "truth")} />;
    if (active === "truth") return <TruthPanel truth={workspace.truth} onChange={(truth: ProductTruthProfile) => setWorkspace({ ...workspace, truth })} onConfirm={() => execute("confirm_truth", "assets")} busy={busy} />;
    if (active === "assets") return <AssetMatrix workspace={workspace} imageUrl={imageUrl} onGenerate={() => execute("generate", "content")} />;
    if (active === "content") return <ChannelPanel channel={channel} listing={currentListing} modules={currentModules} truth={workspace.truth} coverage={workspace.project.coverage[channel]} onChannel={setChannel} onListing={(listing) => setWorkspace({ ...workspace, listings: workspace.listings.map((item) => item.channel === listing.channel ? listing : item) })} onModules={(modules) => setWorkspace({ ...workspace, details: { ...workspace.details, [channel]: modules } })} onScan={() => execute("scan", "compliance")} />;
    if (active === "compliance") return <CompliancePanel findings={workspace.findings} sources={workspace.sources} coverage={workspace.project.coverage[channel]} channel={channel} onFix={() => execute("apply_fixes", "export")} busy={busy} />;
    return <ExportPanel workspace={workspace} versions={versions} blocking={blocking} onSave={() => persist("人工保存版本")} />;
  })();

  return <main className="app-shell v2-shell">
    <aside className="sidebar v2-sidebar"><div className="brand-lockup"><div className="brand-mark"><span>C</span></div><div><strong>上新无界</strong><small>CrossLaunch AI · V2</small></div></div><div className="project-label">当前项目</div><div className="project-card"><div className="project-thumb"><ProductBottle compact /></div><div><strong>{workspace.project.productName}</strong><small>3 channels · {workspace.truth.category}</small></div></div><nav className="step-nav">{steps.map((step, index) => <button key={step.id} className={active === step.id ? "active" : ""} onClick={() => setActive(step.id)}><span>{String(index + 1).padStart(2, "0")}</span>{step.label}</button>)}</nav><div className="workflow-mini"><span>模型工作流</span>{workspace.tasks.slice(-3).map((task) => <div key={task.id}><StatusDot value={task.status} /><small>{task.type} · {task.mode}</small></div>)}</div><div className="sidebar-foot"><div className="status-line"><i /> {storage === "d1" ? "D1 / R2 持久化" : "Fixture workspace"}</div><small>Model Router：Token 到位后切换 Live</small></div></aside>
    <section className="workspace"><header className="topbar"><div><span className="crumb">{workspace.project.name} / {steps.find((s) => s.id === active)?.label}</span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div><div className="top-actions"><span className="mode-pill">{storage === "d1" ? "持久化模式" : "Fixture 模式"}</span><span className="save-notice">{notice}</span><button className="ghost-button" disabled={busy} onClick={() => persist("保存草稿")}>保存版本</button><div className="avatar">V2</div></div></header><div className="workspace-body">{panel}</div></section>
  </main>;
}

function ProjectCenter({ workspace, imageUrl, onUpload, onAnalyze }: { workspace: ProjectWorkspace; imageUrl: string | null; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onAnalyze: () => void }) {
  return <div className="stage-wrap"><StageHeading eyebrow="PROJECT COMMAND CENTER" title="任何商品，都从一份可信事实档案开始" description="上传图片与卖家资料，系统先识别事实和证据，再为 Amazon、TikTok Shop 与 Shopify 规划上新流程。" badge="单用户 · 多项目" />
    <div className="command-grid"><label className="upload-card v2-upload"><input type="file" accept="image/*" onChange={onUpload} />{imageUrl ? <img src={imageUrl} alt="商品原图" /> : <ProductBottle />}<div className="upload-copy"><strong>{imageUrl ? "更换商品原图" : "上传任意商品图片"}</strong><span>视觉模型将识别属性、包装文字、主体锁定项与风险线索</span></div></label><section className="project-intake"><div className="intake-head"><span>项目配置</span><StatusDot value={workspace.project.status} /></div><label>商品名称<input value={workspace.project.productName} readOnly /></label><label>目标市场<input value="United States" readOnly /></label><div className="channel-choice"><span>首发渠道</span><b>Amazon US</b><b>TikTok Shop US</b><b>Shopify US</b></div><div className="capability-map"><span>即将运行</span><div><b>01</b>视觉理解</div><div><b>02</b>事实抽取</div><div><b>03</b>证据绑定</div><div><b>04</b>品类路由</div></div><button className="primary-button" onClick={onAnalyze}>分析商品并建立事实档案 →</button></section></div>
    <div className="project-stats"><div><b>3</b><span>美国站渠道</span></div><div><b>{workspace.sources.length}</b><span>官方规则来源</span></div><div><b>{workspace.truth.attributes.length}</b><span>结构化事实</span></div><div><b>2</b><span>强制人工审核点</span></div></div>
  </div>;
}

function AssetMatrix({ workspace, imageUrl, onGenerate }: { workspace: ProjectWorkspace; imageUrl: string | null; onGenerate: () => void }) {
  const visualClass: Record<string, string> = { white: "clean", lifestyle: "scene", model: "model", comparison: "compare", dimension: "size" };
  return <div className="stage-wrap"><StageHeading eyebrow="ASSET GENERATION MATRIX" title="五类商品图，一套主体一致性约束" description="每张图都携带平台、比例、受众和主体锁定项；生成后自动复检结构、颜色、Logo、图片文字与平台规范。" badge={`${workspace.assets.length} 个候选版本`} />
    <div className="section-toolbar"><div><StatusDot value="completed" /> 商品事实已确认，可进入批量生成</div><div className="channel-pills"><span>Amazon</span><span>TikTok Shop</span><span>Shopify</span></div></div>
    <div className="asset-grid">{workspace.assets.map((asset) => <article className="asset-card" key={asset.id}><div className={`asset-visual ${visualClass[asset.kind] ?? "clean"}`}>{imageUrl ? <img src={imageUrl} alt={asset.kind} /> : <ProductBottle />}{asset.kind === "lifestyle" && <div className="scene-copy"><small>EVERYDAY ENERGY</small><b>Blend anywhere.</b></div>}{asset.kind === "comparison" && <div className="compare-copy"><b>Portable power</b><small>USB-C · lightweight · easy clean</small></div>}{asset.kind === "dimension" && <><i className="measure-v" /><i className="measure-h" /><em>规格待确认</em></>}<span className="asset-check">✓</span></div><div className="asset-meta"><div><strong>{asset.kind.toUpperCase()}</strong><small>{asset.width}×{asset.height} · 一致性 {asset.consistencyScore}%</small></div><button title="重新生成">↻</button></div></article>)}</div>
    <div className="bottom-actions"><p><strong>生成后自动进入双重质量门</strong><span>主体一致性不足会自动重试，最多 2 次；高风险图片不得进入详情页。</span></p><button className="primary-button" onClick={onGenerate}>生成 / 校验全部素材 →</button></div>
  </div>;
}

function ExportPanel({ workspace, versions, blocking, onSave }: { workspace: ProjectWorkspace; versions: Array<{ id: string; version: number; reason: string; createdAt: string }>; blocking: boolean; onSave: () => void }) {
  return <div className="stage-wrap"><StageHeading eyebrow="VERSION & EXPORT CENTER" title="把确认过的内容，打包成可交付上新资产" description="导出包严格对应当前确认版本，并包含规则来源、事实映射、生成记录和合规报告。" badge={blocking ? "存在导出阻断" : "已通过导出门禁"} />
    <div className="export-grid"><section className="package-card export-package"><div className="export-status"><StatusDot value={blocking ? "failed" : "completed"} /><div><strong>{blocking ? "仍有高风险问题待处理" : "三个渠道包已可导出"}</strong><span>{blocking ? "修正并复检后开放下载" : "当前内容与确认版本一致"}</span></div></div><div className="package-list"><span>原图与 5 类最终商品图</span><span>Amazon / TikTok Shop Listing CSV + JSON</span><span>Shopify 产品页 HTML + JSON</span><span>详情页模块与事实映射</span><span>合规报告与规则来源清单</span><span>项目元数据、任务轨迹与版本记录</span></div><div className="export-actions"><button className="ghost-button" onClick={onSave}>保存当前版本</button>{blocking ? <button className="primary-button" disabled>导出已锁定</button> : <a className="primary-button" href={`/api/projects/${workspace.project.id}/export`}>下载统一交付包 →</a>}</div></section>
      <section className="version-card"><div className="content-head"><div><small>VERSION HISTORY</small><h3>可追溯版本</h3></div><span>当前 v{Math.max(1, ...versions.map((item) => item.version))}</span></div><div className="version-list">{versions.length ? versions.slice(0, 6).map((item) => <div key={item.id}><b>v{item.version}</b><span>{item.reason}</span><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>) : <div><b>v1</b><span>Fixture 基准版本</span><time>当前会话</time></div>}</div><div className="task-timeline"><small>MODEL CALL TRACE</small>{workspace.tasks.slice(-4).map((task) => <div key={task.id}><StatusDot value={task.status} /><span>{task.type}</span><em>{task.mode} · {task.durationMs ?? 0} ms</em></div>)}</div></section></div>
    <div className="legal-note">风险筛查不等同于平台审核或法律意见；覆盖为 partial / unsupported 的品类必须由人工进行最终判断。</div>
  </div>;
}

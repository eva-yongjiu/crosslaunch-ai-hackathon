"use client";

import { ChangeEvent, useMemo, useState } from "react";

type StepKey = "input" | "assets" | "listing" | "detail" | "compliance" | "export";

const steps: Array<{ key: StepKey; label: string; eyebrow: string }> = [
  { key: "input", label: "商品输入", eyebrow: "01" },
  { key: "assets", label: "素材工坊", eyebrow: "02" },
  { key: "listing", label: "Listing", eyebrow: "03" },
  { key: "detail", label: "详情页", eyebrow: "04" },
  { key: "compliance", label: "合规复检", eyebrow: "05" },
  { key: "export", label: "上新导出", eyebrow: "06" },
];

const assetTypes = [
  { name: "Amazon 白底主图", ratio: "1:1", tone: "clean" },
  { name: "户外通勤场景图", ratio: "4:5", tone: "scene" },
  { name: "生活方式模特图", ratio: "4:5", tone: "model" },
  { name: "功能卖点对比图", ratio: "16:9", tone: "compare" },
  { name: "产品尺寸信息图", ratio: "1:1", tone: "size" },
];

const initialBullets = [
  "POWERFUL BLENDING ON THE GO — Six stainless-steel blades turn fruit and ice into a smooth drink in seconds.",
  "USB-C RECHARGEABLE — Blend up to 15 cups per charge without being tied to a kitchen outlet.",
  "LEAK-RESISTANT TRAVEL DESIGN — A safety lock and silicone seal help keep your bag clean during commutes.",
  "EASY TO CLEAN — Add water, run one blend cycle, then rinse. The cup detaches for a deeper clean.",
  "BPA-FREE 16 OZ CUP — A lightweight everyday size for smoothies, protein shakes, and fresh juice.",
];

export function LaunchStudio() {
  const [active, setActive] = useState<StepKey>("input");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("便携式榨汁杯");
  const [sellingPoints, setSellingPoints] = useState("6叶精钢刀头、USB-C充电、防漏杯盖、BPA Free、轻量便携");
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [title, setTitle] = useState("Portable Blender, 16 Oz Personal Smoothie Maker with USB-C Rechargeable Battery, 6-Blade Mini Blender for Travel, Gym and Office");
  const [bullets, setBullets] = useState(initialBullets);

  const completedIndex = generated ? (fixed ? 5 : 4) : 0;
  const activeIndex = steps.findIndex((step) => step.key === active);
  const progress = Math.max(8, ((completedIndex + 1) / steps.length) * 100);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
  };

  const runWorkflow = () => {
    setBusy(true);
    window.setTimeout(() => {
      setGenerated(true);
      setBusy(false);
      setActive("assets");
    }, 1200);
  };

  const exportBundle = () => {
    const payload = {
      project: "CrossLaunch AI — Amazon US launch package",
      product: productName,
      market: "United States",
      marketplace: "Amazon US",
      listing: { title, bullets, searchTerms: "portable blender personal smoothie maker usb c mini travel blender shake mixer" },
      compliance: { status: fixed ? "ready" : "review", score: fixed ? 96 : 78 },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "crosslaunch-amazon-us-package.json";
    link.click();
    URL.revokeObjectURL(href);
  };

  const stage = useMemo(() => {
    if (active === "input") {
      return (
        <InputStage
          imageUrl={imageUrl}
          productName={productName}
          sellingPoints={sellingPoints}
          busy={busy}
          onUpload={handleUpload}
          onNameChange={setProductName}
          onPointsChange={setSellingPoints}
          onRun={runWorkflow}
        />
      );
    }
    if (active === "assets") return <AssetsStage generated={generated} imageUrl={imageUrl} onNext={() => setActive("listing")} />;
    if (active === "listing") return <ListingStage title={title} bullets={bullets} onTitle={setTitle} onBullet={(i, value) => setBullets((items) => items.map((item, index) => index === i ? value : item))} onNext={() => setActive("detail")} />;
    if (active === "detail") return <DetailStage productName={productName} onNext={() => setActive("compliance")} />;
    if (active === "compliance") return <ComplianceStage fixed={fixed} onFix={() => setFixed(true)} onNext={() => setActive("export")} />;
    return <ExportStage fixed={fixed} onExport={exportBundle} onBack={() => setActive("compliance")} />;
  }, [active, imageUrl, productName, sellingPoints, busy, generated, title, bullets, fixed]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>C</span></div>
          <div><strong>上新无界</strong><small>CrossLaunch AI</small></div>
        </div>
        <div className="project-label">当前上新项目</div>
        <div className="project-card">
          <div className="project-thumb"><ProductBottle compact /></div>
          <div><strong>{productName}</strong><small>Amazon · United States</small></div>
        </div>
        <nav className="step-nav" aria-label="上新流程">
          {steps.map((step, index) => (
            <button key={step.key} className={`${active === step.key ? "active" : ""} ${index <= completedIndex ? "done" : ""}`} onClick={() => generated || step.key === "input" ? setActive(step.key) : undefined}>
              <span>{index < completedIndex ? "✓" : step.eyebrow}</span>
              {step.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="status-line"><i /> Demo workspace</div>
          <small>Powered by Alibaba Cloud Model Router</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="crumb">工作台 / {steps[activeIndex]?.label}</span>
            <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="top-actions">
            <span className="mode-pill">演示模式</span>
            <button className="ghost-button">保存草稿</button>
            <div className="avatar">FL</div>
          </div>
        </header>
        <div className="workspace-body">{stage}</div>
      </section>
    </main>
  );
}

function StageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="stage-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function InputStage({ imageUrl, productName, sellingPoints, busy, onUpload, onNameChange, onPointsChange, onRun }: {
  imageUrl: string | null;
  productName: string;
  sellingPoints: string;
  busy: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onNameChange: (value: string) => void;
  onPointsChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="stage-wrap">
      <StageHeading eyebrow="AI SMART LAUNCH" title="从一张商品图，到一套可上架资产" description="告诉我们商品是什么、准备卖到哪里。AI 将完成图片生成、本地化、Listing、详情页与合规复检。" />
      <div className="input-grid">
        <label className={`upload-card ${imageUrl ? "has-image" : ""}`}>
          <input type="file" accept="image/*" onChange={onUpload} />
          {imageUrl ? <img src={imageUrl} alt="已上传商品" /> : <ProductBottle />}
          <div className="upload-copy">
            <strong>{imageUrl ? "更换商品图片" : "上传商品原图"}</strong>
            <span>建议使用清晰白底图，支持 JPG / PNG</span>
          </div>
          <b>+</b>
        </label>

        <div className="form-card">
          <div className="form-row">
            <label>商品名称</label>
            <input value={productName} onChange={(event) => onNameChange(event.target.value)} />
          </div>
          <div className="form-row">
            <label>核心卖点</label>
            <textarea value={sellingPoints} onChange={(event) => onPointsChange(event.target.value)} />
          </div>
          <div className="form-split">
            <div className="form-row">
              <label>目标市场</label>
              <select defaultValue="us"><option value="us">🇺🇸 美国</option><option value="uk">🇬🇧 英国</option><option value="de">🇩🇪 德国</option></select>
            </div>
            <div className="form-row">
              <label>上架平台</label>
              <select defaultValue="amazon"><option value="amazon">Amazon</option><option value="tiktok">TikTok Shop</option></select>
            </div>
          </div>
          <div className="workflow-note"><span>AI</span><p><strong>将自动运行 5 项能力</strong>商品理解 · 素材生成 · 本地化 · Listing · 合规检测</p></div>
          <button className="primary-button" onClick={onRun} disabled={busy}>{busy ? <><i className="spinner" /> 正在理解商品并规划上新...</> : <>开始智能上新 <span>→</span></>}</button>
        </div>
      </div>
      <div className="trust-row"><span>01 商品主体保持</span><span>02 市场语境本地化</span><span>03 平台规则复检</span><span>04 结果可编辑导出</span></div>
    </div>
  );
}

function AssetsStage({ generated, imageUrl, onNext }: { generated: boolean; imageUrl: string | null; onNext: () => void }) {
  return (
    <div className="stage-wrap">
      <StageHeading eyebrow="ASSET STUDIO" title="一套商品，五种上架表达" description="商品主体特征保持一致，画面按 Amazon US 的尺寸、信息密度与视觉习惯自动编排。" />
      <div className="section-toolbar"><div><span className="success-dot" /> 已生成 5 项素材</div><button className="ghost-button">重新生成</button></div>
      <div className="asset-grid">
        {assetTypes.map((asset, index) => (
          <article className="asset-card" key={asset.name}>
            <div className={`asset-visual ${asset.tone}`}>
              {imageUrl && index === 0 ? <img src={imageUrl} alt={asset.name} /> : <ProductBottle compact={index !== 1} />}
              {asset.tone === "compare" && <div className="compare-copy"><b>6-BLADE<br />POWER</b><small>Smooth in seconds</small></div>}
              {asset.tone === "size" && <><i className="measure-v" /><i className="measure-h" /><em>9.1 in</em></>}
              {asset.tone === "scene" && <div className="scene-copy"><small>BLEND. SIP.</small><b>GO.</b></div>}
              <span className="asset-check">✓</span>
            </div>
            <div className="asset-meta"><div><strong>{asset.name}</strong><small>{asset.ratio} · 2048px</small></div><button aria-label={`编辑${asset.name}`}>•••</button></div>
          </article>
        ))}
      </div>
      <div className="bottom-actions"><p><strong>主体一致性 97%</strong><span>视觉模型已确认商品颜色、杯盖与刀座结构保持一致</span></p><button className="primary-button compact" onClick={onNext}>生成 Listing <span>→</span></button></div>
    </div>
  );
}

function ListingStage({ title, bullets, onTitle, onBullet, onNext }: { title: string; bullets: string[]; onTitle: (value: string) => void; onBullet: (index: number, value: string) => void; onNext: () => void }) {
  return (
    <div className="stage-wrap">
      <StageHeading eyebrow="LOCALIZED LISTING" title="不是翻译，是当地消费者会买单的表达" description="基于商品事实、Amazon US 搜索习惯与类目写作规范生成，可逐项编辑。" />
      <div className="listing-grid">
        <section className="editor-card">
          <div className="editor-title"><span>Amazon US</span><small>English (US)</small><b>SEO 92</b></div>
          <label>Product title <em>{title.length}/200</em></label>
          <textarea className="title-editor" value={title} onChange={(event) => onTitle(event.target.value)} />
          <label>Key product features</label>
          <div className="bullet-editors">{bullets.map((bullet, index) => <div key={index}><span>{index + 1}</span><textarea value={bullet} onChange={(event) => onBullet(index, event.target.value)} /></div>)}</div>
        </section>
        <aside className="insight-panel">
          <span className="panel-kicker">AI WRITING NOTES</span>
          <h3>本地化策略</h3>
          <div className="insight-item"><b>搜索意图</b><p>优先覆盖 portable blender、personal smoothie maker 与 travel blender。</p></div>
          <div className="insight-item"><b>表达调整</b><p>“秒碎冰块”调整为可验证的 “turn fruit and ice into a smooth drink in seconds”。</p></div>
          <div className="insight-item"><b>事实边界</b><p>未添加原始资料中不存在的转速、功率和认证信息。</p></div>
          <div className="keyword-cloud"><span>portable blender</span><span>USB-C</span><span>16 oz</span><span>travel</span><span>BPA-free</span></div>
          <button className="primary-button compact" onClick={onNext}>生成详情页 <span>→</span></button>
        </aside>
      </div>
    </div>
  );
}

function DetailStage({ productName, onNext }: { productName: string; onNext: () => void }) {
  return (
    <div className="stage-wrap detail-stage">
      <StageHeading eyebrow="DETAIL PAGE BUILDER" title="图文自动编排，仍然保留人的判断" description="AI 已根据购买决策顺序生成 5 个详情模块，可拖动调整并单独重写。" />
      <div className="detail-layout">
        <aside className="module-list">
          <span>详情模块</span>
          {["品牌首屏", "核心卖点", "使用场景", "规格参数", "购买理由"].map((item, index) => <button className={index === 0 ? "active" : ""} key={item}><i>⋮⋮</i><b>{String(index + 1).padStart(2, "0")}</b>{item}</button>)}
          <button className="add-module">＋ 添加模块</button>
        </aside>
        <section className="detail-preview">
          <div className="browser-chrome"><i /><i /><i /><span>Amazon A+ Content Preview</span></div>
          <div className="hero-module">
            <div className="detail-copy"><small>BLEND FREEDOM, ANYWHERE</small><h2>Your day.<br />Freshly blended.</h2><p>A compact personal blender made for busy mornings, gym bags, and wherever the day takes you.</p><button>SHOP THE DIFFERENCE</button></div>
            <div className="hero-product"><ProductBottle /></div>
          </div>
          <div className="feature-module"><div><b>6</b><span>STAINLESS<br />STEEL BLADES</span></div><div><b>15</b><span>BLENDS PER<br />CHARGE</span></div><div><b>16</b><span>OZ BPA-FREE<br />CUP</span></div></div>
          <div className="preview-caption"><span>自动生成</span>{productName} · Amazon US A+ 模块预览</div>
        </section>
      </div>
      <div className="bottom-actions"><p><strong>模块完整度 100%</strong><span>图片、文案与商品事实已完成一致性检查</span></p><button className="primary-button compact" onClick={onNext}>开始合规复检 <span>→</span></button></div>
    </div>
  );
}

function ComplianceStage({ fixed, onFix, onNext }: { fixed: boolean; onFix: () => void; onNext: () => void }) {
  const score = fixed ? 96 : 78;
  return (
    <div className="stage-wrap">
      <StageHeading eyebrow="COMPLIANCE REVIEW" title="发布之前，把风险说清楚" description="结合 Amazon US 图片规范与广告表达规则，对图片和文案进行可解释风险筛查。" />
      <div className="compliance-grid">
        <section className="score-card">
          <div className={`score-ring ${fixed ? "safe" : ""}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong><span>/ 100</span></div></div>
          <h3>{fixed ? "已达到建议发布标准" : "发现 2 项需要处理的风险"}</h3>
          <p>{fixed ? "高风险项已清零，建议发布前由运营人员完成最终确认。" : "系统已定位具体素材和表达，可一键生成更稳妥的替代版本。"}</p>
          <div className="score-metrics"><span><b>{fixed ? 0 : 1}</b>高风险</span><span><b>{fixed ? 0 : 1}</b>中风险</span><span><b>4</b>已通过</span></div>
        </section>
        <section className="risk-list">
          <div className={`risk-item ${fixed ? "resolved" : "high"}`}><span>{fixed ? "✓" : "!"}</span><div><small>{fixed ? "已修正" : "高风险"} · Listing 五点描述</small><h4>“100% leak-proof” 属于难以充分证明的绝对化表达</h4><p>建议替换为描述产品结构的 “leak-resistant travel design”，降低误导性承诺风险。</p><code>依据：Amazon Product Detail Page Rules · Claims</code></div></div>
          <div className={`risk-item ${fixed ? "resolved" : "medium"}`}><span>{fixed ? "✓" : "!"}</span><div><small>{fixed ? "已修正" : "中风险"} · 功能对比图</small><h4>图片中的 “No.1 Portable Blender” 缺少可验证来源</h4><p>建议改为商品事实型表达 “6-Blade Blending Power”，并移除排名徽章。</p><code>依据：Amazon Main Image & Promotional Claims</code></div></div>
          <div className="risk-item passed"><span>✓</span><div><small>已通过 · 主图</small><h4>白底占比、商品完整度与画面元素符合要求</h4><p>未发现水印、边框、促销标识或无关配件。</p></div></div>
        </section>
      </div>
      <div className="bottom-actions"><p><strong>{fixed ? "修正完成" : "AI 风险筛查"}</strong><span>本结果用于辅助审核，不替代平台最终审核或正式法律意见</span></p>{fixed ? <button className="primary-button compact" onClick={onNext}>进入上新导出 <span>→</span></button> : <button className="primary-button compact" onClick={onFix}>一键生成稳妥版本 <span>↻</span></button>}</div>
    </div>
  );
}

function ExportStage({ fixed, onExport, onBack }: { fixed: boolean; onExport: () => void; onBack: () => void }) {
  return (
    <div className="stage-wrap export-stage">
      <div className="celebration-mark">✓</div>
      <span className="panel-kicker">LAUNCH PACKAGE READY</span>
      <h1>一套经过复检的上新资产，准备好了</h1>
      <p>所有素材已按 Amazon US 结构整理。你可以下载完整包，或返回检查最后一遍。</p>
      <div className="package-card">
        <div className="package-head"><div className="folder-icon">CL</div><div><strong>便携式榨汁杯_Amazon-US</strong><span>6 个目录 · 18 项文件 · 合规得分 {fixed ? 96 : 78}</span></div><b>READY</b></div>
        <div className="package-files"><span>01_Product-Images <b>5</b></span><span>02_Localized-Assets <b>5</b></span><span>03_Listing-Copy <b>3</b></span><span>04_A-Plus-Content <b>4</b></span><span>05_Compliance-Report <b>1</b></span></div>
      </div>
      <div className="export-actions"><button className="ghost-button" onClick={onBack}>返回复检</button><button className="primary-button compact" onClick={onExport}>下载演示上新包 <span>↓</span></button></div>
      <small className="export-note">当前演示版导出结构化 JSON；接入生成服务后将同时打包图片、CSV、HTML 与 PDF 报告。</small>
    </div>
  );
}

function ProductBottle({ compact = false }: { compact?: boolean }) {
  return <div className={`product-bottle ${compact ? "compact" : ""}`}><div className="bottle-cap"><i /><i /><i /></div><div className="bottle-body"><span>FRESH<br /><b>FLOW</b></span><em>16 OZ</em></div><div className="bottle-base"><i /><i /></div></div>;
}

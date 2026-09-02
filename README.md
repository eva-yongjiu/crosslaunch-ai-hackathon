# 上新无界 · CrossLaunch AI

面向中小跨境卖家的 AI 商品上新工作台：从一张真实商品图和已确认事实出发，生成多平台商品图片、Listing、详情页，并完成可追溯的合规筛查和交付导出。

## 复赛演示闭环

1. 创建商品项目，上传真实商品原图。
2. 使用 Token Plan 视觉模型识别商品事实，人工确认后解锁创作。
3. 按 Amazon US、TikTok Shop US、Shopify US 独立生成内容和五类商品图片。
4. 用规则检查和视觉模型复检标题、卖点、图片主体及视觉宣称。
5. 修正风险后重新检测，导出真实图片、Listing、详情页、规则来源和生成记录。

产品不把未经确认的参数写入文案，也不会把没有专项规则包的品类标记为“完全合规”。合规功能是风险筛查工具，不替代平台审核、检测认证或法律意见。

## 业务价值

- 将供应商图片、卖点和多平台上新工作集中在一个流程中。
- 用一次事实确认约束图片和文案，减少 AI 臆造参数与跨平台信息不一致。
- 将重复的图片、Listing、详情页制作压缩为可计时的单品工作流。
- 输出带事实关联、规则来源和生成记录的交付包，便于复核和复用。

复赛演示建议使用普通消费品，现场记录“上传到可交付 ZIP”的实际耗时；README 中的效率指标只填写真实测试结果，不使用未经验证的宣传数字。

## 技术结构

```text
Browser
  └─ Vinext / React workspace
       ├─ Product Truth：商品事实、证据、人工确认
       ├─ Creative：三渠道 Listing、详情页、图片矩阵
       ├─ Compliance：规则扫描、视觉复检、导出门禁
       └─ API routes
            ├─ Token Plan OpenAI-compatible chat/vision
            ├─ Token Plan multimodal image generation
            ├─ Cloudflare D1 + R2（优先）
            └─ Node local JSON + filesystem（普通服务器兜底）
```

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
copy .env.example .env
npm run dev
```

未配置 API Key 时，页面可以创建和保存空白项目，但不会伪造 AI 结果。真实 AI 生成需要在服务端环境配置：

```env
TOKEN_PLAN_MODE=live
TOKEN_PLAN_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
TOKEN_PLAN_MULTIMODAL_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1
TOKEN_PLAN_API_KEY=只放服务端环境变量，不要提交到仓库
TOKEN_PLAN_TEXT_MODEL=qwen3.7-plus
TOKEN_PLAN_VISION_MODEL=qwen3.7-plus
TOKEN_PLAN_IMAGE_MODEL=qwen-image-2.0
```

## 普通服务器部署

当前项目可以使用 Vinext 的 Node 生产服务器：

```bash
npm ci
npm run build
set PORT=3000
set CROSSLAUNCH_DATA_DIR=.data
npm run start
```

Linux 使用：

```bash
PORT=3000 CROSSLAUNCH_DATA_DIR=.data npm run start
```

普通服务器没有 Cloudflare D1/R2 绑定时，项目数据保存到 `CROSSLAUNCH_DATA_DIR/projects.json`，图片保存到同目录下的 `assets/`。生产环境应使用持久化磁盘，并通过 HTTPS 反向代理暴露链接。Cloudflare 环境存在 D1/R2 绑定时，会自动优先使用云端存储。

## 质量门禁

```bash
npx tsc --noEmit
npm run lint
npm test
```

## 目录

- `app/components/experience-studio.tsx`：主工作台 UI。
- `app/api/projects/[id]/workflow/route.ts`：事实分析、内容生成、图片生成和合规复检。
- `app/lib/model-router.ts`：Token Plan 服务端适配器。
- `app/lib/compliance.ts`、`app/lib/rules.ts`：规则和覆盖状态。
- `app/lib/repository.ts`：D1/本地项目持久化。
- `app/lib/storage.ts`：R2/本地素材持久化。
- `app/api/projects/[id]/export/route.ts`：真实图片和内容 ZIP 导出。

## 安全说明

API Key 只从服务端环境变量读取；`.env*` 和 `.data/` 已加入 Git 忽略。公开演示服务器只应提供竞赛所需的测试数据，并在反向代理层配置访问控制、HTTPS 和备份策略。

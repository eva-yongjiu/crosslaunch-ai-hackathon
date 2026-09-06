import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the real-data workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /上新无界/);
  assert.match(html, /商品事实/);
  assert.match(html, /真实数据工作台/);
  assert.match(html, /AI 未配置/);
  assert.doesNotMatch(html, /演示模式|便携榨汁杯|96%|codex-preview|Your site is taking shape/);
});

test("keeps Token Plan credentials server-side", async () => {
  const [adapter, client, envExample] = await Promise.all([
    readFile(new URL("../app/lib/model-router.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(adapter, /TOKEN_PLAN_API_KEY/);
  assert.doesNotMatch(client, /TOKEN_PLAN_API_KEY|MODEL_ROUTER_API_KEY|Authorization/);
  assert.match(envExample, /TOKEN_PLAN_MODE=live/);
  assert.match(envExample, /token-plan\.cn-beijing\.maas\.aliyuncs\.com\/compatible-mode\/v1/);
  assert.match(adapter, /qwen3\.7-plus/);
  assert.match(adapter, /multimodal-generation\/generation/);
  assert.doesNotMatch(adapter, /dashscope\.aliyuncs\.com|\/images\/generations/);
});

test("implements the truth, compliance, version and asset contracts", async () => {
  const domain = await readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8");
  for (const contract of ["OutputLanguage", "ProductTruthProfile", "GenerationTask", "RuleSource", "ComplianceFinding", "AssetVersion", "ContentVersion", "UploadedAsset", "RuntimeStatus"]) {
    assert.match(domain, new RegExp(`interface ${contract}|type ${contract}`));
  }
});

test("supports bilingual AI output and precise compliance locations", async () => {
  const [domain, workflow, compliance, component, workspace] = await Promise.all([
    readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/[id]/workflow/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/compliance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/experience-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/workspace.ts", import.meta.url), "utf8"),
  ]);
  assert.match(domain, /titleZh|bodyZh|nameZh/);
  assert.match(workflow, /补齐中文|titleZh|explanationZh/);
  assert.match(compliance, /location: segment\.location/);
  assert.match(component, /定位并编辑/);
  assert.match(workspace, /function normalizeListing/);
  assert.match(workspace, /raw\.text \?\? raw\.claim/);
  assert.match(workspace, /Array\.isArray\(value\)/);
  assert.match(workflow, /const assetFindings = await reviewAssets\(workspace\)/);
});

test("supports AI compliance optimization and recheck", async () => {
  const [workflow, component, client] = await Promise.all([
    readFile(new URL("../app/api/projects/[id]/workflow/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/experience-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/api-client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /optimize_finding/);
  assert.match(workflow, /optimize_all/);
  assert.match(workflow, /runComplianceScan/);
  assert.match(workflow, /replacementZh/);
  assert.match(component, /AI 一键优化全部并复检/);
  assert.match(component, /AI 优化此项并复检/);
  assert.match(client, /findingId/);
});

test("does not silently fall back to fixture data", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/lib/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/assets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/[id]/export/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(files.join("\n"), /cloneFixture|fixture:\/\/|storage:\s*["']fixture/);
  await assert.rejects(readFile(new URL("../app/lib/fixtures.ts", import.meta.url), "utf8"));
  const repository = await readFile(new URL("../app/lib/repository.ts", import.meta.url), "utf8");
  assert.match(repository, /ne\(projects\.id, "project_demo"\)/);
  assert.match(repository, /settingsJson/);
});

test("exports a real ZIP delivery package", async () => {
  const route = await readFile(new URL("../app/api/projects/[id]/export/route.ts", import.meta.url), "utf8");
  assert.match(route, /zipSync/);
  assert.match(route, /application\/zip/);
  assert.match(route, /all-channels\.csv/);
  assert.match(route, /product-page\.html/);
  assert.match(route, /rule-sources\.json/);
  assert.match(route, /事实档案尚未确认/);
});

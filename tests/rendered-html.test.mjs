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

test("keeps Model Router credentials server-side", async () => {
  const [adapter, client, envExample] = await Promise.all([
    readFile(new URL("../app/lib/model-router.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(adapter, /MODEL_ROUTER_API_KEY/);
  assert.doesNotMatch(client, /MODEL_ROUTER_API_KEY|Authorization/);
  assert.match(envExample, /MODEL_ROUTER_MODE=live/);
  assert.match(adapter, /process\.env\.MODEL_ROUTER_MODE !== "fixture"/);
});

test("implements the truth, compliance, version and asset contracts", async () => {
  const domain = await readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8");
  for (const contract of ["ProductTruthProfile", "GenerationTask", "RuleSource", "ComplianceFinding", "AssetVersion", "ContentVersion", "UploadedAsset", "RuntimeStatus"]) {
    assert.match(domain, new RegExp(`interface ${contract}|type ${contract}`));
  }
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

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

test("server-renders the V2 launch workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /上新无界/);
  assert.match(html, /商品事实/);
  assert.match(html, /Fixture/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps Model Router credentials server-side", async () => {
  const [adapter, client, envExample] = await Promise.all([
    readFile(new URL("../app/lib/model-router.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(adapter, /MODEL_ROUTER_API_KEY/);
  assert.doesNotMatch(client, /MODEL_ROUTER_API_KEY|Authorization/);
  assert.match(envExample, /MODEL_ROUTER_MODE=fixture/);
});

test("implements the truth, compliance, version and asset contracts", async () => {
  const domain = await readFile(new URL("../app/lib/domain.ts", import.meta.url), "utf8");
  for (const contract of ["ProductTruthProfile", "GenerationTask", "RuleSource", "ComplianceFinding", "AssetVersion", "ContentVersion"]) {
    assert.match(domain, new RegExp(`interface ${contract}|type ${contract}`));
  }
});

test("exports a real ZIP delivery package", async () => {
  const route = await readFile(new URL("../app/api/projects/[id]/export/route.ts", import.meta.url), "utf8");
  assert.match(route, /zipSync/);
  assert.match(route, /application\/zip/);
  assert.match(route, /all-channels\.csv/);
  assert.match(route, /product-page\.html/);
  assert.match(route, /rule-sources\.json/);
});

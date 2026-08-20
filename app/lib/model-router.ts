import type { ModelMode } from "./domain";

const DEFAULT_CHAT_BASE_URL = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MULTIMODAL_BASE_URL = "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1";

function configuredValue(primary: string, legacy: string) {
  return process.env[primary] ?? process.env[legacy];
}

function apiKey() {
  return configuredValue("TOKEN_PLAN_API_KEY", "MODEL_ROUTER_API_KEY");
}

function providerMode() {
  return configuredValue("TOKEN_PLAN_MODE", "MODEL_ROUTER_MODE") ?? "live";
}

export function modelMode(): ModelMode {
  return providerMode() !== "fixture" && Boolean(apiKey()) ? "live" : "fixture";
}

export function assertModelRouterConfigured() {
  if (modelMode() !== "live") throw new Error("Token Plan API Key 未配置，AI 分析与生成尚不可用。可先手动录入商品事实。");
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function request<T>(base: string, path: string, init: RequestInit, timeoutMs = 120_000): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("TOKEN_PLAN_API_KEY is not configured");
  const response = await fetch(joinUrl(base, path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token Plan ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function chatBaseUrl() {
  return configuredValue("TOKEN_PLAN_BASE_URL", "MODEL_ROUTER_BASE_URL") ?? DEFAULT_CHAT_BASE_URL;
}

function multimodalBaseUrl() {
  return process.env.TOKEN_PLAN_MULTIMODAL_BASE_URL ?? DEFAULT_MULTIMODAL_BASE_URL;
}

function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as T;
    const object = content.match(/\{[\s\S]*\}/)?.[0];
    if (object) return JSON.parse(object) as T;
    throw new Error("Token Plan 返回了无法解析的 JSON 结果。");
  }
}

export async function chatJson<T>(system: string, user: string, model = configuredValue("TOKEN_PLAN_TEXT_MODEL", "MODEL_ROUTER_TEXT_MODEL") ?? "qwen3.7-plus"): Promise<T> {
  const data = await request<{ choices: Array<{ message: { content: string } }> }>(chatBaseUrl(), "/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, enable_thinking: false, response_format: { type: "json_object" } }),
  });
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Token Plan 文本模型返回了空结果。");
  return parseJson<T>(content);
}

export async function visionJson<T>(system: string, prompt: string, imageDataUrl: string): Promise<T> {
  assertModelRouterConfigured();
  const data = await request<{ choices: Array<{ message: { content: string } }> }>(chatBaseUrl(), "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: configuredValue("TOKEN_PLAN_VISION_MODEL", "MODEL_ROUTER_VISION_MODEL") ?? "qwen3.7-plus",
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }] },
      ],
      temperature: 0.1,
      enable_thinking: false,
      response_format: { type: "json_object" },
    }),
  });
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Token Plan 视觉模型返回了空结果。");
  return parseJson<T>(content);
}

type MultimodalImageResponse = {
  output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
  request_id?: string;
};

export async function generateImage(prompt: string, size = "2048*2048", sourceImageDataUrl?: string) {
  const content: Array<{ image: string } | { text: string }> = [];
  if (sourceImageDataUrl) content.push({ image: sourceImageDataUrl });
  content.push({ text: prompt });
  const result = await request<MultimodalImageResponse>(multimodalBaseUrl(), "/services/aigc/multimodal-generation/generation", {
    method: "POST",
    body: JSON.stringify({
      model: configuredValue("TOKEN_PLAN_IMAGE_MODEL", "MODEL_ROUTER_IMAGE_MODEL") ?? "qwen-image-2.0",
      input: { messages: [{ role: "user", content }] },
      parameters: { n: 1, size, watermark: false, prompt_extend: true },
    }),
  }, 180_000);
  const images = result.output?.choices?.flatMap((choice) => choice.message?.content ?? []).map((item) => item.image).filter((url): url is string => Boolean(url)) ?? [];
  return { data: images.map((url) => ({ url })), requestId: result.request_id };
}

export async function getProviderTask(taskId: string) {
  return request<Record<string, unknown>>(multimodalBaseUrl(), `/tasks/${encodeURIComponent(taskId)}`, { method: "GET", headers: { Accept: "application/json" } });
}

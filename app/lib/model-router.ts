import type { ModelMode } from "./domain";

const baseUrl = process.env.MODEL_ROUTER_BASE_URL ?? "https://model-router.edu-aliyun.com/v1";

export function modelMode(): ModelMode {
  return process.env.MODEL_ROUTER_MODE === "live" && Boolean(process.env.MODEL_ROUTER_API_KEY) ? "live" : "fixture";
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const apiKey = process.env.MODEL_ROUTER_API_KEY;
  if (!apiKey) throw new Error("MODEL_ROUTER_API_KEY is not configured");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model Router ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

export async function chatJson<T>(system: string, user: string, model = process.env.MODEL_ROUTER_TEXT_MODEL ?? "qwen/qwen3-max"): Promise<T> {
  const data = await request<{ choices: Array<{ message: { content: string } }> }>("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, response_format: { type: "json_object" } }),
  });
  const content = data.choices[0]?.message.content;
  if (!content) throw new Error("Model Router returned an empty response");
  return JSON.parse(content) as T;
}

export async function generateImage(prompt: string, size = "1024*1024") {
  return request<{ data?: Array<{ url?: string; b64_json?: string }>; task_id?: string }>("/images/generations", {
    method: "POST",
    body: JSON.stringify({ model: process.env.MODEL_ROUTER_IMAGE_MODEL ?? "qwen/wan2.7-image-pro", prompt, n: 1, size }),
  });
}

export async function getProviderTask(taskId: string) {
  return request<Record<string, unknown>>(`/tasks/${encodeURIComponent(taskId)}`, { method: "GET", headers: { Accept: "application/json" } });
}

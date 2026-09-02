import { getRuntimeEnv } from "./runtime-env";

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type R2Body = ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null;

function dataRoot() {
  return process.env.CROSSLAUNCH_DATA_DIR?.trim() || ".data";
}

async function localFilePath(objectKey: string) {
  const path = await import("node:path");
  const root = path.resolve(dataRoot(), "assets");
  const safeKey = objectKey.replace(/^[/\\]+/, "").replaceAll("..", "__");
  return path.join(root, safeKey);
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function bodyBytes(body: BodyInit | ArrayBufferView<ArrayBufferLike>) {
  if (body instanceof Uint8Array) return new Uint8Array(body);
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

export async function storageMode() {
  return (await getRuntimeEnv()).ASSETS_BUCKET ? "r2" : "local";
}

export async function putStoredObject(objectKey: string, body: BodyInit | ArrayBufferView<ArrayBufferLike>, contentType: string) {
  const env = await getRuntimeEnv();
  if (env.ASSETS_BUCKET) {
    await env.ASSETS_BUCKET.put(objectKey, body as R2Body, { httpMetadata: { contentType } });
    return;
  }
  const fs = await import("node:fs/promises");
  const filePath = await localFilePath(objectKey);
  await fs.mkdir((await import("node:path")).dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, await bodyBytes(body));
}

export async function getStoredObject(objectKey: string): Promise<StoredObject | null> {
  const env = await getRuntimeEnv();
  if (env.ASSETS_BUCKET) return await env.ASSETS_BUCKET.get(objectKey) as StoredObject | null;
  const fs = await import("node:fs/promises");
  try {
    const bytes = new Uint8Array(await fs.readFile(await localFilePath(objectKey)));
    return { body: new Blob([toArrayBuffer(bytes)]).stream(), arrayBuffer: async () => toArrayBuffer(bytes) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

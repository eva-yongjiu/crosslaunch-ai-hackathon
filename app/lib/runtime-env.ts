export type RuntimeEnv = Partial<{
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
}>;

let runtimeEnvPromise: Promise<RuntimeEnv> | undefined;

export function getRuntimeEnv(): Promise<RuntimeEnv> {
  runtimeEnvPromise ??= import("cloudflare:workers")
    .then((module) => module.env as RuntimeEnv)
    .catch(() => ({}));
  return runtimeEnvPromise;
}

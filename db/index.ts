import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRuntimeEnv } from "../app/lib/runtime-env";

export async function getDb() {
  const env = await getRuntimeEnv();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the binding in the Cloudflare deployment environment, or use the local Node storage adapter for a regular server deployment."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function hasDatabase() {
  return Boolean((await getRuntimeEnv()).DB);
}

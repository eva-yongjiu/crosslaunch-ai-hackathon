import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "../../db";
import { assetObjects } from "../../db/schema";

export type StoredAssetRecord = {
  id: string;
  projectId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: string;
  createdAt: string;
};

async function filePath() {
  const path = await import("node:path");
  return path.resolve(process.env.CROSSLAUNCH_DATA_DIR?.trim() || ".data", "assets.json");
}

async function readLocalAssets(): Promise<Record<string, StoredAssetRecord>> {
  const fs = await import("node:fs/promises");
  try {
    return JSON.parse(await fs.readFile(await filePath(), "utf8")) as Record<string, StoredAssetRecord>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeLocalAssets(assets: Record<string, StoredAssetRecord>) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const target = await filePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(assets, null, 2), "utf8");
  await fs.rename(temporary, target);
}

export async function getAssetRecord(id: string): Promise<StoredAssetRecord | null> {
  if (!(await hasDatabase())) return (await readLocalAssets())[id] ?? null;
  const [record] = await (await getDb()).select().from(assetObjects).where(eq(assetObjects.id, id));
  return record ?? null;
}

export async function saveAssetRecord(record: StoredAssetRecord) {
  if (!(await hasDatabase())) {
    const assets = await readLocalAssets();
    assets[record.id] = record;
    await writeLocalAssets(assets);
    return;
  }
  await (await getDb()).insert(assetObjects).values(record);
}

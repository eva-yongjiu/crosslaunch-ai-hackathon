import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  productName: text("product_name").notNull(),
  category: text("category").notNull().default("unclassified"),
  status: text("status").notNull().default("queued"),
  currentStep: text("current_step").notNull().default("input"),
  channelsJson: text("channels_json").notNull(),
  coverageJson: text("coverage_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  truthJson: text("truth_json").notNull(),
  listingsJson: text("listings_json").notNull(),
  detailsJson: text("details_json").notNull(),
  assetsJson: text("assets_json").notNull(),
  findingsJson: text("findings_json").notNull(),
  tasksJson: text("tasks_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const projectVersions = sqliteTable("project_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  reason: text("reason").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const assetObjects = sqliteTable("asset_objects", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  kind: text("kind").notNull(),
  createdAt: text("created_at").notNull(),
});

export const ruleSourceRecords = sqliteTable("rule_sources", {
  id: text("id").primaryKey(),
  authority: text("authority").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  version: text("version").notNull(),
  contentHash: text("content_hash").notNull(),
  payloadJson: text("payload_json").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  fetchedAt: text("fetched_at").notNull(),
});

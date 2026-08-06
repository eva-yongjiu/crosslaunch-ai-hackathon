CREATE TABLE `asset_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_objects_object_key_unique` ON `asset_objects` (`object_key`);--> statement-breakpoint
CREATE TABLE `project_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`reason` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`product_name` text NOT NULL,
	`category` text DEFAULT 'unclassified' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`current_step` text DEFAULT 'input' NOT NULL,
	`channels_json` text NOT NULL,
	`coverage_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rule_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`authority` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`version` text NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`project_id` text PRIMARY KEY NOT NULL,
	`truth_json` text NOT NULL,
	`listings_json` text NOT NULL,
	`details_json` text NOT NULL,
	`assets_json` text NOT NULL,
	`findings_json` text NOT NULL,
	`tasks_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `duplicates_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer,
	`verdict` text NOT NULL,
	`mapped_to_name` text,
	`reason` text,
	`logged_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `ingested_content`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingested_content` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_url` text,
	`post_type` text,
	`raw_text` text,
	`claude_verdict` text,
	`mapped_to_tool_id` integer,
	`processed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`mapped_to_tool_id`) REFERENCES `tools_registry`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stack_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tool_id` integer NOT NULL,
	`notes` text,
	`added_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`tool_id`) REFERENCES `tools_registry`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `swap_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`old_tool_id` integer,
	`new_tool_id` integer,
	`reason` text,
	`swapped_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`old_tool_id`) REFERENCES `tools_registry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_tool_id`) REFERENCES `tools_registry`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tools_registry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`plugin_type` text,
	`description` text,
	`status` text DEFAULT 'unclassified' NOT NULL,
	`source` text DEFAULT 'community' NOT NULL,
	`verdict_reason` text,
	`first_seen` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`times_mentioned` integer DEFAULT 1 NOT NULL,
	`last_updated` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`canonical_url` text
);

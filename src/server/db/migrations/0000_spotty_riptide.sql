CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`dedupe_key` text,
	`occurred_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_dedupe_key_unique` ON `activities` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `activities_prospect_idx` ON `activities` (`prospect_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `ai_insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`kind` text NOT NULL,
	`output` text NOT NULL,
	`engine` text NOT NULL,
	`prompt_version` text,
	`input_message_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`input_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer,
	`type` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_dedupe_key_unique` ON `alerts` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`kind` text NOT NULL,
	`file_path` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`linkedin_url` text,
	`website` text,
	`industry` text,
	`employee_count` text,
	`revenue_text` text,
	`headquarters` text,
	`ai_overview` text,
	`enriched_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`external_thread_id` text NOT NULL,
	`inbox` text NOT NULL,
	`thread_url` text,
	`subject` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_external_thread_id_unique` ON `conversations` (`external_thread_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_user_id` text NOT NULL,
	`sent_at` integer,
	`accepted_at` integer
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`run_after` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`prospect_id` integer NOT NULL,
	`external_message_id` text NOT NULL,
	`direction` text NOT NULL,
	`text` text NOT NULL,
	`sent_at` integer NOT NULL,
	`sender_name` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_message_id_unique` ON `messages` (`external_message_id`);--> statement-breakpoint
CREATE INDEX `messages_conv_idx` ON `messages` (`conversation_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prospect_tags` (
	`prospect_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`prospect_id`, `tag_id`),
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prospects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_user_id` text NOT NULL,
	`full_name` text NOT NULL,
	`photo_url` text,
	`linkedin_url` text,
	`headline` text,
	`designation` text,
	`company_id` integer,
	`location` text,
	`industry` text,
	`owner` text,
	`category` text DEFAULT 'unclassified' NOT NULL,
	`category_source` text,
	`sentiment` text,
	`lead_score` integer DEFAULT 0 NOT NULL,
	`stage` text DEFAULT 'fresh' NOT NULL,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`next_follow_up_at` integer,
	`last_inbound_at` integer,
	`last_outbound_at` integer,
	`last_activity_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_provider_user_id_unique` ON `prospects` (`provider_user_id`);--> statement-breakpoint
CREATE INDEX `prospects_cat_idx` ON `prospects` (`category`,`stage`);--> statement-breakpoint
CREATE INDEX `prospects_followup_idx` ON `prospects` (`next_follow_up_at`);--> statement-breakpoint
CREATE INDEX `prospects_inbound_idx` ON `prospects` (`last_inbound_at`);--> statement-breakpoint
CREATE TABLE `raw_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_message_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_events_uq` ON `raw_events` (`source`,`external_message_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stage_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`reason` text,
	`actor` text NOT NULL,
	`occurred_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);
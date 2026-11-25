CREATE TABLE `prospect_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prospect_id` integer NOT NULL,
	`contact_info` text,
	`findings` text,
	`recommendations` text,
	`issues` text,
	`pain_points` text,
	`requirements` text,
	`notes` text,
	`source` text,
	`raw_text` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospect_audit_prospect_id_unique` ON `prospect_audit` (`prospect_id`);
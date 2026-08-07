CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tui_revisions` (
	`resource` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`resource`, `scope`)
);
--> statement-breakpoint
INSERT INTO `app_meta` (`key`, `value`) VALUES
  ('db_instance_id', lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  ('sync_schema_version', '1');
--> statement-breakpoint
INSERT INTO `tui_revisions` (`resource`, `scope`, `revision`) VALUES
  ('status', '', 0),
  ('runtime_metrics', '', 0),
  ('chats', '', 0),
  ('llm_calls', '', 0),
  ('events', '', 0),
  ('commands', '', 0);

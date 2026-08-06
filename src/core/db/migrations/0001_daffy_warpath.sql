CREATE TABLE `status_snapshot` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`connected_since` integer,
	`ping_ms` integer,
	`incoming_count` integer NOT NULL,
	`outgoing_count` integer NOT NULL,
	`ai_request_count` integer NOT NULL,
	`error_count` integer NOT NULL,
	`queue_state` text NOT NULL,
	`memory_mb` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `event_log` ADD `category` text DEFAULT 'system' NOT NULL;
CREATE TABLE `event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_log_timestamp` ON `event_log` (`timestamp`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text,
	`latency_ms` integer NOT NULL,
	`error` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_llm_calls_timestamp` ON `llm_calls` (`timestamp`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`sender_id` text,
	`text` text,
	`timestamp` integer NOT NULL,
	`is_outgoing` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_chat_timestamp` ON `messages` (`chat_id`,`timestamp`);
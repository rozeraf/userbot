DELETE FROM `messages`
WHERE `id` NOT IN (
  SELECT MIN(`id`)
  FROM `messages`
  GROUP BY `chat_id`, `message_id`
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `telegram_timestamp` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_messages_chat_message` ON `messages` (`chat_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_chat_telegram_timestamp` ON `messages` (`chat_id`,`telegram_timestamp`);--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `model` text NOT NULL DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `correlation_id` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `command_name` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `chat_id` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `message_id` integer;--> statement-breakpoint
CREATE INDEX `idx_llm_calls_correlation` ON `llm_calls` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `idx_event_log_category_id` ON `event_log` (`category`,`id`);--> statement-breakpoint
CREATE INDEX `idx_event_log_type_id` ON `event_log` (`event_type`,`id`);
--> statement-breakpoint
ALTER TABLE `status_snapshot` ADD `event_count` integer NOT NULL DEFAULT 0;

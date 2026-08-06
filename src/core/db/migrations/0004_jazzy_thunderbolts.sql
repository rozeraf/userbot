-- Command execution is separate from message logging: a Telegram update can be
-- redelivered and must not create a second paid LLM request.
CREATE TABLE `command_executions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chat_id` text NOT NULL,
  `message_id` integer NOT NULL,
  `command_name` text NOT NULL,
  `correlation_id` text NOT NULL,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `error` text,
  `started_at` integer NOT NULL,
  `finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_command_executions_chat_message`
  ON `command_executions` (`chat_id`, `message_id`);
--> statement-breakpoint
CREATE INDEX `idx_command_executions_status_started`
  ON `command_executions` (`status`, `started_at`);
--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);

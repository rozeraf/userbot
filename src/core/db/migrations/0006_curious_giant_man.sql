CREATE TABLE `chat_summary` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`chat_title` text,
	`last_timestamp` integer NOT NULL,
	`message_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_summary_last_timestamp` ON `chat_summary` (`last_timestamp`);
--> statement-breakpoint
INSERT INTO `chat_summary` (`chat_id`, `chat_title`, `last_timestamp`, `message_count`)
SELECT
  `chat_id`,
  MAX(`chat_title`),
  MAX(COALESCE(`telegram_timestamp`, `timestamp`)),
  COUNT(*)
FROM `messages`
GROUP BY `chat_id`;

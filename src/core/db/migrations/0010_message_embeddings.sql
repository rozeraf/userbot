CREATE TABLE `message_embeddings` (
  `message_db_id` integer PRIMARY KEY NOT NULL,
  `model` text NOT NULL,
  `dimensions` integer NOT NULL,
  `content_hash` text NOT NULL,
  `vector` blob NOT NULL,
  `embedded_at` integer NOT NULL,
  FOREIGN KEY (`message_db_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_message_embeddings_model` ON `message_embeddings` (`model`);
--> statement-breakpoint
CREATE TRIGGER `message_embeddings_ad` AFTER DELETE ON `messages` BEGIN
  DELETE FROM `message_embeddings` WHERE `message_db_id` = old.id;
END;--> statement-breakpoint
CREATE TRIGGER `message_embeddings_au` AFTER UPDATE OF `text` ON `messages` BEGIN
  DELETE FROM `message_embeddings` WHERE `message_db_id` = old.id;
END;

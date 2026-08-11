ALTER TABLE `messages` ADD `sender_username` text;--> statement-breakpoint
DROP TRIGGER `messages_fts_ai`;--> statement-breakpoint
DROP TRIGGER `messages_fts_ad`;--> statement-breakpoint
DROP TRIGGER `messages_fts_au`;--> statement-breakpoint
DROP TABLE `messages_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  `text`,
  `chat_title`,
  `sender_name`,
  `sender_username`,
  content=`messages`,
  content_rowid=`id`,
  tokenize='unicode61'
);--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `messages_fts`(rowid, text, chat_title, sender_name, sender_username)
  VALUES (new.id, new.text, new.chat_title, new.sender_name, new.sender_username);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, text, chat_title, sender_name, sender_username)
  VALUES ('delete', old.id, old.text, old.chat_title, old.sender_name, old.sender_username);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, text, chat_title, sender_name, sender_username)
  VALUES ('delete', old.id, old.text, old.chat_title, old.sender_name, old.sender_username);
  INSERT INTO `messages_fts`(rowid, text, chat_title, sender_name, sender_username)
  VALUES (new.id, new.text, new.chat_title, new.sender_name, new.sender_username);
END;--> statement-breakpoint
INSERT INTO `messages_fts`(`messages_fts`) VALUES ('rebuild');

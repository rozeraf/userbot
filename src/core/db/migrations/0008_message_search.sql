CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  `text`,
  `chat_title`,
  `sender_name`,
  content=`messages`,
  content_rowid=`id`,
  tokenize='unicode61'
);--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai` AFTER INSERT ON `messages` BEGIN
  INSERT INTO `messages_fts`(rowid, text, chat_title, sender_name)
  VALUES (new.id, new.text, new.chat_title, new.sender_name);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad` AFTER DELETE ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, text, chat_title, sender_name)
  VALUES ('delete', old.id, old.text, old.chat_title, old.sender_name);
END;--> statement-breakpoint
CREATE TRIGGER `messages_fts_au` AFTER UPDATE ON `messages` BEGIN
  INSERT INTO `messages_fts`(`messages_fts`, rowid, text, chat_title, sender_name)
  VALUES ('delete', old.id, old.text, old.chat_title, old.sender_name);
  INSERT INTO `messages_fts`(rowid, text, chat_title, sender_name)
  VALUES (new.id, new.text, new.chat_title, new.sender_name);
END;--> statement-breakpoint
INSERT INTO `messages_fts`(`messages_fts`) VALUES ('rebuild');

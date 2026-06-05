CREATE TABLE `china_nature_topics` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `topic_slug` varchar(64) NOT NULL,
  `title` varchar(128) NOT NULL,
  `icon` varchar(32) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_enabled` tinyint NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `china_nature_topics_id` PRIMARY KEY(`id`),
  CONSTRAINT `china_nature_topics_topic_slug_idx` UNIQUE(`topic_slug`)
);
--> statement-breakpoint
CREATE INDEX `china_nature_topics_sort_order_idx` ON `china_nature_topics` (`sort_order`);
--> statement-breakpoint
INSERT INTO `china_nature_topics` (`topic_slug`, `title`, `icon`, `sort_order`, `is_enabled`)
VALUES
  ('island', '海岛', '岛', 1, 1),
  ('karst', '喀斯特', '岩', 2, 1),
  ('yadan', '雅丹', '风', 3, 1)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `icon` = VALUES(`icon`);
